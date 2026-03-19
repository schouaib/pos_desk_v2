package category

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

func col() *mongo.Collection {
	return database.Col("categories")
}

func Create(tenantID string, input CreateInput) (*Category, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if input.Name == "" {
		return nil, errors.New("name is required")
	}

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	count, err := col().CountDocuments(ctx, bson.M{"tenant_id": tid, "name": input.Name})
	if err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, errors.New("category already exists")
	}

	now := time.Now()
	c := Category{
		ID:        primitive.NewObjectID(),
		TenantID:  tid,
		Name:      input.Name,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if _, err = col().InsertOne(ctx, c); err != nil {
		return nil, err
	}
	return &c, nil
}

func List(tenantID, q string, page, limit int) (*ListResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	if limit < 1 || limit > 500 {
		limit = 500
	}
	if page < 1 {
		page = 1
	}
	skip := int64((page - 1) * limit)

	filter := bson.M{"tenant_id": tid}
	if q != "" {
		filter["name"] = bson.M{"$regex": q, "$options": "i"}
	}

	total, err := col().CountDocuments(ctx, filter)
	if err != nil {
		return nil, err
	}

	cursor, err := col().Find(ctx, filter,
		options.Find().
			SetSort(bson.M{"name": 1}).
			SetSkip(skip).
			SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	items := []Category{}
	if err = cursor.All(ctx, &items); err != nil {
		return nil, err
	}

	pages := int(math.Ceil(float64(total) / float64(limit)))
	if pages == 0 {
		pages = 1
	}
	return &ListResult{Items: items, Total: total, Page: page, Limit: limit, Pages: pages}, nil
}

func Update(tenantID, id string, input UpdateInput) (*Category, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if input.Name == "" {
		return nil, errors.New("name is required")
	}

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	count, err := col().CountDocuments(ctx, bson.M{
		"_id":       bson.M{"$ne": oid},
		"tenant_id": tid,
		"name":      input.Name,
	})
	if err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, errors.New("category already exists")
	}

	after := options.After
	var c Category
	err = col().FindOneAndUpdate(ctx,
		bson.M{"_id": oid, "tenant_id": tid},
		bson.M{"$set": bson.M{"name": input.Name, "updated_at": time.Now()}},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&c)
	if err != nil {
		return nil, errors.New("category not found")
	}
	return &c, nil
}

func Delete(tenantID, id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid id")
	}

	res, err := col().DeleteOne(ctx, bson.M{"_id": oid, "tenant_id": tid})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return errors.New("category not found")
	}
	return nil
}
