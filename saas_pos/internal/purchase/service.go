package purchase

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"saas_pos/internal/batch"
	"saas_pos/internal/counter"
	"saas_pos/internal/database"
	"saas_pos/internal/expense"
	"saas_pos/internal/price_history"
	"saas_pos/internal/supplier_product"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func col() *mongo.Collection {
	return database.Col("purchases")
}

func paymentCol() *mongo.Collection {
	return database.Col("purchase_payments")
}

func computeTotal(lines []PurchaseLine) float64 {
	total := 0.0
	for _, l := range lines {
		lineNet := l.Qty * l.PrixAchat * (1 - l.Remise/100)
		total += lineNet
	}
	return math.Round(total*100) / 100
}

// globalDiscountAmount returns the actual global discount value.
// remiseType "flat" means globalRemise is a fixed amount; otherwise it's a percentage.
func globalDiscountAmount(subtotalAfterLine, globalRemise float64, remiseType string) float64 {
	if globalRemise <= 0 {
		return 0
	}
	if remiseType == "flat" {
		if globalRemise > subtotalAfterLine {
			return subtotalAfterLine
		}
		return globalRemise
	}
	return subtotalAfterLine * globalRemise / 100
}

func subtotalAfterLineDiscounts(lines []PurchaseLine) float64 {
	s := 0.0
	for _, l := range lines {
		s += l.Qty * l.PrixAchat * (1 - l.Remise/100)
	}
	return s
}

// computeDiscountTotal returns the total discount amount (line discounts + global).
func computeDiscountTotal(lines []PurchaseLine, globalRemise float64, remiseType string) float64 {
	subtotalBefore := 0.0
	subtotalAfterLine := 0.0
	for _, l := range lines {
		lineBrut := l.Qty * l.PrixAchat
		subtotalBefore += lineBrut
		subtotalAfterLine += lineBrut * (1 - l.Remise/100)
	}
	lineDiscount := subtotalBefore - subtotalAfterLine
	gDiscount := globalDiscountAmount(subtotalAfterLine, globalRemise, remiseType)
	return math.Round((lineDiscount+gDiscount)*100) / 100
}

// computeFinalTotal returns total after line discounts, global discount, plus expenses.
func computeFinalTotal(lines []PurchaseLine, globalRemise float64, remiseType string, expensesTotal float64) float64 {
	sal := subtotalAfterLineDiscounts(lines)
	gDiscount := globalDiscountAmount(sal, globalRemise, remiseType)
	return math.Round((sal-gDiscount+expensesTotal)*100) / 100
}

func computeExpensesTotal(expenses []PurchaseExpense) float64 {
	total := 0.0
	for _, e := range expenses {
		total += e.Amount
	}
	return math.Round(total*100) / 100
}

func buildLines(tenantID primitive.ObjectID, inputs []LineInput) ([]PurchaseLine, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	lines := make([]PurchaseLine, 0, len(inputs))
	for _, li := range inputs {
		pid, err := primitive.ObjectIDFromHex(li.ProductID)
		if err != nil {
			return nil, errors.New("invalid product_id: " + li.ProductID)
		}
		if li.Qty <= 0 {
			return nil, errors.New("qty must be > 0")
		}

		var p struct {
			Name string `bson:"name"`
		}
		if err := database.Col("products").FindOne(ctx,
			bson.M{"_id": pid, "tenant_id": tenantID},
		).Decode(&p); err != nil {
			return nil, errors.New("product not found: " + li.ProductID)
		}

		remise := li.Remise
		if remise < 0 {
			remise = 0
		}
		if remise > 100 {
			remise = 100
		}

		lines = append(lines, PurchaseLine{
			ProductID:   pid,
			ProductName: p.Name,
			Qty:         li.Qty,
			ReceivedQty: 0,
			PrixAchat:   li.PrixAchat,
			Remise:      remise,
			PrixVente1:  li.PrixVente1,
			PrixVente2:  li.PrixVente2,
			PrixVente3:  li.PrixVente3,
			Lot:         li.Lot,
			ExpiryDate:  parseDate(li.ExpiryDate),
		})
	}
	return lines, nil
}

func buildExpenses(inputs []ExpenseInput) []PurchaseExpense {
	expenses := make([]PurchaseExpense, 0, len(inputs))
	for _, e := range inputs {
		if e.Label == "" || e.Amount <= 0 {
			continue
		}
		expenses = append(expenses, PurchaseExpense{Label: e.Label, Amount: e.Amount})
	}
	return expenses
}

func parseDate(s string) *time.Time {
	if s == "" {
		return nil
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return &t
	}
	return nil
}

