package subscription

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

func col() *mongo.Collection {
	return database.Col("subscription_plans")
}

func Create(input PlanInput) (*Plan, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	now := time.Now()
	plan := Plan{
		ID:            primitive.NewObjectID(),
		Name:          input.Name,
		Description:   input.Description,
		Price:         input.Price,
		MaxUsers:      input.MaxUsers,
		MaxProducts:   input.MaxProducts,
		MaxSalesMonth: input.MaxSalesMonth,
		Features:      input.Features,
		FeaturePrices: input.FeaturePrices,
		Active:        true,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if _, err := col().InsertOne(ctx, plan); err != nil {
		return nil, err
	}
	return &plan, nil
}

func List(onlyActive bool) ([]Plan, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{}
	if onlyActive {
		filter["active"] = true
	}

	cursor, err := col().Find(ctx, filter, options.Find().SetSort(bson.M{"price": 1}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	plans := []Plan{}
	if err = cursor.All(ctx, &plans); err != nil {
		return nil, err
	}
	return plans, nil
}

func GetByID(id string) (*Plan, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	var plan Plan
	if err = col().FindOne(ctx, bson.M{"_id": oid}).Decode(&plan); err != nil {
		return nil, errors.New("plan not found")
	}
	return &plan, nil
}

func Update(id string, input PlanInput) (*Plan, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	update := bson.M{"$set": bson.M{
		"name":            input.Name,
		"description":     input.Description,
		"price":           input.Price,
		"max_users":       input.MaxUsers,
		"max_products":    input.MaxProducts,
		"max_sales_month": input.MaxSalesMonth,
		"features":        input.Features,
		"feature_prices":  input.FeaturePrices,
		"updated_at":      time.Now(),
	}}

	after := options.After
	var plan Plan
	err = col().FindOneAndUpdate(ctx, bson.M{"_id": oid}, update,
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&plan)
	if err != nil {
		return nil, err
	}

	// Propagate limit/feature changes to all tenants currently on this plan.
	database.Col("tenants").UpdateMany(ctx,
		bson.M{"plan_id": oid},
		bson.M{"$set": bson.M{
			"max_users":       input.MaxUsers,
			"max_products":    input.MaxProducts,
			"max_sales_month": input.MaxSalesMonth,
			"features":        input.Features,
			"updated_at":      time.Now(),
		}},
	)

	return &plan, nil
}

func SetActive(id string, active bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid id")
	}

	_, err = col().UpdateOne(ctx,
		bson.M{"_id": oid},
		bson.M{"$set": bson.M{"active": active, "updated_at": time.Now()}},
	)
	return err
}
