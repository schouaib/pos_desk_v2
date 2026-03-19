package expense

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

const dateFmt = "2006-01-02"

func col() *mongo.Collection { return database.Col("expenses") }

func parseDates(fromStr, toStr string) (time.Time, time.Time, error) {
	from, err := time.Parse(dateFmt, fromStr)
	if err != nil {
		return time.Time{}, time.Time{}, errors.New("invalid date_from")
	}
	to := from
	if toStr != "" && toStr != fromStr {
		to, err = time.Parse(dateFmt, toStr)
		if err != nil {
			return time.Time{}, time.Time{}, errors.New("invalid date_to")
		}
	}
	if to.Before(from) {
		return time.Time{}, time.Time{}, errors.New("date_to must be >= date_from")
	}
	return from, to, nil
}

func computeDays(from, to time.Time) int {
	return int(to.Sub(from).Hours()/24) + 1
}

func Create(tenantID string, input CreateInput) (*Expense, error) {
	if input.Label == "" {
		return nil, errors.New("label is required")
	}
	if input.Amount <= 0 {
		return nil, errors.New("amount must be positive")
	}

	from, to, err := parseDates(input.DateFrom, input.DateTo)
	if err != nil {
		return nil, err
	}

	days := computeDays(from, to)
	daily := math.Round((input.Amount/float64(days))*100) / 100

	exp := &Expense{
		ID:          primitive.NewObjectID(),
		TenantID:    tenantID,
		Label:       input.Label,
		Amount:      math.Round(input.Amount*100) / 100,
		DateFrom:    from,
		DateTo:      to,
		Days:        days,
		DailyAmount: daily,
		Note:        input.Note,
		CreatedAt:   time.Now(),
	}

	_, err = col().InsertOne(context.Background(), exp)
	return exp, err
}

func Update(tenantID, id string, input UpdateInput) (*Expense, error) {
	if input.Label == "" {
		return nil, errors.New("label is required")
	}
	if input.Amount <= 0 {
		return nil, errors.New("amount must be positive")
	}

	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	from, to, err := parseDates(input.DateFrom, input.DateTo)
	if err != nil {
		return nil, err
	}

	days := computeDays(from, to)
	daily := math.Round((input.Amount/float64(days))*100) / 100

	ctx := context.Background()
	update := bson.M{"$set": bson.M{
		"label":        input.Label,
		"amount":       math.Round(input.Amount*100) / 100,
		"date_from":    from,
		"date_to":      to,
		"days":         days,
		"daily_amount": daily,
		"note":         input.Note,
	}}

	var exp Expense
	err = col().FindOneAndUpdate(ctx,
		bson.M{"_id": oid, "tenant_id": tenantID},
		update,
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&exp)
	if err != nil {
		return nil, errors.New("expense not found")
	}
	return &exp, nil
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
		return errors.New("expense not found")
	}
	return nil
}

// List returns paginated expenses for a tenant filtered by date_from in [from, to] and optional label search.
func List(tenantID, search string, from, to time.Time, page, limit int) (*ListResult, error) {
	if limit <= 0 || limit > 10 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	filter := bson.M{
		"tenant_id": tenantID,
		"date_from": bson.M{"$gte": from, "$lte": to},
	}
	if search != "" {
		filter["label"] = bson.M{"$regex": search, "$options": "i"}
	}

	ctx := context.Background()
	total, _ := col().CountDocuments(ctx, filter)
	skip := int64((page - 1) * limit)
	opts := options.Find().
		SetSort(bson.M{"date_from": -1}).
		SetSkip(skip).
		SetLimit(int64(limit))

	cur, err := col().Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var items []Expense
	cur.All(ctx, &items)
	if items == nil {
		items = []Expense{}
	}
	return &ListResult{Items: items, Total: total}, nil
}

// SumForPeriod computes the effective expense cost attributable to [from, to].
// For multi-day expenses, only the overlapping portion of days is counted.
func SumForPeriod(tenantID string, from, to time.Time) (float64, error) {
	// Fetch all expenses that overlap with [from, to]
	filter := bson.M{
		"tenant_id": tenantID,
		"date_from": bson.M{"$lte": to},
		"date_to":   bson.M{"$gte": from},
	}

	ctx := context.Background()
	cur, err := col().Find(ctx, filter, options.Find().SetProjection(bson.M{
		"date_from":    1,
		"date_to":      1,
		"daily_amount": 1,
	}))
	if err != nil {
		return 0, err
	}
	defer cur.Close(ctx)

	var expenses []Expense
	cur.All(ctx, &expenses)

	var total float64
	for _, exp := range expenses {
		overlapStart := exp.DateFrom
		if from.After(overlapStart) {
			overlapStart = from
		}
		overlapEnd := exp.DateTo
		if to.Before(overlapEnd) {
			overlapEnd = to
		}
		overlapDays := int(overlapEnd.Sub(overlapStart).Hours()/24) + 1
		if overlapDays <= 0 {
			continue
		}
		total += exp.DailyAmount * float64(overlapDays)
	}

	return math.Round(total*100) / 100, nil
}