func Create(tenantID, userID, userEmail string, input CreateInput) (*Purchase, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	sid, err := primitive.ObjectIDFromHex(input.SupplierID)
	if err != nil {
		return nil, errors.New("invalid supplier_id")
	}

	var sup struct {
		Name string `bson:"name"`
	}
	if err := database.Col("suppliers").FindOne(ctx,
		bson.M{"_id": sid, "tenant_id": tid},
	).Decode(&sup); err != nil {
		return nil, errors.New("supplier not found")
	}

	lines, err := buildLines(tid, input.Lines)
	if err != nil {
		return nil, err
	}

	expenses := buildExpenses(input.Expenses)
	expensesTotal := computeExpensesTotal(expenses)

	globalRemise := input.GlobalRemise
	if globalRemise < 0 {
		globalRemise = 0
	}
	remiseType := input.GlobalRemiseType
	if remiseType != "flat" {
		remiseType = "percent"
		if globalRemise > 100 {
			globalRemise = 100
		}
	}

	seq, _ := counter.Next(tenantID, "purchase")
	ref := fmt.Sprintf("ACH-%06d", seq)

	now := time.Now()
	p := Purchase{
		ID:               primitive.NewObjectID(),
		Ref:              ref,
		TenantID:         tid,
		SupplierID:       sid,
		SupplierName:     sup.Name,
		SupplierInvoice:  input.SupplierInvoice,
		ExpectedDelivery: parseDate(input.ExpectedDelivery),
		Status:           StatusDraft,
		Lines:            lines,
		Expenses:         expenses,
		Total:            computeFinalTotal(lines, globalRemise, remiseType, expensesTotal),
		GlobalRemise:      globalRemise,
		GlobalRemiseType:  remiseType,
		DiscountTotal:     computeDiscountTotal(lines, globalRemise, remiseType),
		ExpensesTotal:      expensesTotal,
		DistributeExpenses: input.DistributeExpenses,
		PaidAmount:         0,
		Note:               input.Note,
		CreatedBy:          userID,
		CreatedByEmail:     userEmail,
		CreatedAt:          now,
		UpdatedAt:          now,
	}

	if _, err = col().InsertOne(ctx, p); err != nil {
		return nil, err
	}
	return &p, nil
}

func List(tenantID, supplierID, status, q, dateFrom, dateTo string, page, limit int) (*ListResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	if limit < 1 || limit > 50 {
		limit = 10
	}
	if page < 1 {
		page = 1
	}
	skip := int64((page - 1) * limit)

	filter := bson.M{"tenant_id": tid}
	if supplierID != "" {
		if sid, err := primitive.ObjectIDFromHex(supplierID); err == nil {
			filter["supplier_id"] = sid
		}
	}
	if status != "" {
		filter["status"] = status
	}
	if q != "" {
		filter["$or"] = bson.A{
			bson.M{"supplier_name": bson.M{"$regex": q, "$options": "i"}},
			bson.M{"ref": bson.M{"$regex": q, "$options": "i"}},
			bson.M{"supplier_invoice": bson.M{"$regex": q, "$options": "i"}},
		}
	}
	if dateFrom != "" || dateTo != "" {
		dateFilter := bson.M{}
		if dateFrom != "" {
			if t, err := time.Parse("2006-01-02", dateFrom); err == nil {
				dateFilter["$gte"] = t
			}
		}
		if dateTo != "" {
			if t, err := time.Parse("2006-01-02", dateTo); err == nil {
				dateFilter["$lte"] = t.Add(24*time.Hour - time.Second)
			}
		}
		if len(dateFilter) > 0 {
			filter["created_at"] = dateFilter
		}
	}
	total, err := col().CountDocuments(ctx, filter)
	if err != nil {
		return nil, err
	}

	cursor, err := col().Find(ctx, filter,
		options.Find().
			SetSort(bson.M{"created_at": -1}).
			SetSkip(skip).
			SetLimit(int64(limit)).
			SetProjection(bson.M{"lines": 0}),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	items := []Purchase{}
	if err = cursor.All(ctx, &items); err != nil {
		return nil, err
	}

	pages := int(math.Ceil(float64(total) / float64(limit)))
	if pages == 0 {
		pages = 1
	}

	return &ListResult{Items: items, Total: total, Page: page, Limit: limit, Pages: pages}, nil
}

func GetByID(tenantID, id string) (*Purchase, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	var p Purchase
	if err = col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tid}).Decode(&p); err != nil {
		return nil, errors.New("purchase not found")
	}
	return &p, nil
}

