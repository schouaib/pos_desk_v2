package price_history

import (
	"context"
	"time"

	"saas_pos/internal/database"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func col() *mongo.Collection { return database.Col("price_history") }

// Record inserts a price history entry.
func Record(tenantID string, productID primitive.ObjectID, productName, source, changedBy, changedByEmail string, prixAchat, pv1, pv2, pv3 float64) {
	r := PriceRecord{
		ID:             primitive.NewObjectID(),
		TenantID:       tenantID,
		ProductID:      productID,
		ProductName:    productName,
		PrixAchat:      prixAchat,
		PrixVente1:     pv1,
		PrixVente2:     pv2,
		PrixVente3:     pv3,
		Source:         source,
		ChangedBy:      changedBy,
		ChangedByEmail: changedByEmail,
		CreatedAt:      time.Now(),
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	col().InsertOne(ctx, r)
}

// List returns paginated price history for a product.
func List(tenantID, productID string, page, limit int) (*ListResult, error) {
	if limit <= 0 || limit > 10 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	pid, err := primitive.ObjectIDFromHex(productID)
	if err != nil {
		return &ListResult{Items: []PriceRecord{}}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"tenant_id": tenantID, "product_id": pid}
	total, _ := col().CountDocuments(ctx, filter)
	skip := int64((page - 1) * limit)

	cur, err := col().Find(ctx, filter,
		options.Find().
			SetSort(bson.M{"created_at": -1}).
			SetSkip(skip).
			SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var items []PriceRecord
	if err := cur.All(ctx, &items); err != nil {
		return nil, err
	}
	if items == nil {
		items = []PriceRecord{}
	}
	return &ListResult{Items: items, Total: total}, nil
}
