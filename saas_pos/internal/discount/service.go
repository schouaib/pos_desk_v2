package discount

import (
	"context"
	"errors"
	"time"

	"saas_pos/internal/database"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func col() *mongo.Collection { return database.Col("discount_rules") }

func parseDate(s *string) *time.Time {
	if s == nil || *s == "" {
		return nil
	}
	if t, err := time.Parse("2006-01-02", *s); err == nil {
		return &t
	}
	return nil
}

func Create(tenantID string, input CreateInput) (*DiscountRule, error) {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	pid, err := primitive.ObjectIDFromHex(input.ProductID)
	if err != nil {
		return nil, errors.New("invalid product_id")
	}
	if input.Type != "percentage" && input.Type != "fixed" {
		return nil, errors.New("type must be percentage or fixed")
	}
	if input.Value <= 0 {
		return nil, errors.New("value must be positive")
	}

	r := DiscountRule{
		ID:        primitive.NewObjectID(),
		TenantID:  tid,
		ProductID: pid,
		Type:      input.Type,
		Value:     input.Value,
		MinQty:    input.MinQty,
		StartDate: parseDate(input.StartDate),
		EndDate:   parseDate(input.EndDate),
		Active:    true,
		CreatedAt: time.Now(),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, err := col().InsertOne(ctx, r); err != nil {
		return nil, err
	}
	return &r, nil
}

func ListByProduct(tenantID, productID string) ([]DiscountRule, error) {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	pid, err := primitive.ObjectIDFromHex(productID)
	if err != nil {
		return []DiscountRule{}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cur, err := col().Find(ctx, bson.M{"tenant_id": tid, "product_id": pid},
		options.Find().SetSort(bson.M{"created_at": -1}),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var items []DiscountRule
	if err := cur.All(ctx, &items); err != nil {
		return nil, err
	}
	if items == nil {
		items = []DiscountRule{}
	}
	return items, nil
}

func Update(tenantID, id string, input UpdateInput) (*DiscountRule, error) {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}
	if input.Type != "percentage" && input.Type != "fixed" {
		return nil, errors.New("type must be percentage or fixed")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	set := bson.M{
		"type":       input.Type,
		"value":      input.Value,
		"min_qty":    input.MinQty,
		"start_date": parseDate(input.StartDate),
		"end_date":   parseDate(input.EndDate),
		"active":     input.Active,
	}

	after := options.After
	var r DiscountRule
	err = col().FindOneAndUpdate(ctx,
		bson.M{"_id": oid, "tenant_id": tid},
		bson.M{"$set": set},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&r)
	if err != nil {
		return nil, errors.New("discount rule not found")
	}
	return &r, nil
}

func Delete(tenantID, id string) error {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid id")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	res, err := col().DeleteOne(ctx, bson.M{"_id": oid, "tenant_id": tid})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return errors.New("not found")
	}
	return nil
}

// GetApplicable returns the best applicable discount for a product given qty and date.
func GetApplicable(tenantID string, productID primitive.ObjectID, qty float64, date time.Time) *DiscountRule {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	filter := bson.M{
		"tenant_id":  tid,
		"product_id": productID,
		"active":     true,
		"min_qty":    bson.M{"$lte": qty},
		"$or": bson.A{
			bson.M{"start_date": nil},
			bson.M{"start_date": bson.M{"$lte": date}},
		},
	}

	cur, err := col().Find(ctx, filter, options.Find().SetSort(bson.M{"min_qty": -1}).SetLimit(10))
	if err != nil {
		return nil
	}
	defer cur.Close(ctx)

	var rules []DiscountRule
	if err := cur.All(ctx, &rules); err != nil {
		return nil
	}

	for _, r := range rules {
		if r.EndDate != nil && date.After(*r.EndDate) {
			continue
		}
		return &r
	}
	return nil
}