func Update(tenantID, id string, input UpdateInput) (*Purchase, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	var existing Purchase
	if err := col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tid}).Decode(&existing); err != nil {
		return nil, errors.New("purchase not found")
	}
	if existing.Status != StatusDraft {
		return nil, errors.New("only draft purchases can be edited")
	}

	sid, err := primitive.ObjectIDFromHex(input.SupplierID)
	if err != nil {
		return nil, errors.New("invalid supplier_id")
	}

	var sup struct {
		Name string `bson:"name"`
	}
	if err := database.Col("suppliers").FindOne(ctx,
		bson.M{"_id": sid, "tenant_id": tid},
	).Decode(&sup); err != nil {
		return nil, errors.New("supplier not found")
	}

	lines, err := buildLines(tid, input.Lines)
	if err != nil {
		return nil, err
	}

	expenses := buildExpenses(input.Expenses)
	expensesTotal := computeExpensesTotal(expenses)

	globalRemise := input.GlobalRemise
	if globalRemise < 0 {
		globalRemise = 0
	}
	remiseType := input.GlobalRemiseType
	if remiseType != "flat" {
		remiseType = "percent"
		if globalRemise > 100 {
			globalRemise = 100
		}
	}

	after := options.After
	var p Purchase
	err = col().FindOneAndUpdate(ctx,
		bson.M{"_id": oid, "tenant_id": tid},
		bson.M{"$set": bson.M{
			"supplier_id":         sid,
			"supplier_name":       sup.Name,
			"supplier_invoice":    input.SupplierInvoice,
			"expected_delivery":   parseDate(input.ExpectedDelivery),
			"lines":               lines,
			"expenses":            expenses,
			"total":               computeFinalTotal(lines, globalRemise, remiseType, expensesTotal),
			"global_remise":       globalRemise,
			"global_remise_type":  remiseType,
			"discount_total":      computeDiscountTotal(lines, globalRemise, remiseType),
			"expenses_total":      expensesTotal,
			"distribute_expenses": input.DistributeExpenses,
			"note":                input.Note,
			"updated_at":          time.Now(),
		}},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&p)
	if err != nil {
		return nil, errors.New("purchase not found")
	}
	return &p, nil
}

