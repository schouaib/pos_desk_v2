package caisse

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

func col() *mongo.Collection { return database.Col("caisse_sessions") }

func Open(tenantID, userID, userEmail string, input OpenInput) (*Session, error) {
	if input.OpeningAmount < 0 {
		return nil, errors.New("opening amount cannot be negative")
	}

	ctx := context.Background()

	// Check if user already has an open session
	var existing Session
	err := col().FindOne(ctx, bson.M{
		"tenant_id": tenantID,
		"user_id":   userID,
		"status":    "open",
	}).Decode(&existing)
	if err == nil {
		return nil, errors.New("session already open")
	}

	session := &Session{
		ID:            primitive.NewObjectID(),
		TenantID:      tenantID,
		UserID:        userID,
		UserEmail:     userEmail,
		OpeningAmount: input.OpeningAmount,
		Notes:         input.Notes,
		Status:        "open",
		OpenedAt:      time.Now(),
	}
	_, err = col().InsertOne(ctx, session)
	return session, err
}

func Close(tenantID, userID string, input CloseInput) (*Session, error) {
	if input.ClosingAmount < 0 {
		return nil, errors.New("closing amount cannot be negative")
	}

	ctx := context.Background()
	now := time.Now()

	var session Session
	err := col().FindOneAndUpdate(ctx,
		bson.M{
			"tenant_id": tenantID,
			"user_id":   userID,
			"status":    "open",
		},
		bson.M{"$set": bson.M{
			"closing_amount": input.ClosingAmount,
			"notes":          input.Notes,
			"status":         "closed",
			"closed_at":      now,
		}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&session)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, errors.New("no open session found")
		}
		return nil, err
	}
	return &session, nil
}

func GetCurrent(tenantID, userID string) (*Session, error) {
	ctx := context.Background()
	var session Session
	err := col().FindOne(ctx, bson.M{
		"tenant_id": tenantID,
		"user_id":   userID,
		"status":    "open",
	}).Decode(&session)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, err
	}
	return &session, nil
}

// UserCaisseSummary holds the total opening and closing amounts for a user in a date range.
type UserCaisseSummary struct {
	Email         string  `bson:"email"`
	OpeningAmount float64 `bson:"opening_amount"`
	ClosingAmount float64 `bson:"closing_amount"`
}

// SumByUser returns a map of user_id → total opening/closing amounts for sessions opened in [from, to].
func SumByUser(tenantID string, from, to time.Time) (map[string]UserCaisseSummary, error) {
	ctx := context.Background()
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"tenant_id": tenantID,
			"opened_at": bson.M{"$gte": from, "$lte": to},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id":            "$user_id",
			"email":          bson.M{"$first": "$user_email"},
			"opening_amount": bson.M{"$sum": "$opening_amount"},
			"closing_amount": bson.M{"$sum": bson.M{"$ifNull": bson.A{"$closing_amount", 0}}},
		}}},
	}
	cur, err := col().Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	type row struct {
		UserID        string  `bson:"_id"`
		Email         string  `bson:"email"`
		OpeningAmount float64 `bson:"opening_amount"`
		ClosingAmount float64 `bson:"closing_amount"`
	}
	var rows []row
	cur.All(ctx, &rows)

	result := make(map[string]UserCaisseSummary, len(rows))
	for _, r := range rows {
		result[r.UserID] = UserCaisseSummary{Email: r.Email, OpeningAmount: r.OpeningAmount, ClosingAmount: r.ClosingAmount}
	}
	return result, nil
}

// CaisseTotals holds aggregated opening and closing amounts.
type CaisseTotals struct {
	Opening float64
	Closing float64
}

// SumOpeningAmounts returns the total opening amount across all sessions opened in [from, to].
func SumOpeningAmounts(tenantID string, from, to time.Time) (float64, error) {
	totals, err := SumAmounts(tenantID, from, to)
	if err != nil {
		return 0, err
	}
	return totals.Opening, nil
}

// SumAmounts returns the total opening and closing amounts across all sessions opened in [from, to].
func SumAmounts(tenantID string, from, to time.Time) (*CaisseTotals, error) {
	ctx := context.Background()
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"tenant_id": tenantID,
			"opened_at": bson.M{"$gte": from, "$lte": to},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id":     nil,
			"opening": bson.M{"$sum": "$opening_amount"},
			"closing": bson.M{"$sum": bson.M{"$ifNull": bson.A{"$closing_amount", 0}}},
		}}},
	}
	cur, err := col().Aggregate(ctx, pipeline)
	if err != nil {
		return &CaisseTotals{}, err
	}
	defer cur.Close(ctx)

	var result struct {
		Opening float64 `bson:"opening"`
		Closing float64 `bson:"closing"`
	}
	if cur.Next(ctx) {
		cur.Decode(&result)
	}
	return &CaisseTotals{Opening: result.Opening, Closing: result.Closing}, nil
}

func ListHistory(tenantID string, page, limit int) ([]Session, int64, error) {
	if limit <= 0 || limit > 10 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	ctx := context.Background()
	filter := bson.M{"tenant_id": tenantID}

	total, _ := col().CountDocuments(ctx, filter)
	skip := int64((page - 1) * limit)
	opts := options.Find().
		SetSort(bson.M{"opened_at": -1}).
		SetSkip(skip).
		SetLimit(int64(limit))

	cur, err := col().Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cur.Close(ctx)

	var items []Session
	cur.All(ctx, &items)
	if items == nil {
		items = []Session{}
	}
	return items, total, nil
}
