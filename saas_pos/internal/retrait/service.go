package retrait

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

func col() *mongo.Collection { return database.Col("retraits") }

func Create(tenantID, userID, userEmail string, input CreateInput) (*Retrait, error) {
	if input.Amount <= 0 {
		return nil, errors.New("amount must be positive")
	}

	r := &Retrait{
		ID:        primitive.NewObjectID(),
		TenantID:  tenantID,
		Amount:    math.Round(input.Amount*100) / 100,
		Reason:    input.Reason,
		UserID:    userID,
		UserEmail: userEmail,
		CreatedAt: time.Now(),
	}

	_, err := col().InsertOne(context.Background(), r)
	return r, err
}

func Delete(tenantID, id string) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid id")
	}
	res, err := col().DeleteOne(context.Background(), bson.M{"_id": oid, "tenant_id": tenantID})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return errors.New("retrait not found")
	}
	return nil
}

func List(tenantID string, from, to time.Time, page, limit int) (*ListResult, error) {
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

	var items []Retrait
	if err := cur.All(ctx, &items); err != nil {
		return nil, err
	}
	if items == nil {
		items = []Retrait{}
	}
	return &ListResult{Items: items, Total: total}, nil
}

// SumForPeriod returns the total withdrawal amount in [from, to].
func SumForPeriod(tenantID string, from, to time.Time) (float64, error) {
	ctx := context.Background()
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"tenant_id":  tenantID,
			"created_at": bson.M{"$gte": from, "$lte": to},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id":   nil,
			"total": bson.M{"$sum": "$amount"},
		}}},
	}

	cur, err := col().Aggregate(ctx, pipeline)
	if err != nil {
		return 0, err
	}
	defer cur.Close(ctx)

	var results []struct {
		Total float64 `bson:"total"`
	}
	if err := cur.All(ctx, &results); err != nil {
		return 0, err
	}
	if len(results) == 0 {
		return 0, nil
	}
	return math.Round(results[0].Total*100) / 100, nil
}

// UserSum holds the total withdrawal amount and email for a single user.
type UserSum struct {
	Total float64
	Email string
}

// SumByUser returns a map of user_id → UserSum for retraits in [from, to].
// If userID is non-empty, only that user's retraits are included.
func SumByUser(tenantID string, from, to time.Time, userID string) (map[string]UserSum, error) {
	ctx := context.Background()
	matchFilter := bson.M{
		"tenant_id":  tenantID,
		"created_at": bson.M{"$gte": from, "$lte": to},
	}
	if userID != "" {
		matchFilter["user_id"] = userID
	}
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: matchFilter}},
		{{Key: "$group", Value: bson.M{
			"_id":        "$user_id",
			"user_email": bson.M{"$first": "$user_email"},
			"total":      bson.M{"$sum": "$amount"},
		}}},
	}

	cur, err := col().Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var rows []struct {
		UserID    string  `bson:"_id"`
		UserEmail string  `bson:"user_email"`
		Total     float64 `bson:"total"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}

	result := make(map[string]UserSum, len(rows))
	for _, r := range rows {
		result[r.UserID] = UserSum{
			Total: math.Round(r.Total*100) / 100,
			Email: r.UserEmail,
		}
	}
	return result, nil
}
