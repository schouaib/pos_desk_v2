package supplier

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"saas_pos/internal/database"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func col() *mongo.Collection {
	return database.Col("suppliers")
}

func paymentCol() *mongo.Collection {
	return database.Col("supplier_payments")
}

func RecordPayment(tenantID, supplierID, supplierName string, amount float64, note, createdBy string) error {
	return RecordPaymentWithType(tenantID, supplierID, supplierName, amount, note, createdBy, "direct", "")
}

func RecordPaymentWithType(tenantID, supplierID, supplierName string, amount float64, note, createdBy, paymentType, purchaseRef string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	sid, _ := primitive.ObjectIDFromHex(supplierID)

	p := SupplierPayment{
		ID:           primitive.NewObjectID(),
		TenantID:     tid,
		SupplierID:   sid,
		SupplierName: supplierName,
		Type:         paymentType,
		PurchaseRef:  purchaseRef,
		Amount:       amount,
		Note:         note,
		CreatedBy:    createdBy,
		CreatedAt:    time.Now(),
	}
	_, err := paymentCol().InsertOne(ctx, p)
	return err
}

func ListPayments(tenantID, supplierID, dateFrom, dateTo string, page, limit int) (*PaymentListResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	sid, err := primitive.ObjectIDFromHex(supplierID)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	if limit < 1 || limit > 200 {
		limit = 10
	}
	if page < 1 {
		page = 1
	}

	filter := bson.M{"tenant_id": tid, "supplier_id": sid}
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

	// Fetch supplier_payments
	var supplierItems []SupplierPayment
	cursor, err := paymentCol().Find(ctx, filter,
		options.Find().SetSort(bson.M{"created_at": -1}),
	)
	if err != nil {
		return nil, err
	}
	if err = cursor.All(ctx, &supplierItems); err != nil {
		return nil, err
	}
	cursor.Close(ctx)

	// Also fetch purchase_payments that don't already have a matching supplier_payment
	// (for backwards compatibility with payments made before the dual-write fix)
	purchaseFilter := bson.M{"tenant_id": tid, "supplier_id": sid}
	if dateFilter, ok := filter["created_at"]; ok {
		purchaseFilter["created_at"] = dateFilter
	}

	type purchasePayment struct {
		ID         primitive.ObjectID `bson:"_id"`
		TenantID   primitive.ObjectID `bson:"tenant_id"`
		PurchaseID primitive.ObjectID `bson:"purchase_id"`
		SupplierID primitive.ObjectID `bson:"supplier_id"`
		Amount     float64            `bson:"amount"`
		Note       string             `bson:"note"`
		CreatedBy  string             `bson:"created_by"`
		CreatedAt  time.Time          `bson:"created_at"`
	}

	var purchasePayments []purchasePayment
	pcursor, err := database.Col("purchase_payments").Find(ctx, purchaseFilter,
		options.Find().SetSort(bson.M{"created_at": -1}),
	)
	if err == nil {
		_ = pcursor.All(ctx, &purchasePayments)
		pcursor.Close(ctx)
	}

	// Build a set of purchase_payment IDs that already have a supplier_payment (type=purchase)
	// to avoid duplicates from the dual-write
	existingPurchaseRefs := map[string]bool{}
	for _, sp := range supplierItems {
		if sp.Type == "purchase" && sp.PurchaseRef != "" {
			// Key by purchase_ref + created_by + approximate time to detect duplicates
			key := sp.PurchaseRef + "|" + fmt.Sprintf("%.2f", sp.Amount) + "|" + sp.CreatedBy
			existingPurchaseRefs[key] = true
		}
	}

	// Look up purchase refs for purchase_payments
	purchaseRefCache := map[primitive.ObjectID]string{}
	for _, pp := range purchasePayments {
		if _, ok := purchaseRefCache[pp.PurchaseID]; !ok {
			var doc struct {
				Ref string `bson:"ref"`
			}
			if err := database.Col("purchases").FindOne(ctx, bson.M{"_id": pp.PurchaseID}).Decode(&doc); err == nil {
				purchaseRefCache[pp.PurchaseID] = doc.Ref
			}
		}
	}

	// Resolve user IDs to emails for purchase_payments
	userEmailCache := map[string]string{}
	for _, pp := range purchasePayments {
		if _, ok := userEmailCache[pp.CreatedBy]; !ok {
			uid, uerr := primitive.ObjectIDFromHex(pp.CreatedBy)
			if uerr == nil {
				var u struct {
					Email string `bson:"email"`
				}
				if err := database.Col("users").FindOne(ctx, bson.M{"_id": uid}).Decode(&u); err == nil && u.Email != "" {
					userEmailCache[pp.CreatedBy] = u.Email
				}
			}
		}
	}

	// Merge purchase_payments that don't already exist as supplier_payments
	for _, pp := range purchasePayments {
		ref := purchaseRefCache[pp.PurchaseID]
		key := ref + "|" + fmt.Sprintf("%.2f", pp.Amount) + "|" + pp.CreatedBy
		if existingPurchaseRefs[key] {
			continue // already exists via dual-write
		}
		note := pp.Note
		if ref != "" {
			if note != "" {
				note = ref + " — " + note
			} else {
				note = ref
			}
		}
		createdBy := pp.CreatedBy
		if email, ok := userEmailCache[createdBy]; ok {
			createdBy = email
		}
		supplierItems = append(supplierItems, SupplierPayment{
			ID:          pp.ID,
			TenantID:    pp.TenantID,
			SupplierID:  pp.SupplierID,
			Type:        "purchase",
			PurchaseRef: ref,
			Amount:      pp.Amount,
			Note:        note,
			CreatedBy:   createdBy,
			CreatedAt:   pp.CreatedAt,
		})
	}

	// Sort merged list by created_at descending
	sort.Slice(supplierItems, func(i, j int) bool {
		return supplierItems[i].CreatedAt.After(supplierItems[j].CreatedAt)
	})

	// Paginate in-memory
	total := int64(len(supplierItems))
	skip := int64((page - 1) * limit)
	end := skip + int64(limit)
	if skip > total {
		skip = total
	}
	if end > total {
		end = total
	}
	items := supplierItems[skip:end]

	pages := int(math.Ceil(float64(total) / float64(limit)))
	if pages == 0 {
		pages = 1
	}
	return &PaymentListResult{Items: items, Total: total, Page: page, Limit: limit, Pages: pages}, nil
}

