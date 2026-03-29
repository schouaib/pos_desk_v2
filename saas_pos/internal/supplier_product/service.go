package supplier_product

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

func col() *mongo.Collection { return database.Col("supplier_products") }

func Create(tenantID string, input CreateInput) (*SupplierProduct, error) {
	sid, err := primitive.ObjectIDFromHex(input.SupplierID)
	if err != nil {
		return nil, errors.New("invalid supplier_id")
	}
	pid, err := primitive.ObjectIDFromHex(input.ProductID)
	if err != nil {
		return nil, errors.New("invalid product_id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)

	// Get supplier name
	var sup struct{ Name string `bson:"name"` }
	if err := database.Col("suppliers").FindOne(ctx, bson.M{"_id": sid, "tenant_id": tid}).Decode(&sup); err != nil {
		return nil, errors.New("supplier not found")
	}

	// Get product name
	var prod struct{ Name string `bson:"name"` }
	if err := database.Col("products").FindOne(ctx, bson.M{"_id": pid, "tenant_id": tid}).Decode(&prod); err != nil {
		return nil, errors.New("product not found")
	}

	now := time.Now()
	sp := SupplierProduct{
		ID:            primitive.NewObjectID(),
		TenantID:      tenantID,
		SupplierID:    sid,
		SupplierName:  sup.Name,
		ProductID:     pid,
		ProductName:   prod.Name,
		SupplierRef:   input.SupplierRef,
		SupplierPrice: input.SupplierPrice,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	// Upsert: if already linked, update
	filter := bson.M{"tenant_id": tenantID, "supplier_id": sid, "product_id": pid}
	update := bson.M{
		"$set": bson.M{
			"supplier_name":  sup.Name,
			"product_name":   prod.Name,
			"supplier_ref":   input.SupplierRef,
			"supplier_price": input.SupplierPrice,
			"updated_at":     now,
		},
		"$setOnInsert": bson.M{
			"_id":        sp.ID,
			"tenant_id":  tenantID,
			"supplier_id": sid,
			"product_id": pid,
			"created_at": now,
		},
	}
	opts := options.Update().SetUpsert(true)
	col().UpdateOne(ctx, filter, update, opts)

	// Return the current doc
	if err := col().FindOne(ctx, filter).Decode(&sp); err != nil {
		return nil, err
	}
	return &sp, nil
}

func ListBySupplier(tenantID, supplierID string, page, limit int) (*ListResult, error) {
	if limit <= 0 || limit > 10 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	sid, err := primitive.ObjectIDFromHex(supplierID)
	if err != nil {
		return &ListResult{Items: []SupplierProduct{}}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"tenant_id": tenantID, "supplier_id": sid}
	total, _ := col().CountDocuments(ctx, filter)

	cur, err := col().Find(ctx, filter,
		options.Find().
			SetSort(bson.M{"product_name": 1}).
			SetSkip(int64((page-1)*limit)).
			SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var items []SupplierProduct
	if err := cur.All(ctx, &items); err != nil {
		return nil, err
	}
	if items == nil {
		items = []SupplierProduct{}
	}
	return &ListResult{Items: items, Total: total}, nil
}

func ListByProduct(tenantID, productID string) ([]SupplierProduct, error) {
	pid, err := primitive.ObjectIDFromHex(productID)
	if err != nil {
		return []SupplierProduct{}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cur, err := col().Find(ctx, bson.M{"tenant_id": tenantID, "product_id": pid})
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var items []SupplierProduct
	if err := cur.All(ctx, &items); err != nil {
		return nil, err
	}
	if items == nil {
		items = []SupplierProduct{}
	}
	return items, nil
}

func Delete(tenantID, id string) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid id")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	res, err := col().DeleteOne(ctx, bson.M{"_id": oid, "tenant_id": tenantID})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return errors.New("not found")
	}
	return nil
}

// AutoLink upserts a supplier-product mapping (called from purchase validation).
func AutoLink(tenantID string, supplierID, productID primitive.ObjectID, supplierName, productName string, price float64) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	now := time.Now()
	filter := bson.M{"tenant_id": tenantID, "supplier_id": supplierID, "product_id": productID}
	update := bson.M{
		"$set": bson.M{
			"supplier_name":     supplierName,
			"product_name":      productName,
			"supplier_price":    price,
			"last_purchase_date": now,
			"updated_at":        now,
		},
		"$setOnInsert": bson.M{
			"_id":        primitive.NewObjectID(),
			"tenant_id":  tenantID,
			"supplier_id": supplierID,
			"product_id": productID,
			"created_at": now,
		},
	}
	col().UpdateOne(ctx, filter, update, options.Update().SetUpsert(true))
}
