package client

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"saas_pos/internal/counter"
	"saas_pos/internal/database"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func col() *mongo.Collection         { return database.Col("clients") }
func paymentCol() *mongo.Collection  { return database.Col("client_payments") }

// Create adds a new client for the given tenant.
func Create(tenantID string, input ClientInput) (*Client, error) {
	if input.Name == "" {
		return nil, errors.New("name is required")
	}

	seq, _ := counter.Next(tenantID, "client")
	code := fmt.Sprintf("CLT-%06d", seq)

	now := time.Now()
	c := &Client{
		ID:        primitive.NewObjectID(),
		TenantID:  tenantID,
		Code:      code,
		Name:      input.Name,
		Phone:     input.Phone,
		Email:     input.Email,
		Address:   input.Address,
		RC:        input.RC,
		NIF:       input.NIF,
		NIS:       input.NIS,
		NART:      input.NART,
		CompteRIB: input.CompteRIB,
		Balance:   0,
		CreatedAt: now,
		UpdatedAt: now,
	}

	_, err := col().InsertOne(context.Background(), c)
	return c, err
}

// List returns paginated clients for a tenant, with optional name/code search.
func List(tenantID, q string, page, limit int) (*ListResult, error) {
	if limit <= 0 || limit > 10 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	filter := bson.M{"tenant_id": tenantID}
	if q != "" {
		filter["$or"] = bson.A{
			bson.M{"name": bson.M{"$regex": q, "$options": "i"}},
			bson.M{"code": bson.M{"$regex": q, "$options": "i"}},
			bson.M{"phone": bson.M{"$regex": q, "$options": "i"}},
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

	var items []Client
	cur.All(ctx, &items)
	if items == nil {
		items = []Client{}
	}
	return &ListResult{Items: items, Total: total}, nil
}

// GetByID returns a single client belonging to the given tenant.
func GetByID(tenantID, id string) (*Client, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid client id")
	}
	var c Client
	err = col().FindOne(context.Background(), bson.M{"_id": oid, "tenant_id": tenantID}).Decode(&c)
	if err != nil {
		return nil, errors.New("client not found")
	}
	return &c, nil
}

// Update modifies the editable fields of a client.
func Update(tenantID, id string, input ClientInput) (*Client, error) {
	if input.Name == "" {
		return nil, errors.New("name is required")
	}
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid client id")
	}

	now := time.Now()
	update := bson.M{"$set": bson.M{
		"name":       input.Name,
		"phone":      input.Phone,
		"email":      input.Email,
		"address":    input.Address,
		"rc":         input.RC,
		"nif":        input.NIF,
		"nis":        input.NIS,
		"nart":       input.NART,
		"compte_rib": input.CompteRIB,
		"updated_at": now,
	}}

	after := options.After
	var c Client
	err = col().FindOneAndUpdate(
		context.Background(),
		bson.M{"_id": oid, "tenant_id": tenantID},
		update,
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&c)
	if err != nil {
		return nil, errors.New("client not found")
	}
	return &c, nil
}

// Delete removes a client. Returns an error if the client has an outstanding balance.
func Delete(tenantID, id string) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid client id")
	}

	var c Client
	err = col().FindOne(context.Background(), bson.M{"_id": oid, "tenant_id": tenantID}).Decode(&c)
	if err != nil {
		return errors.New("client not found")
	}
	if c.Balance > 0 {
		return errors.New("cannot delete client with outstanding balance")
	}

	_, err = col().DeleteOne(context.Background(), bson.M{"_id": oid, "tenant_id": tenantID})
	return err
}

// AdjustBalance adds delta to the client's balance (positive = increases debt, negative = reduces debt).
// This is called internally by the sale and payment flows.
func AdjustBalance(tenantID, clientID string, delta float64) error {
	oid, err := primitive.ObjectIDFromHex(clientID)
	if err != nil {
		return errors.New("invalid client id")
	}
	delta = math.Round(delta*100) / 100
	_, err = col().UpdateOne(
		context.Background(),
		bson.M{"_id": oid, "tenant_id": tenantID},
		bson.M{
			"$inc": bson.M{"balance": delta},
			"$set": bson.M{"updated_at": time.Now()},
		},
	)
	return err
}

// AddPayment records a payment installment and decrements the client's balance.
func AddPayment(tenantID, clientID string, input PaymentInput) (*Payment, error) {
	if input.Amount <= 0 {
		return nil, errors.New("amount must be positive")
	}

	// Verify client exists and belongs to tenant
	if _, err := GetByID(tenantID, clientID); err != nil {
		return nil, err
	}

	p := &Payment{
		ID:        primitive.NewObjectID(),
		TenantID:  tenantID,
		ClientID:  clientID,
		Amount:    math.Round(input.Amount*100) / 100,
		Note:      input.Note,
		CreatedAt: time.Now(),
	}

	if _, err := paymentCol().InsertOne(context.Background(), p); err != nil {
		return nil, err
	}

	// Decrement the balance
	if err := AdjustBalance(tenantID, clientID, -p.Amount); err != nil {
		return nil, err
	}

	return p, nil
}

