package adjustment

import (
	"context"
	"errors"
	"time"

	"saas_pos/internal/database"
	"saas_pos/internal/variant"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func col() *mongo.Collection        { return database.Col("stock_adjustments") }
func productCol() *mongo.Collection { return database.Col("products") }

func Create(tenantID, userID, userEmail string, input CreateInput) (*StockAdjustment, error) {
	pid, err := primitive.ObjectIDFromHex(input.ProductID)
	if err != nil {
		return nil, errors.New("invalid product_id")
	}
	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	ctx := context.Background()

	// Variant adjustment
	if input.VariantID != "" {
		return createVariantAdjustment(ctx, tenantID, tid, pid, input, userID, userEmail)
	}

	var product struct {
		Name         string   `bson:"name"`
		Barcodes     []string `bson:"barcodes"`
		QtyAvailable float64  `bson:"qty_available"`
	}
	if err := productCol().FindOne(ctx, bson.M{"_id": pid, "tenant_id": tid}).Decode(&product); err != nil {
		return nil, errors.New("product not found")
	}

	barcode := ""
	if len(product.Barcodes) > 0 {
		barcode = product.Barcodes[0]
	}

	// Set qty directly
	if _, err := productCol().UpdateOne(ctx,
		bson.M{"_id": pid, "tenant_id": tid},
		bson.M{"$set": bson.M{"qty_available": input.QtyAfter, "updated_at": time.Now()}},
	); err != nil {
		return nil, errors.New("failed to update stock")
	}

	adj := &StockAdjustment{
		ID:             primitive.NewObjectID(),
		TenantID:       tenantID,
		ProductID:      pid,
		ProductName:    product.Name,
		Barcode:        barcode,
		QtyBefore:      product.QtyAvailable,
		QtyAfter:       input.QtyAfter,
		Reason:         input.Reason,
		CreatedBy:      userID,
		CreatedByEmail: userEmail,
		CreatedAt:      time.Now(),
	}
	_, err = col().InsertOne(ctx, adj)
	return adj, err
}

func createVariantAdjustment(ctx context.Context, tenantID string, tid, pid primitive.ObjectID, input CreateInput, userID, userEmail string) (*StockAdjustment, error) {
	vid, err := primitive.ObjectIDFromHex(input.VariantID)
	if err != nil {
		return nil, errors.New("invalid variant_id")
	}

	// Get variant current state
	v, err := variant.GetByID(tenantID, input.VariantID)
	if err != nil {
		return nil, errors.New("variant not found")
	}

	// Get parent product name
	var product struct {
		Name string `bson:"name"`
	}
	productCol().FindOne(ctx, bson.M{"_id": pid, "tenant_id": tid}).Decode(&product)

	// Build variant label
	variantLabel := ""
	for k, val := range v.Attributes {
		if variantLabel != "" {
			variantLabel += ", "
		}
		variantLabel += k + ": " + val
	}

	barcode := ""
	if len(v.Barcodes) > 0 {
		barcode = v.Barcodes[0]
	}

	// Update variant qty
	if _, err := database.Col("product_variants").UpdateOne(ctx,
		bson.M{"_id": vid, "tenant_id": tid},
		bson.M{"$set": bson.M{"qty_available": input.QtyAfter, "updated_at": time.Now()}},
	); err != nil {
		return nil, errors.New("failed to update variant stock")
	}

	// Sync parent product qty
	_ = variant.SyncParentStock(tenantID, pid)

	adj := &StockAdjustment{
		ID:             primitive.NewObjectID(),
		TenantID:       tenantID,
		ProductID:      pid,
		VariantID:      &vid,
		VariantLabel:   variantLabel,
		ProductName:    product.Name,
		Barcode:        barcode,
		QtyBefore:      v.QtyAvailable,
		QtyAfter:       input.QtyAfter,
		Reason:         input.Reason,
		CreatedBy:      userID,
		CreatedByEmail: userEmail,
		CreatedAt:      time.Now(),
	}
	_, err = col().InsertOne(ctx, adj)
	return adj, err
}

func List(tenantID, search string, from, to time.Time, page, limit int) (*ListResult, error) {
	if limit <= 0 || limit > 10 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	filter := bson.M{
		"tenant_id":  tenantID,
		"created_at": bson.M{"$gte": from, "$lte": to},
	}
	if search != "" {
		re := primitive.Regex{Pattern: search, Options: "i"}
		filter["$or"] = bson.A{
			bson.M{"product_name": re},
			bson.M{"barcode": re},
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

	var items []StockAdjustment
	if err := cur.All(ctx, &items); err != nil {
		return nil, err
	}
	if items == nil {
		items = []StockAdjustment{}
	}
	return &ListResult{Items: items, Total: total}, nil
}