// Validate commits stock changes. Supports partial validation via received quantities.
func Validate(tenantID, id, userID, userEmail string, input *ValidateInput) (*Purchase, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	var p Purchase
	if err := col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tid}).Decode(&p); err != nil {
		return nil, errors.New("purchase not found")
	}
	if p.Status != StatusDraft && p.Status != StatusPartiallyValidated {
		return nil, errors.New("purchase is already fully validated")
	}
	if len(p.Lines) == 0 {
		return nil, errors.New("purchase has no lines")
	}

	// Build a map of received quantities from input (partial validation)
	receivedMap := make(map[string]float64)
	if input != nil && len(input.Lines) > 0 {
		for _, vl := range input.Lines {
			receivedMap[vl.ProductID] = vl.ReceivedQty
		}
	}

	allFullyReceived := true
	updatedLines := make([]PurchaseLine, len(p.Lines))
	copy(updatedLines, p.Lines)

	for i, line := range updatedLines {
		remaining := line.Qty - line.ReceivedQty
		if remaining <= 0 {
			continue
		}

		// Determine how much to receive this time
		receiveNow := remaining
		if rq, ok := receivedMap[line.ProductID.Hex()]; ok {
			if rq < 0 {
				rq = 0
			}
			if rq > remaining {
				rq = remaining
			}
			receiveNow = rq
		}

		if receiveNow <= 0 {
			allFullyReceived = false
			continue
		}

		// Check if this line is still not fully received
		if line.ReceivedQty+receiveNow < line.Qty {
			allFullyReceived = false
		}

		// Calculate effective purchase price for stock entry (always reflects true cost)
		// Step 1: Line-level discount
		effectivePrixAchat := line.PrixAchat * (1 - line.Remise/100)

		// Step 2: Deduct global discount proportionally
		sal := subtotalAfterLineDiscounts(p.Lines)
		gda := globalDiscountAmount(sal, p.GlobalRemise, p.GlobalRemiseType)
		if gda > 0 && sal > 0 {
			lineNet := line.Qty * effectivePrixAchat
			lineDiscountShare := (lineNet / sal) * gda
			effectivePrixAchat = (lineNet - lineDiscountShare) / line.Qty
		}

		// Step 3: Add expenses proportionally (only when distribute_expenses is ON)
		if p.DistributeExpenses && p.ExpensesTotal > 0 {
			afterDiscount := sal - gda
			if afterDiscount > 0 {
				lineNet := line.Qty * effectivePrixAchat
				lineExpenseShare := (lineNet / afterDiscount) * p.ExpensesTotal
				effectivePrixAchat = (lineNet + lineExpenseShare) / line.Qty
			}
		}
		effectivePrixAchat = math.Round(effectivePrixAchat*100) / 100

		// Apply stock and price changes
		var product struct {
			QtyAvailable float64 `bson:"qty_available"`
			PrixAchat    float64 `bson:"prix_achat"`
		}
		if err := database.Col("products").FindOne(ctx,
			bson.M{"_id": line.ProductID, "tenant_id": tid},
		).Decode(&product); err != nil {
			return nil, errors.New("product not found: " + line.ProductID.Hex())
		}

		var newPrixAchat float64
		if product.QtyAvailable <= 0 {
			newPrixAchat = effectivePrixAchat
		} else {
			newPrixAchat = (product.QtyAvailable*product.PrixAchat + receiveNow*effectivePrixAchat) /
				(product.QtyAvailable + receiveNow)
		}

		set := bson.M{
			"qty_available": product.QtyAvailable + receiveNow,
			"prix_achat":    math.Round(newPrixAchat*100) / 100,
			"updated_at":    time.Now(),
		}
		if line.PrixVente1 > 0 {
			set["prix_vente_1"] = line.PrixVente1
		}
		if line.PrixVente2 > 0 {
			set["prix_vente_2"] = line.PrixVente2
		}
		if line.PrixVente3 > 0 {
			set["prix_vente_3"] = line.PrixVente3
		}

		if _, err := database.Col("products").UpdateOne(ctx,
			bson.M{"_id": line.ProductID, "tenant_id": tid},
			bson.M{"$set": set},
		); err != nil {
			return nil, err
		}

		updatedLines[i].ReceivedQty += receiveNow
		updatedLines[i].PrixAchat = effectivePrixAchat

		// Create batch record if lot number is provided
		if line.Lot != "" {
			batch.CreateFromPurchase(tenantID, line.ProductID, line.ProductName, line.Lot, line.ExpiryDate, receiveNow, effectivePrixAchat)
		}
	}

	// Add purchase total to supplier balance (only on first validation)
	if p.Status == StatusDraft {
		if _, err := database.Col("suppliers").UpdateOne(ctx,
			bson.M{"_id": p.SupplierID, "tenant_id": tid},
			bson.M{
				"$inc": bson.M{"balance": p.Total},
				"$set": bson.M{"updated_at": time.Now()},
			},
		); err != nil {
			return nil, err
		}
	}

	// Record price history and supplier-product links for validated lines
	for _, line := range updatedLines {
		if line.ReceivedQty > 0 {
			price_history.Record(tenantID, line.ProductID, line.ProductName, "purchase_validation", userID, userEmail,
				line.PrixAchat, line.PrixVente1, line.PrixVente2, line.PrixVente3)
			supplier_product.AutoLink(tenantID, p.SupplierID, line.ProductID, p.SupplierName, line.ProductName, line.PrixAchat)
		}
	}

	// When expenses are NOT distributed into unit price, create expense records
	if !p.DistributeExpenses && p.ExpensesTotal > 0 && p.Status == StatusDraft {
		today := time.Now().Format("2006-01-02")
		for _, exp := range p.Expenses {
			if exp.Amount <= 0 {
				continue
			}
			expense.Create(tenantID, expense.CreateInput{
				Label:    fmt.Sprintf("%s (%s)", exp.Label, p.Ref),
				Amount:   exp.Amount,
				DateFrom: today,
				DateTo:   today,
				Note:     fmt.Sprintf("Purchase %s", p.Ref),
			})
		}
	}

	// Determine new status
	newStatus := StatusValidated
	if !allFullyReceived {
		newStatus = StatusPartiallyValidated
	}

	now := time.Now()
	after := options.After
	var updated Purchase
	err = col().FindOneAndUpdate(ctx,
		bson.M{"_id": oid, "tenant_id": tid},
		bson.M{"$set": bson.M{
			"status":             newStatus,
			"lines":              updatedLines,
			"validated_at":       now,
			"validated_by":       userID,
			"validated_by_email": userEmail,
			"updated_at":         now,
		}},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&updated)
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