// ReversePayment marks a payment as reversed and records a negative reversal entry.
// It adds the original amount back to the supplier balance.
func ReversePayment(tenantID, supplierID, paymentID, reversedBy string) (*Supplier, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	sid, err := primitive.ObjectIDFromHex(supplierID)
	if err != nil {
		return nil, errors.New("invalid supplier id")
	}
	pid, err := primitive.ObjectIDFromHex(paymentID)
	if err != nil {
		return nil, errors.New("invalid payment id")
	}

	// Find the original payment — check supplier_payments first, then purchase_payments
	var original SupplierPayment
	var fromPurchase bool
	err = paymentCol().FindOne(ctx, bson.M{
		"_id":         pid,
		"tenant_id":   tid,
		"supplier_id": sid,
	}).Decode(&original)
	if err != nil {
		// Try purchase_payments collection
		type pp struct {
			ID         primitive.ObjectID `bson:"_id"`
			TenantID   primitive.ObjectID `bson:"tenant_id"`
			PurchaseID primitive.ObjectID `bson:"purchase_id"`
			SupplierID primitive.ObjectID `bson:"supplier_id"`
			Amount     float64            `bson:"amount"`
			Note       string             `bson:"note"`
			CreatedBy  string             `bson:"created_by"`
			CreatedAt  time.Time          `bson:"created_at"`
		}
		var purchPayment pp
		err2 := database.Col("purchase_payments").FindOne(ctx, bson.M{
			"_id":         pid,
			"tenant_id":   tid,
			"supplier_id": sid,
		}).Decode(&purchPayment)
		if err2 != nil {
			return nil, errors.New("payment not found")
		}
		// Look up purchase ref
		var purchDoc struct {
			Ref          string `bson:"ref"`
			SupplierName string `bson:"supplier_name"`
		}
		_ = database.Col("purchases").FindOne(ctx, bson.M{"_id": purchPayment.PurchaseID}).Decode(&purchDoc)

		original = SupplierPayment{
			ID:           purchPayment.ID,
			TenantID:     purchPayment.TenantID,
			SupplierID:   purchPayment.SupplierID,
			SupplierName: purchDoc.SupplierName,
			Type:         "purchase",
			PurchaseRef:  purchDoc.Ref,
			Amount:       purchPayment.Amount,
			Note:         purchPayment.Note,
			CreatedBy:    purchPayment.CreatedBy,
			CreatedAt:    purchPayment.CreatedAt,
		}
		fromPurchase = true
	}
	if original.Reversed {
		return nil, errors.New("payment already reversed")
	}
	if original.ReversalOf != nil {
		return nil, errors.New("cannot reverse a reversal entry")
	}

	now := time.Now()

	if fromPurchase {
		// For purchase payments: delete from purchase_payments and reverse in purchase
		_, _ = database.Col("purchase_payments").DeleteOne(ctx, bson.M{"_id": pid})
		// Subtract from purchase paid_amount
		_, _ = database.Col("purchases").UpdateOne(ctx,
			bson.M{"supplier_id": sid, "tenant_id": tid, "ref": original.PurchaseRef},
			bson.M{
				"$inc": bson.M{"paid_amount": -original.Amount},
				"$set": bson.M{"status": "validated", "updated_at": now},
			},
		)
	} else {
		// Mark original as reversed in supplier_payments
		_, err = paymentCol().UpdateOne(ctx, bson.M{"_id": pid}, bson.M{
			"$set": bson.M{
				"reversed":    true,
				"reversed_at": now,
				"reversed_by": reversedBy,
			},
		})
		if err != nil {
			return nil, err
		}
	}

	// Insert negative reversal entry in supplier_payments
	reversal := SupplierPayment{
		ID:           primitive.NewObjectID(),
		TenantID:     tid,
		SupplierID:   sid,
		SupplierName: original.SupplierName,
		Type:         original.Type,
		PurchaseRef:  original.PurchaseRef,
		Amount:       -original.Amount,
		Note:         original.Note,
		ReversalOf:   &pid,
		CreatedBy:    reversedBy,
		CreatedAt:    now,
	}
	if _, err = paymentCol().InsertOne(ctx, reversal); err != nil {
		return nil, err
	}

	// Add amount back to supplier balance
	after := options.After
	var s Supplier
	err = col().FindOneAndUpdate(ctx,
		bson.M{"_id": sid, "tenant_id": tid},
		bson.M{
			"$inc": bson.M{"balance": original.Amount},
			"$set": bson.M{"updated_at": now},
		},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&s)
	if err != nil {
		return nil, errors.New("supplier not found")
	}

	return &s, nil
}

