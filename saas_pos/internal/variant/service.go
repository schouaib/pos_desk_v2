package variant

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

func col() *mongo.Collection { return database.Col("product_variants") }

// SyncParentStock recalculates the parent product's qty_available as the
// sum of all its variants' qty_available. Call after any variant stock change.
func SyncParentStock(tenantID string, parentProductID primitive.ObjectID) error {
	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil // silently skip if invalid
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Aggregate sum of all variant quantities for this parent product
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"tenant_id": tid, "parent_product_id": parentProductID}}},
		{{Key: "$group", Value: bson.M{"_id": nil, "total": bson.M{"$sum": "$qty_available"}}}},
	}

	cursor, err := col().Aggregate(ctx, pipeline)
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)

	var totalQty float64
	if cursor.Next(ctx) {
		var result struct {
			Total float64 `bson:"total"`
		}
		if err := cursor.Decode(&result); err == nil {
			totalQty = result.Total
		}
	}
	// If no variants exist (all deleted), totalQty stays 0

	_, err = database.Col("products").UpdateOne(ctx,
		bson.M{"_id": parentProductID, "tenant_id": tid},
		bson.M{"$set": bson.M{"qty_available": totalQty, "updated_at": time.Now()}},
	)
	return err
}

// syncParentStockByVariantID looks up the variant's parent_product_id and syncs.
func syncParentStockByVariantID(tenantID string, variantID primitive.ObjectID) error {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var v struct {
		ParentProductID primitive.ObjectID `bson:"parent_product_id"`
	}
	if err := col().FindOne(ctx, bson.M{"_id": variantID, "tenant_id": tid}).Decode(&v); err != nil {
		return nil // variant not found, skip
	}
	return SyncParentStock(tenantID, v.ParentProductID)
}

func Create(tenantID, parentProductID string, input CreateInput) (*ProductVariant, error) {
	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}
	ppid, err := primitive.ObjectIDFromHex(parentProductID)
	if err != nil {
		return nil, errors.New("invalid parent_product_id")
	}

	if input.Barcodes == nil {
		input.Barcodes = []string{}
	}
	if input.Attributes == nil {
		input.Attributes = map[string]string{}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Verify parent product exists
	count, _ := database.Col("products").CountDocuments(ctx, bson.M{"_id": ppid, "tenant_id": tid})
	if count == 0 {
		return nil, errors.New("parent product not found")
	}

	// Ensure barcodes are unique within tenant (across products and variants)
	if len(input.Barcodes) > 0 {
		pCount, _ := database.Col("products").CountDocuments(ctx, bson.M{
			"tenant_id": tid,
			"barcodes":  bson.M{"$in": input.Barcodes},
		})
		vCount, _ := col().CountDocuments(ctx, bson.M{
			"tenant_id": tid,
			"barcodes":  bson.M{"$in": input.Barcodes},
		})
		if pCount+vCount > 0 {
			return nil, errors.New("one or more barcodes already exist")
		}
	}

	now := time.Now()
	v := ProductVariant{
		ID:              primitive.NewObjectID(),
		TenantID:        tid,
		ParentProductID: ppid,
		Attributes:      input.Attributes,
		Barcodes:        input.Barcodes,
		QtyAvailable:    input.QtyAvailable,
		PrixAchat:       input.PrixAchat,
		PrixVente1:      input.PrixVente1,
		PrixVente2:      input.PrixVente2,
		PrixVente3:      input.PrixVente3,
		IsActive:        true,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	if _, err := col().InsertOne(ctx, v); err != nil {
		return nil, err
	}
	// Sync parent product qty_available = sum of all variant quantities
	_ = SyncParentStock(tenantID, ppid)
	return &v, nil
}

func ListByProduct(tenantID, parentProductID string) ([]ProductVariant, error) {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	ppid, err := primitive.ObjectIDFromHex(parentProductID)
	if err != nil {
		return []ProductVariant{}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cur, err := col().Find(ctx, bson.M{"tenant_id": tid, "parent_product_id": ppid},
		options.Find().SetSort(bson.M{"created_at": 1}),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var items []ProductVariant
	if err := cur.All(ctx, &items); err != nil {
		return nil, err
	}
	if items == nil {
		items = []ProductVariant{}
	}
	return items, nil
}

func Update(tenantID, id string, input UpdateInput) (*ProductVariant, error) {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}
	if input.Barcodes == nil {
		input.Barcodes = []string{}
	}
	if input.Attributes == nil {
		input.Attributes = map[string]string{}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Ensure barcodes unique (exclude self)
	if len(input.Barcodes) > 0 {
		pCount, _ := database.Col("products").CountDocuments(ctx, bson.M{
			"tenant_id": tid,
			"barcodes":  bson.M{"$in": input.Barcodes},
		})
		vCount, _ := col().CountDocuments(ctx, bson.M{
			"_id":       bson.M{"$ne": oid},
			"tenant_id": tid,
			"barcodes":  bson.M{"$in": input.Barcodes},
		})
		if pCount+vCount > 0 {
			return nil, errors.New("one or more barcodes already exist")
		}
	}

	set := bson.M{
		"attributes":    input.Attributes,
		"barcodes":      input.Barcodes,
		"qty_available": input.QtyAvailable,
		"prix_achat":    input.PrixAchat,
		"prix_vente_1":  input.PrixVente1,
		"prix_vente_2":  input.PrixVente2,
		"prix_vente_3":  input.PrixVente3,
		"is_active":     input.IsActive,
		"updated_at":    time.Now(),
	}

	after := options.After
	var v ProductVariant
	err = col().FindOneAndUpdate(ctx,
		bson.M{"_id": oid, "tenant_id": tid},
		bson.M{"$set": set},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&v)
	if err != nil {
		return nil, errors.New("variant not found")
	}
	// Sync parent product qty_available
	_ = SyncParentStock(tenantID, v.ParentProductID)
	return &v, nil
}

// GetByID returns a single variant by its ID within a tenant.
func GetByID(tenantID, id string) (*ProductVariant, error) {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid variant id")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var v ProductVariant
	err = col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tid}).Decode(&v)
	if err != nil {
		return nil, errors.New("variant not found")
	}
	return &v, nil
}

// AdjustStock increments (or decrements) a variant's qty_available by delta.
func AdjustStock(tenantID, id string, delta float64) error {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid variant id")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err = col().UpdateOne(ctx,
		bson.M{"_id": oid, "tenant_id": tid},
		bson.M{"$inc": bson.M{"qty_available": delta}},
	)
	if err != nil {
		return err
	}
	// Sync parent product qty_available
	return syncParentStockByVariantID(tenantID, oid)
}

// FindByBarcode looks up a variant by one of its barcodes within a tenant.
func FindByBarcode(tenantID, barcode string) (*ProductVariant, error) {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var v ProductVariant
	err := col().FindOne(ctx, bson.M{
		"tenant_id": tid,
		"barcodes":  barcode,
		"is_active": true,
	}).Decode(&v)
	if err != nil {
		return nil, err
	}
	return &v, nil
}

func Delete(tenantID, id string) error {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid id")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Get parent_product_id before deleting so we can sync
	var v struct {
		ParentProductID primitive.ObjectID `bson:"parent_product_id"`
	}
	_ = col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tid}).Decode(&v)

	res, err := col().DeleteOne(ctx, bson.M{"_id": oid, "tenant_id": tid})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return errors.New("variant not found")
	}
	// Sync parent product qty_available
	if !v.ParentProductID.IsZero() {
		_ = SyncParentStock(tenantID, v.ParentProductID)
	}
	return nil
}