// PreviewValidation returns the before/after prices for each line without applying changes.
func PreviewValidation(tenantID, id string) ([]PricePreviewLine, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	var p Purchase
	if err := col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tid}).Decode(&p); err != nil {
		return nil, errors.New("purchase not found")
	}
	if p.Status != StatusDraft && p.Status != StatusPartiallyValidated {
		return nil, errors.New("purchase is already fully validated")
	}

	result := make([]PricePreviewLine, 0, len(p.Lines))
	for _, line := range p.Lines {
		remaining := line.Qty - line.ReceivedQty
		if remaining <= 0 {
			continue
		}

		var product struct {
			QtyAvailable float64 `bson:"qty_available"`
			PrixAchat    float64 `bson:"prix_achat"`
		}
		if err := database.Col("products").FindOne(ctx,
			bson.M{"_id": line.ProductID, "tenant_id": tid},
		).Decode(&product); err != nil {
			continue
		}

		// Compute effective price: line discount always, global discount + expenses only when distribute ON
		effectivePrice := line.PrixAchat * (1 - line.Remise/100)
		sal := subtotalAfterLineDiscounts(p.Lines)
		gda := globalDiscountAmount(sal, p.GlobalRemise, p.GlobalRemiseType)
		if gda > 0 && sal > 0 {
			lineNet := line.Qty * effectivePrice
			lineDiscountShare := (lineNet / sal) * gda
			effectivePrice = (lineNet - lineDiscountShare) / line.Qty
		}
		if p.DistributeExpenses && p.ExpensesTotal > 0 {
			afterDiscount := sal - gda
			if afterDiscount > 0 {
				lineNet := line.Qty * effectivePrice
				lineExpenseShare := (lineNet / afterDiscount) * p.ExpensesTotal
				effectivePrice = (lineNet + lineExpenseShare) / line.Qty
			}
		}
		effectivePrice = math.Round(effectivePrice*100) / 100

		var newPrixAchat float64
		if product.QtyAvailable <= 0 {
			newPrixAchat = effectivePrice
		} else {
			newPrixAchat = (product.QtyAvailable*product.PrixAchat + remaining*effectivePrice) /
				(product.QtyAvailable + remaining)
		}

		pl := PricePreviewLine{
			ProductID:    line.ProductID.Hex(),
			ProductName:  line.ProductName,
			CurrentQty:   product.QtyAvailable,
			CurrentPrix:  product.PrixAchat,
			IncomingQty:  remaining,
			IncomingPrix: effectivePrice,
			NewPrixAchat: math.Round(newPrixAchat*100) / 100,
		}
		if line.PrixVente1 > 0 {
			pl.NewPrixVente1 = line.PrixVente1
		}
		if line.PrixVente2 > 0 {
			pl.NewPrixVente2 = line.PrixVente2
		}
		if line.PrixVente3 > 0 {
			pl.NewPrixVente3 = line.PrixVente3
		}
		result = append(result, pl)
	}
	return result, nil
}

// Pay records a payment, subtracts from supplier balance, and stores payment history.
func Pay(tenantID, id, userID string, input PayInput) (*Purchase, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if input.Amount == 0 {
		return nil, errors.New("amount must not be zero")
	}

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	var p Purchase
	if err := col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tid}).Decode(&p); err != nil {
		return nil, errors.New("purchase not found")
	}
	if p.Status == StatusDraft {
		return nil, errors.New("validate the purchase before recording payment")
	}

	// For normal purchases, only positive payments; for returns (negative total), allow negative
	if p.Total >= 0 && input.Amount < 0 {
		return nil, errors.New("amount must be > 0 for regular purchases")
	}
	if p.Total < 0 && input.Amount > 0 {
		return nil, errors.New("amount must be < 0 for returns")
	}

	newPaid := math.Round((p.PaidAmount+input.Amount)*100) / 100
	newStatus := p.Status
	if p.Total >= 0 && newPaid >= p.Total {
		newStatus = StatusPaid
	} else if p.Total < 0 && newPaid <= p.Total {
		newStatus = StatusPaid
	}

	// Record payment in purchase_payments collection
	payment := PurchasePayment{
		ID:         primitive.NewObjectID(),
		TenantID:   tid,
		PurchaseID: oid,
		SupplierID: p.SupplierID,
		Amount:     input.Amount,
		Note:       input.Note,
		CreatedBy:  userID,
		CreatedAt:  time.Now(),
	}
	if _, err := paymentCol().InsertOne(ctx, payment); err != nil {
		return nil, err
	}

	// Subtract payment from supplier balance
	if _, err := database.Col("suppliers").UpdateOne(ctx,
		bson.M{"_id": p.SupplierID, "tenant_id": tid},
		bson.M{
			"$inc": bson.M{"balance": -input.Amount},
			"$set": bson.M{"updated_at": time.Now()},
		},
	); err != nil {
		return nil, err
	}

	after := options.After
	var updated Purchase
	err = col().FindOneAndUpdate(ctx,
		bson.M{"_id": oid, "tenant_id": tid},
		bson.M{"$set": bson.M{
			"paid_amount": newPaid,
			"status":      newStatus,
			"updated_at":  time.Now(),
		}},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&updated)
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

