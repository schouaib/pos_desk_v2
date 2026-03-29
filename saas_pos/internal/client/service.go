package client

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"saas_pos/internal/counter"
	"saas_pos/internal/database"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func col() *mongo.Collection         { return database.Col("clients") }
func paymentCol() *mongo.Collection  { return database.Col("client_payments") }

// Create adds a new client for the given tenant.
func Create(tenantID string, input ClientInput) (*Client, error) {
	if input.Name == "" {
		return nil, errors.New("name is required")
	}

	seq, _ := counter.Next(tenantID, "client")
	code := fmt.Sprintf("CLT-%06d", seq)

	now := time.Now()
	c := &Client{
		ID:        primitive.NewObjectID(),
		TenantID:  tenantID,
		Code:      code,
		Name:      input.Name,
		Phone:     input.Phone,
		Email:     input.Email,
		Address:   input.Address,
		RC:        input.RC,
		NIF:       input.NIF,
		NIS:       input.NIS,
		NART:      input.NART,
		CompteRIB: input.CompteRIB,
		Balance:   0,
		CreatedAt: now,
		UpdatedAt: now,
	}

	_, err := col().InsertOne(context.Background(), c)
	return c, err
}

// List returns paginated clients for a tenant, with optional name/code search.
func List(tenantID, q string, page, limit int) (*ListResult, error) {
	if limit <= 0 || limit > 10 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	filter := bson.M{"tenant_id": tenantID, "archived": bson.M{"$ne": true}}
	if q != "" {
		filter["$or"] = bson.A{
			bson.M{"name": bson.M{"$regex": q, "$options": "i"}},
			bson.M{"code": bson.M{"$regex": q, "$options": "i"}},
			bson.M{"phone": bson.M{"$regex": q, "$options": "i"}},
		}
	}

	ctx := context.Background()
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

	var items []Client
	if err := cur.All(ctx, &items); err != nil {
		return nil, err
	}
	if items == nil {
		items = []Client{}
	}
	return &ListResult{Items: items, Total: total}, nil
}

// GetByID returns a single client belonging to the given tenant.
func GetByID(tenantID, id string) (*Client, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid client id")
	}
	var c Client
	err = col().FindOne(context.Background(), bson.M{"_id": oid, "tenant_id": tenantID}).Decode(&c)
	if err != nil {
		return nil, errors.New("client not found")
	}
	return &c, nil
}

// Update modifies the editable fields of a client.
func Update(tenantID, id string, input ClientInput) (*Client, error) {
	if input.Name == "" {
		return nil, errors.New("name is required")
	}
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid client id")
	}

	now := time.Now()
	update := bson.M{"$set": bson.M{
		"name":       input.Name,
		"phone":      input.Phone,
		"email":      input.Email,
		"address":    input.Address,
		"rc":         input.RC,
		"nif":        input.NIF,
		"nis":        input.NIS,
		"nart":       input.NART,
		"compte_rib": input.CompteRIB,
		"updated_at": now,
	}}

	after := options.After
	var c Client
	err = col().FindOneAndUpdate(
		context.Background(),
		bson.M{"_id": oid, "tenant_id": tenantID},
		update,
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&c)
	if err != nil {
		return nil, errors.New("client not found")
	}
	return &c, nil
}

// Delete removes a client or archives it if it has sales history.
func Delete(tenantID, id string) (bool, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return false, errors.New("invalid client id")
	}
	ctx := context.Background()
	var c Client
	err = col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tenantID}).Decode(&c)
	if err != nil {
		return false, errors.New("client not found")
	}
	if c.Balance > 0 {
		return false, errors.New("cannot delete client with outstanding balance")
	}
	cnt, _ := database.Col("sales").CountDocuments(ctx, bson.M{"tenant_id": tenantID, "client_id": id})
	if cnt > 0 {
		now := time.Now()
		_, err = col().UpdateOne(ctx, bson.M{"_id": oid, "tenant_id": tenantID},
			bson.M{"$set": bson.M{"archived": true, "archived_at": now, "updated_at": now}})
		return true, err
	}
	_, err = col().DeleteOne(ctx, bson.M{"_id": oid, "tenant_id": tenantID})
	return false, err
}

