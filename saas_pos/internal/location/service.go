package location

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

func col() *mongo.Collection { return database.Col("locations") }

func Create(tenantID string, input CreateInput) (*Location, error) {
	if input.Name == "" {
		return nil, errors.New("name is required")
	}
	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Check first location → make it default
	count, _ := col().CountDocuments(ctx, bson.M{"tenant_id": tid})

	loc := Location{
		ID:        primitive.NewObjectID(),
		TenantID:  tid,
		Name:      input.Name,
		Address:   input.Address,
		IsDefault: count == 0,
		Active:    true,
		CreatedAt: time.Now(),
	}

	if _, err := col().InsertOne(ctx, loc); err != nil {
		return nil, err
	}
	return &loc, nil
}

func List(tenantID string) ([]Location, error) {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cur, err := col().Find(ctx, bson.M{"tenant_id": tid},
		options.Find().SetSort(bson.M{"created_at": 1}),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var items []Location
	cur.All(ctx, &items)
	if items == nil {
		items = []Location{}
	}
	return items, nil
}

func Update(tenantID, id string, input UpdateInput) (*Location, error) {
	if input.Name == "" {
		return nil, errors.New("name is required")
	}
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	after := options.After
	var loc Location
	err = col().FindOneAndUpdate(ctx,
		bson.M{"_id": oid, "tenant_id": tid},
		bson.M{"$set": bson.M{"name": input.Name, "address": input.Address, "active": input.Active}},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&loc)
	if err != nil {
		return nil, errors.New("location not found")
	}
	return &loc, nil
}

func Delete(tenantID, id string) error {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid id")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	res, err := col().DeleteOne(ctx, bson.M{"_id": oid, "tenant_id": tid, "is_default": false})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return errors.New("cannot delete default location or not found")
	}
	return nil
}