// ListPayments returns paginated payment history for a purchase.
func ListPayments(tenantID, purchaseID string, page, limit int) ([]PurchasePayment, int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	pid, err := primitive.ObjectIDFromHex(purchaseID)
	if err != nil {
		return nil, 0, errors.New("invalid purchase_id")
	}

	if limit <= 0 || limit > 10 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	filter := bson.M{"tenant_id": tid, "purchase_id": pid}
	total, _ := paymentCol().CountDocuments(ctx, filter)
	skip := int64((page - 1) * limit)

	cur, err := paymentCol().Find(ctx, filter,
		options.Find().
			SetSort(bson.M{"created_at": -1}).
			SetSkip(skip).
			SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, 0, err
	}
	defer cur.Close(ctx)

	var items []PurchasePayment
	cur.All(ctx, &items)
	if items == nil {
		items = []PurchasePayment{}
	}
	return items, total, nil
}

func Delete(tenantID, id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid id")
	}

	var p Purchase
	if err := col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tid}).Decode(&p); err != nil {
		return errors.New("purchase not found")
	}
	if p.Status != StatusDraft {
		return errors.New("only draft purchases can be deleted")
	}

	res, err := col().DeleteOne(ctx, bson.M{"_id": oid, "tenant_id": tid})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return errors.New("purchase not found")
	}
	return nil
}

// Duplicate creates a new draft purchase by cloning an existing one.
func Duplicate(tenantID, id, userID, userEmail string) (*Purchase, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	var original Purchase
	if err := col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tid}).Decode(&original); err != nil {
		return nil, errors.New("purchase not found")
	}

	// Reset received quantities
	lines := make([]PurchaseLine, len(original.Lines))
	for i, l := range original.Lines {
		lines[i] = l
		lines[i].ReceivedQty = 0
	}

	seq, _ := counter.Next(tenantID, "purchase")
	ref := fmt.Sprintf("ACH-%06d", seq)

	now := time.Now()
	p := Purchase{
		ID:              primitive.NewObjectID(),
		Ref:             ref,
		TenantID:        tid,
		SupplierID:      original.SupplierID,
		SupplierName:    original.SupplierName,
		SupplierInvoice: "",
		Status:          StatusDraft,
		Lines:              lines,
		Expenses:           original.Expenses,
		Total:              computeFinalTotal(lines, original.GlobalRemise, original.GlobalRemiseType, computeExpensesTotal(original.Expenses)),
		GlobalRemise:       original.GlobalRemise,
		GlobalRemiseType:   original.GlobalRemiseType,
		DiscountTotal:      computeDiscountTotal(lines, original.GlobalRemise, original.GlobalRemiseType),
		ExpensesTotal:      computeExpensesTotal(original.Expenses),
		DistributeExpenses: original.DistributeExpenses,
		PaidAmount:         0,
		Note:               original.Note,
		CreatedBy:       userID,
		CreatedByEmail:  userEmail,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	if _, err = col().InsertOne(ctx, p); err != nil {
		return nil, err
	}
	return &p, nil
}

// ReturnableLine shows how much of each product can still be returned.
type ReturnableLine struct {
	ProductID   string  `json:"product_id"`
	ProductName string  `json:"product_name"`
	ReceivedQty float64 `json:"received_qty"`
	ReturnedQty float64 `json:"returned_qty"`
	Returnable  float64 `json:"returnable"`
}

// GetReturnableLines returns per-line returnable quantities for a purchase.
func GetReturnableLines(tenantID, id string) ([]ReturnableLine, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	var p Purchase
	if err := col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tid}).Decode(&p); err != nil {
		return nil, errors.New("purchase not found")
	}

	// Sum already-returned quantities from existing returns
	alreadyReturned := make(map[string]float64)
	retCursor, retErr := col().Find(ctx, bson.M{
		"tenant_id": tid,
		"note":      fmt.Sprintf("Return for %s", p.Ref),
		"ref":       bson.M{"$regex": "^RET-"},
	})
	if retErr == nil {
		defer retCursor.Close(ctx)
		var existingReturns []Purchase
		retCursor.All(ctx, &existingReturns)
		for _, ret := range existingReturns {
			for _, rl := range ret.Lines {
				alreadyReturned[rl.ProductID.Hex()] += rl.Qty
			}
		}
	}

	result := make([]ReturnableLine, 0, len(p.Lines))
	for _, line := range p.Lines {
		returned := alreadyReturned[line.ProductID.Hex()]
		returnable := line.ReceivedQty - returned
		if returnable < 0 {
			returnable = 0
		}
		result = append(result, ReturnableLine{
			ProductID:   line.ProductID.Hex(),
			ProductName: line.ProductName,
			ReceivedQty: line.ReceivedQty,
			ReturnedQty: returned,
			Returnable:  returnable,
		})
	}
	return result, nil
}

