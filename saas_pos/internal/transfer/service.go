package transfer

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

func col() *mongo.Collection         { return database.Col("stock_transfers") }
func locStockCol() *mongo.Collection { return database.Col("location_stock") }

func Create(tenantID, userID, userEmail string, input CreateInput) (*StockTransfer, error) {
	if len(input.Lines) == 0 {
		return nil, errors.New("transfer must have at least one line")
	}
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	fromID, err := primitive.ObjectIDFromHex(input.FromLocationID)
	if err != nil {
		return nil, errors.New("invalid from_location_id")
	}
	toID, err := primitive.ObjectIDFromHex(input.ToLocationID)
	if err != nil {
		return nil, errors.New("invalid to_location_id")
	}
	if fromID == toID {
		return nil, errors.New("from and to locations must be different")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Get location names
	var fromLoc, toLoc struct{ Name string `bson:"name"` }
	if err := database.Col("locations").FindOne(ctx, bson.M{"_id": fromID, "tenant_id": tid}).Decode(&fromLoc); err != nil {
		return nil, errors.New("from location not found")
	}
	if err := database.Col("locations").FindOne(ctx, bson.M{"_id": toID, "tenant_id": tid}).Decode(&toLoc); err != nil {
		return nil, errors.New("to location not found")
	}

	var lines []TransferLine
	for _, li := range input.Lines {
		if li.Qty <= 0 {
			return nil, errors.New("qty must be positive")
		}
		pid, err := primitive.ObjectIDFromHex(li.ProductID)
		if err != nil {
			return nil, errors.New("invalid product_id")
		}
		var p struct{ Name string `bson:"name"` }
		if err := database.Col("products").FindOne(ctx, bson.M{"_id": pid, "tenant_id": tid}).Decode(&p); err != nil {
			return nil, errors.New("product not found: " + li.ProductID)
		}
		lines = append(lines, TransferLine{ProductID: pid, ProductName: p.Name, Qty: li.Qty})
	}

	now := time.Now()
	t := StockTransfer{
		ID:               primitive.NewObjectID(),
		TenantID:         tid,
		FromLocationID:   fromID,
		FromLocationName: fromLoc.Name,
		ToLocationID:     toID,
		ToLocationName:   toLoc.Name,
		Lines:            lines,
		Status:           StatusDraft,
		CreatedBy:        userID,
		CreatedByEmail:   userEmail,
		CreatedAt:        now,
	}

	if _, err := col().InsertOne(ctx, t); err != nil {
		return nil, err
	}
	return &t, nil
}

func Complete(tenantID, id string) (*StockTransfer, error) {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var t StockTransfer
	if err := col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tid}).Decode(&t); err != nil {
		return nil, errors.New("transfer not found")
	}
	if t.Status != StatusDraft {
		return nil, errors.New("transfer already completed")
	}

	// Move location_stock entries
	for _, line := range t.Lines {
		upsertOpts := options.Update().SetUpsert(true)
		// Decrement from source
		locStockCol().UpdateOne(ctx,
			bson.M{"tenant_id": tid, "product_id": line.ProductID, "location_id": t.FromLocationID},
			bson.M{"$inc": bson.M{"qty": -line.Qty}},
			upsertOpts,
		)
		// Increment at destination
		locStockCol().UpdateOne(ctx,
			bson.M{"tenant_id": tid, "product_id": line.ProductID, "location_id": t.ToLocationID},
			bson.M{"$inc": bson.M{"qty": line.Qty}},
			upsertOpts,
		)
	}

	now := time.Now()
	col().UpdateOne(ctx, bson.M{"_id": oid}, bson.M{"$set": bson.M{"status": StatusCompleted, "completed_at": now}})
	t.Status = StatusCompleted
	t.CompletedAt = &now
	return &t, nil
}

func List(tenantID string, page, limit int) (*ListResult, error) {
	if limit <= 0 || limit > 10 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"tenant_id": tid}
	total, _ := col().CountDocuments(ctx, filter)

	cur, err := col().Find(ctx, filter,
		options.Find().
			SetSort(bson.M{"created_at": -1}).
			SetSkip(int64((page-1)*limit)).
			SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var items []StockTransfer
	if err := cur.All(ctx, &items); err != nil {
		return nil, err
	}
	if items == nil {
		items = []StockTransfer{}
	}
	return &ListResult{Items: items, Total: total}, nil
}

func Delete(tenantID, id string) error {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid id")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	res, err := col().DeleteOne(ctx, bson.M{"_id": oid, "tenant_id": tid, "status": StatusDraft})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return errors.New("cannot delete completed transfer or not found")
	}
	return nil
}
