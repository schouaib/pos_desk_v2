package batch

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

func col() *mongo.Collection { return database.Col("product_batches") }

func Create(tenantID string, input CreateInput) (*ProductBatch, error) {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	pid, err := primitive.ObjectIDFromHex(input.ProductID)
	if err != nil {
		return nil, errors.New("invalid product_id")
	}
	if input.BatchNumber == "" {
		return nil, errors.New("batch_number is required")
	}
	if input.Qty <= 0 {
		return nil, errors.New("qty must be positive")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Get product name
	var p struct{ Name string `bson:"name"` }
	if err := database.Col("products").FindOne(ctx, bson.M{"_id": pid, "tenant_id": tid}).Decode(&p); err != nil {
		return nil, errors.New("product not found")
	}

	var expiryDate *time.Time
	if input.ExpiryDate != nil && *input.ExpiryDate != "" {
		if t, err := time.Parse("2006-01-02", *input.ExpiryDate); err == nil {
			expiryDate = &t
		}
	}

	b := ProductBatch{
		ID:          primitive.NewObjectID(),
		TenantID:    tid,
		ProductID:   pid,
		ProductName: p.Name,
		BatchNumber: input.BatchNumber,
		ExpiryDate:  expiryDate,
		Qty:         input.Qty,
		PrixAchat:   input.PrixAchat,
		CreatedAt:   time.Now(),
	}

	if _, err := col().InsertOne(ctx, b); err != nil {
		return nil, err
	}

	// Also increment product qty_available
	database.Col("products").UpdateOne(ctx,
		bson.M{"_id": pid, "tenant_id": tid},
		bson.M{"$inc": bson.M{"qty_available": input.Qty}},
	)

	return &b, nil
}

// CreateFromPurchase inserts a batch record without incrementing product stock
// (stock is already handled by the purchase validation flow).
func CreateFromPurchase(tenantID string, productID primitive.ObjectID, productName, batchNumber string, expiryDate *time.Time, qty, prixAchat float64) {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	if batchNumber == "" || qty <= 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	b := ProductBatch{
		ID:          primitive.NewObjectID(),
		TenantID:    tid,
		ProductID:   productID,
		ProductName: productName,
		BatchNumber: batchNumber,
		ExpiryDate:  expiryDate,
		Qty:         qty,
		PrixAchat:   prixAchat,
		CreatedAt:   time.Now(),
	}
	col().InsertOne(ctx, b)
}

func ListByProduct(tenantID, productID string, page, limit int) (*ListResult, error) {
	if limit <= 0 || limit > 50 {
		limit = 50
	}
	if page <= 0 {
		page = 1
	}

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	pid, err := primitive.ObjectIDFromHex(productID)
	if err != nil {
		return &ListResult{Items: []ProductBatch{}}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"tenant_id": tid, "product_id": pid}
	total, _ := col().CountDocuments(ctx, filter)

	cur, err := col().Find(ctx, filter,
		options.Find().
			SetSort(bson.D{{Key: "expiry_date", Value: 1}, {Key: "created_at", Value: 1}}).
			SetSkip(int64((page-1)*limit)).
			SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var items []ProductBatch
	cur.All(ctx, &items)
	if items == nil {
		items = []ProductBatch{}
	}
	return &ListResult{Items: items, Total: total}, nil
}

// DecrementFIFO decrements batch quantities using FIFO (earliest expiry first).
func DecrementFIFO(tenantID string, productID primitive.ObjectID, qty float64) {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Get batches with available qty, sorted by expiry (FIFO)
	cur, err := col().Find(ctx,
		bson.M{"tenant_id": tid, "product_id": productID, "qty": bson.M{"$gt": 0}},
		options.Find().SetSort(bson.D{{Key: "expiry_date", Value: 1}, {Key: "created_at", Value: 1}}),
	)
	if err != nil {
		return
	}
	defer cur.Close(ctx)

	var batches []ProductBatch
	cur.All(ctx, &batches)

	remaining := qty
	for _, b := range batches {
		if remaining <= 0 {
			break
		}
		decrement := remaining
		if decrement > b.Qty {
			decrement = b.Qty
		}
		col().UpdateOne(ctx,
			bson.M{"_id": b.ID},
			bson.M{"$inc": bson.M{"qty": -decrement}},
		)
		remaining -= decrement
	}
}

// ListExpiring returns batches expiring within daysBefore days.
func ListExpiring(tenantID string, daysBefore int) ([]ProductBatch, error) {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	deadline := time.Now().AddDate(0, 0, daysBefore)
	cur, err := col().Find(ctx, bson.M{
		"tenant_id":   tid,
		"expiry_date": bson.M{"$lte": deadline, "$ne": nil},
		"qty":         bson.M{"$gt": 0},
	}, options.Find().SetSort(bson.M{"expiry_date": 1}).SetLimit(100))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var items []ProductBatch
	cur.All(ctx, &items)
	if items == nil {
		items = []ProductBatch{}
	}
	return items, nil
}

// ListExpiringPaginated returns paginated batches expiring within daysBefore days.
func ListExpiringPaginated(tenantID string, daysBefore, page, limit int) (*PaginatedResult, error) {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	deadline := time.Now().AddDate(0, 0, daysBefore)
	filter := bson.M{
		"tenant_id":   tid,
		"expiry_date": bson.M{"$lte": deadline, "$ne": nil},
		"qty":         bson.M{"$gt": 0},
	}

	total, _ := col().CountDocuments(ctx, filter)

	cur, err := col().Find(ctx, filter,
		options.Find().
			SetSort(bson.M{"expiry_date": 1}).
			SetSkip(int64((page-1)*limit)).
			SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var items []ProductBatch
	cur.All(ctx, &items)
	if items == nil {
		items = []ProductBatch{}
	}

	pages := int(math.Ceil(float64(total) / float64(limit)))
	if pages == 0 {
		pages = 1
	}

	return &PaginatedResult{Items: items, Total: total, Page: page, Limit: limit, Pages: pages}, nil
}

// ListAlerts returns batches nearing expiry based on each product's expiry_alert_days setting.
func ListAlerts(tenantID string) ([]ProductBatch, error) {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Get all products that have expiry_alert_days > 0
	type prodAlert struct {
		ID              primitive.ObjectID `bson:"_id"`
		ExpiryAlertDays int                `bson:"expiry_alert_days"`
	}
	prodCur, err := database.Col("products").Find(ctx, bson.M{
		"tenant_id":         tid,
		"expiry_alert_days": bson.M{"$gt": 0},
	}, options.Find().SetProjection(bson.M{"_id": 1, "expiry_alert_days": 1}))
	if err != nil {
		return []ProductBatch{}, nil
	}
	defer prodCur.Close(ctx)

	var prods []prodAlert
	prodCur.All(ctx, &prods)
	if len(prods) == 0 {
		return []ProductBatch{}, nil
	}

	// For each product, find batches expiring within its alert window
	now := time.Now()
	var allAlerts []ProductBatch
	for _, p := range prods {
		deadline := now.AddDate(0, 0, p.ExpiryAlertDays)
		cur, err := col().Find(ctx, bson.M{
			"tenant_id":   tid,
			"product_id":  p.ID,
			"expiry_date": bson.M{"$lte": deadline, "$ne": nil},
			"qty":         bson.M{"$gt": 0},
		}, options.Find().SetSort(bson.M{"expiry_date": 1}).SetLimit(20))
		if err != nil {
			continue
		}
		var batches []ProductBatch
		cur.All(ctx, &batches)
		cur.Close(ctx)
		allAlerts = append(allAlerts, batches...)
	}

	if allAlerts == nil {
		allAlerts = []ProductBatch{}
	}
	return allAlerts, nil
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
		return errors.New("batch not found")
	}
	return nil
}