// Return creates a return (avoir) that reverses stock for validated/paid purchases.
func Return(tenantID, id, userID, userEmail string, returnLines []ValidateLineInput) (*Purchase, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	var original Purchase
	if err := col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tid}).Decode(&original); err != nil {
		return nil, errors.New("purchase not found")
	}
	if original.Status != StatusValidated && original.Status != StatusPaid && original.Status != StatusPartiallyValidated {
		return nil, errors.New("can only return validated or paid purchases")
	}

	// Prevent creating a return from a return
	if strings.HasPrefix(original.Ref, "RET-") {
		return nil, errors.New("cannot create a return from a return")
	}

	// Find all existing returns for this purchase to calculate already-returned quantities
	alreadyReturned := make(map[string]float64)
	retCursor, retErr := col().Find(ctx, bson.M{
		"tenant_id": tid,
		"note":      fmt.Sprintf("Return for %s", original.Ref),
		"ref":       bson.M{"$regex": "^RET-"},
	})
	if retErr == nil {
		defer retCursor.Close(ctx)
		var existingReturns []Purchase
		retCursor.All(ctx, &existingReturns)
		for _, ret := range existingReturns {
			for _, rl := range ret.Lines {
				alreadyReturned[rl.ProductID.Hex()] += rl.Qty
			}
		}
	}

	// Build return lines map
	returnMap := make(map[string]float64)
	for _, rl := range returnLines {
		if rl.ReceivedQty > 0 {
			returnMap[rl.ProductID] = rl.ReceivedQty
		}
	}

	if len(returnMap) == 0 {
		return nil, errors.New("no return quantities specified")
	}

	// Build return purchase lines and reverse stock
	var returnPurchaseLines []PurchaseLine
	var returnTotal float64

	for _, line := range original.Lines {
		returnQty, ok := returnMap[line.ProductID.Hex()]
		if !ok || returnQty <= 0 {
			continue
		}
		// Max returnable = received - already returned in previous returns
		maxReturnable := line.ReceivedQty - alreadyReturned[line.ProductID.Hex()]
		if maxReturnable <= 0 {
			continue
		}
		if returnQty > maxReturnable {
			returnQty = maxReturnable
		}

		// Decrement stock
		if _, err := database.Col("products").UpdateOne(ctx,
			bson.M{"_id": line.ProductID, "tenant_id": tid},
			bson.M{
				"$inc": bson.M{"qty_available": -returnQty},
				"$set": bson.M{"updated_at": time.Now()},
			},
		); err != nil {
			return nil, err
		}

		lineTotal := returnQty * line.PrixAchat
		returnTotal += lineTotal
		returnPurchaseLines = append(returnPurchaseLines, PurchaseLine{
			ProductID:   line.ProductID,
			ProductName: line.ProductName,
			Qty:         returnQty,
			ReceivedQty: returnQty,
			PrixAchat:   line.PrixAchat,
		})
	}

	returnTotal = math.Round(returnTotal*100) / 100

	// Subtract return amount from supplier balance
	if _, err := database.Col("suppliers").UpdateOne(ctx,
		bson.M{"_id": original.SupplierID, "tenant_id": tid},
		bson.M{
			"$inc": bson.M{"balance": -returnTotal},
			"$set": bson.M{"updated_at": time.Now()},
		},
	); err != nil {
		return nil, err
	}

	seq, _ := counter.Next(tenantID, "purchase_return")
	ref := fmt.Sprintf("RET-%06d", seq)

	now := time.Now()
	retPurchase := Purchase{
		ID:               primitive.NewObjectID(),
		Ref:              ref,
		TenantID:         tid,
		SupplierID:       original.SupplierID,
		SupplierName:     original.SupplierName,
		SupplierInvoice:  original.SupplierInvoice,
		Status:           StatusValidated,
		Lines:            returnPurchaseLines,
		Total:            -returnTotal,
		PaidAmount:       0,
		Note:             fmt.Sprintf("Return for %s", original.Ref),
		CreatedBy:        userID,
		CreatedByEmail:   userEmail,
		ValidatedBy:      userID,
		ValidatedByEmail: userEmail,
		CreatedAt:        now,
		UpdatedAt:        now,
		ValidatedAt:      &now,
	}

	if _, err = col().InsertOne(ctx, retPurchase); err != nil {
		return nil, err
	}
	return &retPurchase, nil
}