// ListArchived returns only archived clients.
func ListArchived(tenantID, q string, page, limit int) (*ListResult, error) {
	if limit <= 0 || limit > 50 {
		limit = 50
	}
	if page <= 0 {
		page = 1
	}
	ctx := context.Background()
	filter := bson.M{"tenant_id": tenantID, "archived": true}
	if q != "" {
		filter["$or"] = bson.A{
			bson.M{"name": bson.M{"$regex": q, "$options": "i"}},
			bson.M{"phone": bson.M{"$regex": q, "$options": "i"}},
		}
	}
	total, _ := col().CountDocuments(ctx, filter)
	skip := int64((page - 1) * limit)
	cur, err := col().Find(ctx, filter,
		options.Find().SetSort(bson.M{"archived_at": -1}).SetSkip(skip).SetLimit(int64(limit)))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	items := []Client{}
	if err := cur.All(ctx, &items); err != nil {
		return nil, err
	}
	return &ListResult{Items: items, Total: total}, nil
}

// Unarchive restores an archived client.
func Unarchive(tenantID, id string) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid client id")
	}
	_, err = col().UpdateOne(context.Background(),
		bson.M{"_id": oid, "tenant_id": tenantID},
		bson.M{"$set": bson.M{"archived": false, "updated_at": time.Now()}, "$unset": bson.M{"archived_at": ""}})
	return err
}

// AdjustBalance adds delta to the client's balance (positive = increases debt, negative = reduces debt).
// This is called internally by the sale and payment flows.
func AdjustBalance(tenantID, clientID string, delta float64) error {
	oid, err := primitive.ObjectIDFromHex(clientID)
	if err != nil {
		return errors.New("invalid client id")
	}
	delta = math.Round(delta*100) / 100
	_, err = col().UpdateOne(
		context.Background(),
		bson.M{"_id": oid, "tenant_id": tenantID},
		bson.M{
			"$inc": bson.M{"balance": delta},
			"$set": bson.M{"updated_at": time.Now()},
		},
	)
	return err
}

// AddPayment records a payment installment and decrements the client's balance.
func AddPayment(tenantID, clientID string, input PaymentInput) (*Payment, error) {
	if input.Amount <= 0 {
		return nil, errors.New("amount must be positive")
	}

	// Verify client exists and belongs to tenant
	if _, err := GetByID(tenantID, clientID); err != nil {
		return nil, err
	}

	p := &Payment{
		ID:        primitive.NewObjectID(),
		TenantID:  tenantID,
		ClientID:  clientID,
		Amount:    math.Round(input.Amount*100) / 100,
		Note:      input.Note,
		CreatedAt: time.Now(),
	}

	if _, err := paymentCol().InsertOne(context.Background(), p); err != nil {
		return nil, err
	}

	// Decrement the balance
	if err := AdjustBalance(tenantID, clientID, -p.Amount); err != nil {
		return nil, err
	}

	// Apply payment to oldest unpaid factures (FIFO)
	applyPaymentToFactures(tenantID, clientID, p.Amount)

	// Apply payment to oldest unpaid credit sales (FIFO)
	applyPaymentToSales(tenantID, clientID, p.Amount)

	return p, nil
}

// RecordPayment inserts a payment record into client_payments for stats tracking,
// without adjusting client balance or applying to factures.
func RecordPayment(tenantID, clientID string, amount float64, note string) error {
	p := &Payment{
		ID:        primitive.NewObjectID(),
		TenantID:  tenantID,
		ClientID:  clientID,
		Amount:    math.Round(amount*100) / 100,
		Note:      note,
		CreatedAt: time.Now(),
	}
	_, err := paymentCol().InsertOne(context.Background(), p)
	return err
}