func Create(tenantID string, input CreateInput) (*Supplier, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if input.Name == "" {
		return nil, errors.New("name is required")
	}

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	now := time.Now()
	s := Supplier{
		ID:        primitive.NewObjectID(),
		TenantID:  tid,
		Name:      input.Name,
		Phone:     input.Phone,
		Email:     input.Email,
		Address:   input.Address,
		RC:        input.RC,
		NIF:       input.NIF,
		NIS:       input.NIS,
		NART:      input.NART,
		CompteRIB: input.CompteRIB,
		Balance:   input.Balance,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if _, err = col().InsertOne(ctx, s); err != nil {
		return nil, err
	}
	return &s, nil
}

func List(tenantID, q string, page, limit int) (*ListResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	if limit < 1 || limit > 500 {
		limit = 500
	}
	if page < 1 {
		page = 1
	}
	skip := int64((page - 1) * limit)

	filter := bson.M{"tenant_id": tid, "archived": bson.M{"$ne": true}}
	if q != "" {
		filter["$or"] = bson.A{
			bson.M{"name": bson.M{"$regex": q, "$options": "i"}},
			bson.M{"phone": bson.M{"$regex": q, "$options": "i"}},
			bson.M{"address": bson.M{"$regex": q, "$options": "i"}},
		}
	}

	total, err := col().CountDocuments(ctx, filter)
	if err != nil {
		return nil, err
	}

	cursor, err := col().Find(ctx, filter,
		options.Find().
			SetSort(bson.M{"name": 1}).
			SetSkip(skip).
			SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	items := []Supplier{}
	if err = cursor.All(ctx, &items); err != nil {
		return nil, err
	}

	pages := int(math.Ceil(float64(total) / float64(limit)))
	if pages == 0 {
		pages = 1
	}

	return &ListResult{Items: items, Total: total, Page: page, Limit: limit, Pages: pages}, nil
}

func GetByID(tenantID, id string) (*Supplier, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	var s Supplier
	if err = col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tid}).Decode(&s); err != nil {
		return nil, errors.New("supplier not found")
	}
	return &s, nil
}

func Update(tenantID, id string, input UpdateInput) (*Supplier, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if input.Name == "" {
		return nil, errors.New("name is required")
	}

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	after := options.After
	var s Supplier
	err = col().FindOneAndUpdate(ctx,
		bson.M{"_id": oid, "tenant_id": tid},
		bson.M{"$set": bson.M{
			"name":       input.Name,
			"phone":      input.Phone,
			"email":      input.Email,
			"address":    input.Address,
			"rc":         input.RC,
			"nif":        input.NIF,
			"nis":        input.NIS,
			"nart":       input.NART,
			"compte_rib": input.CompteRIB,
			"updated_at": time.Now(),
		}},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&s)
	if err != nil {
		return nil, errors.New("supplier not found")
	}
	return &s, nil
}