// LowStockProducts returns products below their minimum stock threshold.
func LowStockProducts(tenantID string, limit int) ([]LowStockProduct, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	if limit <= 0 || limit > 100 {
		limit = 50
	}

	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"tenant_id":  tid,
			"is_service": bson.M{"$ne": true},
			"$expr":      bson.M{"$lte": bson.A{"$qty_available", "$qty_min"}},
		}}},
		{{Key: "$sort", Value: bson.M{"qty_available": 1}}},
		{{Key: "$limit", Value: limit}},
		{{Key: "$project", Value: bson.M{
			"name":          1,
			"barcodes":      1,
			"qty_available": 1,
			"qty_min":       1,
			"prix_achat":    1,
			"prix_vente_1":  1,
		}}},
	}

	cur, err := database.Col("products").Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	type row struct {
		ID           primitive.ObjectID `bson:"_id"`
		Name         string             `bson:"name"`
		Barcodes     []string           `bson:"barcodes"`
		QtyAvailable float64            `bson:"qty_available"`
		QtyMin       float64            `bson:"qty_min"`
		PrixAchat    float64            `bson:"prix_achat"`
		PrixVente1   float64            `bson:"prix_vente_1"`
	}
	var rows []row
	cur.All(ctx, &rows)

	result := make([]LowStockProduct, 0, len(rows))
	for _, r := range rows {
		result = append(result, LowStockProduct{
			ID:           r.ID.Hex(),
			Name:         r.Name,
			Barcodes:     r.Barcodes,
			QtyAvailable: r.QtyAvailable,
			QtyMin:       r.QtyMin,
			PrixAchat:    r.PrixAchat,
			PrixVente1:   r.PrixVente1,
		})
	}
	return result, nil
}

// Stats returns aggregated purchase metrics for a date range.
func Stats(tenantID string, from, to time.Time) (*PurchaseStats, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	filter := bson.M{
		"tenant_id":  tid,
		"created_at": bson.M{"$gte": from, "$lte": to},
	}

	// Aggregate by status
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: filter}},
		{{Key: "$group", Value: bson.M{
			"_id":            "$status",
			"count":          bson.M{"$sum": 1},
			"total_amount":   bson.M{"$sum": "$total"},
			"total_paid":     bson.M{"$sum": "$paid_amount"},
			"total_expenses": bson.M{"$sum": "$expenses_total"},
		}}},
	}

	cur, err := col().Aggregate(ctx, pipeline)
	if err != nil {
		return &PurchaseStats{ByStatus: map[string]StatusStats{}}, nil
	}
	defer cur.Close(ctx)

	type statusRow struct {
		Status        string  `bson:"_id"`
		Count         int64   `bson:"count"`
		TotalAmount   float64 `bson:"total_amount"`
		TotalPaid     float64 `bson:"total_paid"`
		TotalExpenses float64 `bson:"total_expenses"`
	}
	var rows []statusRow
	cur.All(ctx, &rows)

	result := &PurchaseStats{
		ByStatus: make(map[string]StatusStats),
	}
	for _, r := range rows {
		result.Count += r.Count
		result.TotalAmount += r.TotalAmount
		result.TotalPaid += r.TotalPaid
		result.TotalExpenses += r.TotalExpenses
		result.ByStatus[r.Status] = StatusStats{Count: r.Count, Amount: r.TotalAmount}
	}
	result.TotalAmount = math.Round(result.TotalAmount*100) / 100
	result.TotalPaid = math.Round(result.TotalPaid*100) / 100
	result.TotalRemaining = math.Round((result.TotalAmount-result.TotalPaid)*100) / 100
	result.TotalExpenses = math.Round(result.TotalExpenses*100) / 100

	// Top suppliers
	topPipeline := mongo.Pipeline{
		{{Key: "$match", Value: filter}},
		{{Key: "$group", Value: bson.M{
			"_id":           "$supplier_id",
			"supplier_name": bson.M{"$first": "$supplier_name"},
			"count":         bson.M{"$sum": 1},
			"amount":        bson.M{"$sum": "$total"},
		}}},
		{{Key: "$sort", Value: bson.M{"amount": -1}}},
		{{Key: "$limit", Value: 10}},
	}

	topCur, err := col().Aggregate(ctx, topPipeline)
	if err == nil {
		defer topCur.Close(ctx)
		type topRow struct {
			SupplierID   primitive.ObjectID `bson:"_id"`
			SupplierName string             `bson:"supplier_name"`
			Count        int64              `bson:"count"`
			Amount       float64            `bson:"amount"`
		}
		var topRows []topRow
		topCur.All(ctx, &topRows)
		for _, r := range topRows {
			result.TopSuppliers = append(result.TopSuppliers, SupplierStats{
				SupplierID:   r.SupplierID.Hex(),
				SupplierName: r.SupplierName,
				Count:        r.Count,
				Amount:       math.Round(r.Amount*100) / 100,
			})
		}
	}
	if result.TopSuppliers == nil {
		result.TopSuppliers = []SupplierStats{}
	}

	return result, nil
}
