package sale_return

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"saas_pos/internal/caisse"
	"saas_pos/internal/counter"
	"saas_pos/internal/database"
	salePkg "saas_pos/internal/sale"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func col() *mongo.Collection        { return database.Col("sale_returns") }
func saleCol() *mongo.Collection    { return database.Col("sales") }
func productCol() *mongo.Collection { return database.Col("products") }

// Create creates a sale return linked to an original sale.
func Create(tenantID, cashierID, cashierEmail, saleID string, input CreateInput) (*SaleReturn, error) {
	if len(input.Lines) == 0 {
		return nil, errors.New("return must have at least one line")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	oid, err := primitive.ObjectIDFromHex(saleID)
	if err != nil {
		return nil, errors.New("invalid sale_id")
	}

	// Load original sale
	type saleLine struct {
		ProductID   primitive.ObjectID `bson:"product_id"`
		ProductName string             `bson:"product_name"`
		Barcode     string             `bson:"barcode"`
		Qty         float64            `bson:"qty"`
		UnitPrice   float64            `bson:"unit_price"`
		PrixAchat   float64            `bson:"prix_achat"`
		VAT         int                `bson:"vat"`
	}
	type saleDoc struct {
		ID         primitive.ObjectID `bson:"_id"`
		TenantID   string             `bson:"tenant_id"`
		Ref        string             `bson:"ref"`
		Lines      []saleLine         `bson:"lines"`
		ClientID   string             `bson:"client_id"`
		SaleType   string             `bson:"sale_type"`
	}

	var sale saleDoc
	if err := saleCol().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tenantID}).Decode(&sale); err != nil {
		return nil, errors.New("sale not found")
	}

	// Build sold qty map from original sale
	soldQty := make(map[string]float64)
	saleLineMap := make(map[string]saleLine)
	for _, sl := range sale.Lines {
		key := sl.ProductID.Hex()
		if sl.Qty > 0 { // only count positive lines as sold
			soldQty[key] += sl.Qty
		}
		saleLineMap[key] = sl
	}

	// Sum already-returned quantities from previous returns on this sale
	alreadyReturned := make(map[string]float64)
	retCur, err := col().Find(ctx, bson.M{
		"tenant_id":        tenantID,
		"original_sale_id": oid,
	})
	if err == nil {
		defer retCur.Close(ctx)
		var existing []SaleReturn
		retCur.All(ctx, &existing)
		for _, r := range existing {
			for _, rl := range r.Lines {
				alreadyReturned[rl.ProductID.Hex()] += rl.Qty
			}
		}
	}

	// Build return lines
	var lines []ReturnLine
	var totalReturn float64

	for _, li := range input.Lines {
		if li.Qty <= 0 {
			return nil, errors.New("return qty must be positive")
		}
		sl, ok := saleLineMap[li.ProductID]
		if !ok {
			return nil, fmt.Errorf("product %s not found in original sale", li.ProductID)
		}

		maxReturnable := soldQty[li.ProductID] - alreadyReturned[li.ProductID]
		if li.Qty > maxReturnable {
			return nil, fmt.Errorf("cannot return more than %.2f of %s", maxReturnable, sl.ProductName)
		}

		lineHT := li.Qty * sl.UnitPrice
		vatAmt := lineHT * float64(sl.VAT) / 100
		lineTTC := lineHT + vatAmt
		totalReturn += lineTTC

		lines = append(lines, ReturnLine{
			ProductID:   sl.ProductID,
			ProductName: sl.ProductName,
			Barcode:     sl.Barcode,
			Qty:         li.Qty,
			UnitPrice:   sl.UnitPrice,
			PrixAchat:   sl.PrixAchat,
			Reason:      li.Reason,
			TotalHT:     math.Round(lineHT*100) / 100,
			TotalTTC:    math.Round(lineTTC*100) / 100,
			VAT:         sl.VAT,
		})
		// Stock is restored by the negative sale created below
	}

	seq, _ := counter.Next(tenantID, "sale_return")
	ref := fmt.Sprintf("RET-%06d", seq)

	ret := &SaleReturn{
		ID:              primitive.NewObjectID(),
		TenantID:        tenantID,
		Ref:             ref,
		OriginalSaleID:  oid,
		OriginalSaleRef: sale.Ref,
		Lines:           lines,
		Total:           -math.Round(totalReturn*100) / 100,
		CashierID:       cashierID,
		CashierEmail:    cashierEmail,
		CreatedAt:       time.Now(),
	}

	if _, err := col().InsertOne(ctx, ret); err != nil {
		return nil, err
	}

	// Client balance and stock are handled by the negative sale below

	// Create a negative sale so the return appears in statistics
	// If caisse is open, link to session. If closed, just record in daily stats.
	caisseID := ""
	if sess, err := caisse.GetCurrent(tenantID, cashierID); err == nil && sess != nil {
		caisseID = sess.ID.Hex()
	}

	var returnSaleLines []salePkg.SaleLineInput
	for _, rl := range lines {
		returnSaleLines = append(returnSaleLines, salePkg.SaleLineInput{
			ProductID: rl.ProductID.Hex(),
			Qty:       -rl.Qty,
			UnitPrice: rl.UnitPrice,
			Discount:  0,
		})
	}
	_, _ = salePkg.Create(tenantID, cashierID, cashierEmail, salePkg.CreateInput{
		Lines:         returnSaleLines,
		PaymentMethod: "cash",
		AmountPaid:    0,
		ClientID:      sale.ClientID,
		SaleType:      sale.SaleType,
		CaisseID:      caisseID,
	})

	return ret, nil
}

// List returns paginated sale returns.
func List(tenantID string, from, to time.Time, page, limit int) (*ListResult, error) {
	if limit <= 0 || limit > 10 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"tenant_id":  tenantID,
		"created_at": bson.M{"$gte": from, "$lte": to},
	}

	total, _ := col().CountDocuments(ctx, filter)
	skip := int64((page - 1) * limit)
	opts := options.Find().
		SetSort(bson.M{"created_at": -1}).
		SetSkip(skip).
		SetLimit(int64(limit))

	cur, err := col().Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var items []SaleReturn
	if err := cur.All(ctx, &items); err != nil {
		return nil, err
	}
	if items == nil {
		items = []SaleReturn{}
	}
	return &ListResult{Items: items, Total: total}, nil
}