func Delete(tenantID, id string) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return false, errors.New("invalid id")
	}

	cnt, _ := database.Col("purchases").CountDocuments(ctx, bson.M{"tenant_id": tid, "supplier_id": oid})
	if cnt > 0 {
		now := time.Now()
		_, err = col().UpdateOne(ctx, bson.M{"_id": oid, "tenant_id": tid},
			bson.M{"$set": bson.M{"archived": true, "archived_at": now, "updated_at": now}})
		return true, err
	}

	res, err := col().DeleteOne(ctx, bson.M{"_id": oid, "tenant_id": tid})
	if err != nil {
		return false, err
	}
	if res.DeletedCount == 0 {
		return false, errors.New("supplier not found")
	}
	return false, nil
}

// ListArchived returns only archived suppliers.
func ListArchived(tenantID, q string, page, limit int) (*ListResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	if limit < 1 || limit > 500 {
		limit = 500
	}
	if page < 1 {
		page = 1
	}
	skip := int64((page - 1) * limit)
	filter := bson.M{"tenant_id": tid, "archived": true}
	if q != "" {
		filter["$or"] = bson.A{
			bson.M{"name": bson.M{"$regex": q, "$options": "i"}},
			bson.M{"phone": bson.M{"$regex": q, "$options": "i"}},
		}
	}
	total, _ := col().CountDocuments(ctx, filter)
	cur, err := col().Find(ctx, filter,
		options.Find().SetSort(bson.M{"archived_at": -1}).SetSkip(skip).SetLimit(int64(limit)))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	items := []Supplier{}
	if err := cur.All(ctx, &items); err != nil {
		return nil, err
	}
	pages := int(math.Ceil(float64(total) / float64(limit)))
	if pages == 0 {
		pages = 1
	}
	return &ListResult{Items: items, Total: total, Page: page, Limit: limit, Pages: pages}, nil
}

// Unarchive restores an archived supplier.
func Unarchive(tenantID, id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid id")
	}
	_, err = col().UpdateOne(ctx, bson.M{"_id": oid, "tenant_id": tid},
		bson.M{"$set": bson.M{"archived": false, "updated_at": time.Now()}, "$unset": bson.M{"archived_at": ""}})
	return err
}

func AdjustBalance(tenantID, id string, input AdjustBalanceInput) (*Supplier, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	after := options.After
	var s Supplier
	err = col().FindOneAndUpdate(ctx,
		bson.M{"_id": oid, "tenant_id": tid},
		bson.M{
			"$inc": bson.M{"balance": input.Amount},
			"$set": bson.M{"updated_at": time.Now()},
		},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&s)
	if err != nil {
		return nil, errors.New("supplier not found")
	}
	return &s, nil
}

// PayBalance records a payment: subtracts from supplier balance and distributes
// across validated (unpaid/partial) purchases, oldest first.
func PayBalance(tenantID, id string, amount float64, note, createdBy string) (*Supplier, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if amount <= 0 {
		return nil, errors.New("amount must be > 0")
	}

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	// Fetch unpaid purchases for this supplier (any non-draft status), oldest first
	purchases := database.Col("purchases")
	cursor, err := purchases.Find(ctx, bson.M{
		"tenant_id":   tid,
		"supplier_id": oid,
		"status":      bson.M{"$in": []string{"validated", "partially_validated", "paid"}},
	}, options.Find().SetSort(bson.M{"created_at": 1}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	type purchase struct {
		ID         primitive.ObjectID `bson:"_id"`
		Total      float64            `bson:"total"`
		PaidAmount float64            `bson:"paid_amount"`
	}
	var items []purchase
	if err = cursor.All(ctx, &items); err != nil {
		return nil, err
	}

	// Distribute payment oldest first (cap at what's actually owed on purchases)
	remaining := amount
	now := time.Now()
	for _, p := range items {
		if remaining <= 0 {
			break
		}
		due := p.Total - p.PaidAmount
		if due <= 0 {
			continue
		}
		pay := due
		if remaining < due {
			pay = remaining
		}
		remaining -= pay
		newPaid := p.PaidAmount + pay
		newStatus := "validated"
		if newPaid >= p.Total-0.001 {
			newStatus = "paid"
		}
		if _, err := purchases.UpdateOne(ctx,
			bson.M{"_id": p.ID},
			bson.M{"$set": bson.M{
				"paid_amount": newPaid,
				"status":      newStatus,
				"updated_at":  now,
			}},
		); err != nil {
			return nil, err
		}
	}

	// Subtract from supplier balance
	after := options.After
	var s Supplier
	err = col().FindOneAndUpdate(ctx,
		bson.M{"_id": oid, "tenant_id": tid},
		bson.M{
			"$inc": bson.M{"balance": -amount},
			"$set": bson.M{"updated_at": now},
		},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&s)
	if err != nil {
		return nil, errors.New("supplier not found")
	}

	// Record payment history (best effort)
	_ = RecordPayment(tenantID, id, s.Name, amount, note, createdBy)

	return &s, nil
}
