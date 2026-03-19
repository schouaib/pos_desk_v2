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
	cur.All(ctx, &items)
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
		"attributes":   input.Attributes,
		"barcodes":     input.Barcodes,
		"prix_achat":   input.PrixAchat,
		"prix_vente_1": input.PrixVente1,
		"prix_vente_2": input.PrixVente2,
		"prix_vente_3": input.PrixVente3,
		"is_active":    input.IsActive,
		"updated_at":   time.Now(),
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
	res, err := col().DeleteOne(ctx, bson.M{"_id": oid, "tenant_id": tid})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return errors.New("variant not found")
	}
	return nil
}
