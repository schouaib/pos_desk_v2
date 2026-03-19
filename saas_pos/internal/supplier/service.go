package supplier

import (
	"context"
	"errors"
	"math"
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
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	sid, _ := primitive.ObjectIDFromHex(supplierID)

	p := SupplierPayment{
		ID:           primitive.NewObjectID(),
		TenantID:     tid,
		SupplierID:   sid,
		SupplierName: supplierName,
		Amount:       amount,
		Note:         note,
		CreatedBy:    createdBy,
		CreatedAt:    time.Now(),
	}
	_, err := paymentCol().InsertOne(ctx, p)
	return err
}

func ListPayments(tenantID, supplierID, dateFrom, dateTo string, page, limit int) (*PaymentListResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
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
	skip := int64((page - 1) * limit)

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
	total, err := paymentCol().CountDocuments(ctx, filter)
	if err != nil {
		return nil, err
	}

	cursor, err := paymentCol().Find(ctx, filter,
		options.Find().
			SetSort(bson.M{"created_at": -1}).
			SetSkip(skip).
			SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	items := []SupplierPayment{}
	if err = cursor.All(ctx, &items); err != nil {
		return nil, err
	}

	pages := int(math.Ceil(float64(total) / float64(limit)))
	if pages == 0 {
		pages = 1
	}
	return &PaymentListResult{Items: items, Total: total, Page: page, Limit: limit, Pages: pages}, nil
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
		Address:   input.Address,
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

	filter := bson.M{"tenant_id": tid}
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
			"address":    input.Address,
			"updated_at": time.Now(),
		}},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&s)
	if err != nil {
		return nil, errors.New("supplier not found")
	}
	return &s, nil
}

func Delete(tenantID, id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid id")
	}

	res, err := col().DeleteOne(ctx, bson.M{"_id": oid, "tenant_id": tid})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return errors.New("supplier not found")
	}
	return nil
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

	// Fetch unpaid validated purchases for this supplier, oldest first
	purchases := database.Col("purchases")
	cursor, err := purchases.Find(ctx, bson.M{
		"tenant_id":   tid,
		"supplier_id": oid,
		"status":      "validated",
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

	// Validate: amount must not exceed total remaining across all unpaid purchases
	totalRemaining := 0.0
	for _, p := range items {
		totalRemaining += p.Total - p.PaidAmount
	}
	if amount > totalRemaining+0.001 { // small epsilon for float comparison
		return nil, errors.New("amount exceeds total remaining balance of unpaid purchases")
	}

	// Distribute payment oldest first
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