// applyPaymentToFactures distributes a client payment across unpaid factures (oldest first).
func applyPaymentToFactures(tenantID, clientID string, amount float64) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	factCol := database.Col("facturation_docs")

	// Find unpaid/partial factures for this client, oldest first
	cursor, err := factCol.Find(ctx, bson.M{
		"tenant_id": tenantID,
		"client_id": clientID,
		"doc_type":  "facture",
		"status":    bson.M{"$in": bson.A{"unpaid", "partial"}},
	}, options.Find().SetSort(bson.M{"created_at": 1}))
	if err != nil {
		return
	}
	defer cursor.Close(ctx)

	remaining := amount
	now := time.Now()

	for cursor.Next(ctx) && remaining > 0 {
		var doc struct {
			ID            primitive.ObjectID `bson:"_id"`
			Total         float64            `bson:"total"`
			PaidAmount    float64            `bson:"paid_amount"`
			Timbre        float64            `bson:"timbre"`
			PaymentMethod string             `bson:"payment_method"`
		}
		if err := cursor.Decode(&doc); err != nil {
			continue
		}

		owed := math.Round((doc.Total-doc.PaidAmount)*100) / 100
		if owed <= 0 {
			continue
		}

		apply := remaining
		if apply > owed {
			apply = owed
		}

		newPaid := math.Round((doc.PaidAmount+apply)*100) / 100
		newStatus := "partial"
		if newPaid >= doc.Total {
			newStatus = "paid"
			newPaid = doc.Total
		}

		// Calculate timbre for this payment (Art. 46 LF 2025)
		payMethod := doc.PaymentMethod
		if payMethod == "" {
			payMethod = "cash"
		}
		var payTimbre float64
		if payMethod == "cash" && apply > 300 {
			rate := 0.01
			if apply > 100000 {
				rate = 0.02
			} else if apply > 30000 {
				rate = 0.015
			}
			payTimbre = math.Max(5, math.Round(apply*rate*100)/100)
		}
		newTimbre := math.Round((doc.Timbre+payTimbre)*100) / 100

		factCol.UpdateOne(ctx,
			bson.M{"_id": doc.ID},
			bson.M{
				"$set": bson.M{
					"paid_amount": newPaid,
					"status":      newStatus,
					"timbre":      newTimbre,
					"updated_at":  now,
				},
				"$push": bson.M{
					"payments": bson.M{
						"amount":         apply,
						"payment_method": payMethod,
						"timbre":         payTimbre,
						"note":           "Client payment",
						"created_at":     now,
					},
				},
			},
		)

		remaining = math.Round((remaining-apply)*100) / 100
	}
}

// applyPaymentToSales distributes a client payment across unpaid credit sales (oldest first).
func applyPaymentToSales(tenantID, clientID string, amount float64) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	salesCol := database.Col("sales")

	// Find credit sales where amount_paid < total, oldest first
	cursor, err := salesCol.Find(ctx, bson.M{
		"tenant_id": tenantID,
		"client_id": clientID,
		"sale_type": "credit",
		"$expr":     bson.M{"$gt": bson.A{"$total", "$amount_paid"}},
	}, options.Find().SetSort(bson.M{"created_at": 1}))
	if err != nil {
		return
	}
	defer cursor.Close(ctx)

	remaining := amount

	for cursor.Next(ctx) && remaining > 0 {
		var s struct {
			ID         primitive.ObjectID `bson:"_id"`
			Total      float64            `bson:"total"`
			AmountPaid float64            `bson:"amount_paid"`
		}
		if err := cursor.Decode(&s); err != nil {
			continue
		}

		owed := math.Round((s.Total-s.AmountPaid)*100) / 100
		if owed <= 0 {
			continue
		}

		apply := remaining
		if apply > owed {
			apply = owed
		}

		newPaid := math.Round((s.AmountPaid+apply)*100) / 100
		newChange := 0.0
		if newPaid >= s.Total {
			newPaid = s.Total
			newChange = 0
		}

		salesCol.UpdateOne(ctx,
			bson.M{"_id": s.ID},
			bson.M{"$set": bson.M{
				"amount_paid": newPaid,
				"change":      newChange,
			}},
		)

		remaining = math.Round((remaining-apply)*100) / 100
	}
}