// GetStatement returns a merged chronological ledger of credit sales and payments
// for a client, with running balance computed from oldest to newest.
func GetStatement(tenantID, clientID string) ([]StatementEntry, error) {
	ctx := context.Background()

	// --- credit sales ---
	type saleLineDoc struct {
		ProductName string  `bson:"product_name"`
		Qty         float64 `bson:"qty"`
		UnitPrice   float64 `bson:"unit_price"`
		TotalTTC    float64 `bson:"total_ttc"`
	}
	type saleDoc struct {
		ID        primitive.ObjectID `bson:"_id"`
		Ref       string             `bson:"ref"`
		Total     float64            `bson:"total"`
		Lines     []saleLineDoc      `bson:"lines"`
		CreatedAt time.Time          `bson:"created_at"`
	}
	saleCur, err := database.Col("sales").Find(ctx,
		bson.M{"tenant_id": tenantID, "client_id": clientID, "sale_type": "credit"},
		options.Find().SetSort(bson.M{"created_at": 1}),
	)
	if err != nil {
		return nil, err
	}
	var sales []saleDoc
	saleCur.All(ctx, &sales)

	// --- payments ---
	type payDoc struct {
		ID        primitive.ObjectID `bson:"_id"`
		Amount    float64            `bson:"amount"`
		Note      string             `bson:"note"`
		CreatedAt time.Time          `bson:"created_at"`
	}
	payCur, err := paymentCol().Find(ctx,
		bson.M{"tenant_id": tenantID, "client_id": clientID},
		options.Find().SetSort(bson.M{"created_at": 1}),
	)
	if err != nil {
		return nil, err
	}
	var payments []payDoc
	payCur.All(ctx, &payments)

	// --- merge ---
	type raw struct {
		id     string
		typ    string
		date   time.Time
		amount float64
		ref    string
		lines  []StatementSaleLine
	}
	var entries []raw
	for _, s := range sales {
		var lines []StatementSaleLine
		for _, l := range s.Lines {
			lines = append(lines, StatementSaleLine{
				ProductName: l.ProductName,
				Qty:         l.Qty,
				UnitPrice:   l.UnitPrice,
				TotalTTC:    l.TotalTTC,
			})
		}
		entries = append(entries, raw{s.ID.Hex(), "sale", s.CreatedAt, math.Round(s.Total*100) / 100, s.Ref, lines})
	}
	for _, p := range payments {
		entries = append(entries, raw{p.ID.Hex(), "payment", p.CreatedAt, math.Round(p.Amount*100) / 100, p.Note, nil})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].date.Before(entries[j].date) })

	// --- running balance ---
	var running float64
	result := make([]StatementEntry, len(entries))
	for i, e := range entries {
		if e.typ == "sale" {
			running = math.Round((running+e.amount)*100) / 100
		} else {
			running = math.Round((running-e.amount)*100) / 100
		}
		result[i] = StatementEntry{ID: e.id, Type: e.typ, Date: e.date, Amount: e.amount, Ref: e.ref, Balance: running, Lines: e.lines}
	}

	if result == nil {
		result = []StatementEntry{}
	}
	return result, nil
}

// PaymentsSum returns the total amount of client payments received in the given date range.
func PaymentsSum(tenantID string, from, to time.Time) (float64, error) {
	ctx := context.Background()
	filter := bson.M{
		"tenant_id":  tenantID,
		"created_at": bson.M{"$gte": from, "$lte": to},
	}
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: filter}},
		{{Key: "$group", Value: bson.M{
			"_id":   nil,
			"total": bson.M{"$sum": "$amount"},
		}}},
	}
	cur, err := paymentCol().Aggregate(ctx, pipeline)
	if err != nil {
		return 0, err
	}
	defer cur.Close(ctx)
	var agg []struct{ Total float64 `bson:"total"` }
	cur.All(ctx, &agg)
	if len(agg) > 0 {
		return math.Round(agg[0].Total*100) / 100, nil
	}
	return 0, nil
}

// ListPayments returns paginated payments for a specific client.
func ListPayments(tenantID, clientID string, page, limit int) (*PaymentListResult, error) {
	if limit <= 0 || limit > 10 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	filter := bson.M{"tenant_id": tenantID, "client_id": clientID}
	ctx := context.Background()
	total, _ := paymentCol().CountDocuments(ctx, filter)
	skip := int64((page - 1) * limit)
	opts := options.Find().
		SetSort(bson.M{"created_at": -1}).
		SetSkip(skip).
		SetLimit(int64(limit))

	cur, err := paymentCol().Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var items []Payment
	cur.All(ctx, &items)
	if items == nil {
		items = []Payment{}
	}
	return &PaymentListResult{Items: items, Total: total}, nil
}