// GetStatement returns a merged chronological ledger of credit sales and payments
// for a client, with running balance computed from oldest to newest.
func GetStatement(tenantID, clientID string) ([]StatementEntry, error) {
	ctx := context.Background()

	// --- credit sales ---
	type saleLineDoc struct {
		ProductName string  `bson:"product_name"`
		Qty         float64 `bson:"qty"`
		UnitPrice   float64 `bson:"unit_price"`
		TotalTTC    float64 `bson:"total_ttc"`
	}
	type saleDoc struct {
		ID        primitive.ObjectID `bson:"_id"`
		Ref       string             `bson:"ref"`
		Total     float64            `bson:"total"`
		Lines     []saleLineDoc      `bson:"lines"`
		CreatedAt time.Time          `bson:"created_at"`
	}
	saleCur, err := database.Col("sales").Find(ctx,
		bson.M{"tenant_id": tenantID, "client_id": clientID, "sale_type": "credit"},
		options.Find().SetSort(bson.M{"created_at": 1}),
	)
	if err != nil {
		return nil, err
	}
	var sales []saleDoc
	saleCur.All(ctx, &sales)

	// --- payments ---
	type payDoc struct {
		ID        primitive.ObjectID `bson:"_id"`
		Amount    float64            `bson:"amount"`
		Note      string             `bson:"note"`
		CreatedAt time.Time          `bson:"created_at"`
	}
	payCur, err := paymentCol().Find(ctx,
		bson.M{"tenant_id": tenantID, "client_id": clientID},
		options.Find().SetSort(bson.M{"created_at": 1}),
	)
	if err != nil {
		return nil, err
	}
	var payments []payDoc
	payCur.All(ctx, &payments)

	// --- merge ---
	type raw struct {
		id     string
		typ    string
		date   time.Time
		amount float64
		ref    string
		lines  []StatementSaleLine
	}
	var entries []raw
	for _, s := range sales {
		var lines []StatementSaleLine
		for _, l := range s.Lines {
			lines = append(lines, StatementSaleLine{
				ProductName: l.ProductName,
				Qty:         l.Qty,
				UnitPrice:   l.UnitPrice,
				TotalTTC:    l.TotalTTC,
			})
		}
		entries = append(entries, raw{s.ID.Hex(), "sale", s.CreatedAt, math.Round(s.Total*100) / 100, s.Ref, lines})
	}
	for _, p := range payments {
		entries = append(entries, raw{p.ID.Hex(), "payment", p.CreatedAt, math.Round(p.Amount*100) / 100, p.Note, nil})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].date.Before(entries[j].date) })

	// --- running balance ---
	var running float64
	result := make([]StatementEntry, len(entries))
	for i, e := range entries {
		if e.typ == "sale" {
			running = math.Round((running+e.amount)*100) / 100
		} else {
			running = math.Round((running-e.amount)*100) / 100
		}
		result[i] = StatementEntry{ID: e.id, Type: e.typ, Date: e.date, Amount: e.amount, Ref: e.ref, Balance: running, Lines: e.lines}
	}

	if result == nil {
		result = []StatementEntry{}
	}
	return result, nil
}

// PaymentsSum returns the total amount of client payments received in the given date range.
func PaymentsSum(tenantID string, from, to time.Time) (float64, error) {
	ctx := context.Background()
	filter := bson.M{
		"tenant_id":  tenantID,
		"created_at": bson.M{"$gte": from, "$lte": to},
	}
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: filter}},
		{{Key: "$group", Value: bson.M{
			"_id":   nil,
			"total": bson.M{"$sum": "$amount"},
		}}},
	}
	cur, err := paymentCol().Aggregate(ctx, pipeline)
	if err != nil {
		return 0, err
	}
	defer cur.Close(ctx)
	var agg []struct{ Total float64 `bson:"total"` }
	if err := cur.All(ctx, &agg); err != nil {
		return 0, err
	}
	if len(agg) > 0 {
		return math.Round(agg[0].Total*100) / 100, nil
	}
	return 0, nil
}

// ListPayments returns paginated payments for a specific client.
func ListPayments(tenantID, clientID string, page, limit int) (*PaymentListResult, error) {
	if limit <= 0 || limit > 10 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	filter := bson.M{"tenant_id": tenantID, "client_id": clientID}
	ctx := context.Background()
	total, _ := paymentCol().CountDocuments(ctx, filter)
	skip := int64((page - 1) * limit)
	opts := options.Find().
		SetSort(bson.M{"created_at": -1}).
		SetSkip(skip).
		SetLimit(int64(limit))

	cur, err := paymentCol().Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var items []Payment
	if err := cur.All(ctx, &items); err != nil {
		return nil, err
	}
	if items == nil {
		items = []Payment{}
	}
	return &PaymentListResult{Items: items, Total: total}, nil
}
