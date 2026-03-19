package superadmin

import (
	"context"
	"errors"
	"time"

	"saas_pos/internal/database"
	"saas_pos/pkg/features"
	"saas_pos/pkg/jwt"
	"saas_pos/pkg/validate"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

func col() *mongo.Collection {
	return database.Col("super_admins")
}

func Register(input RegisterInput) (*SuperAdmin, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var existing SuperAdmin
	err := col().FindOne(ctx, bson.M{"email": input.Email}).Decode(&existing)
	if err == nil {
		return nil, errors.New("email already in use")
	}

	if err := validate.Password(input.Password); err != nil {
		return nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	admin := SuperAdmin{
		ID:        primitive.NewObjectID(),
		Name:      input.Name,
		Email:     input.Email,
		Password:  string(hash),
		Active:    true,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if _, err = col().InsertOne(ctx, admin); err != nil {
		return nil, err
	}
	return &admin, nil
}

func Login(input LoginInput) (string, *SuperAdmin, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var admin SuperAdmin
	if err := col().FindOne(ctx, bson.M{"email": input.Email, "active": true}).Decode(&admin); err != nil {
		return "", nil, errors.New("invalid credentials")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(admin.Password), []byte(input.Password)); err != nil {
		return "", nil, errors.New("invalid credentials")
	}

	token, err := jwt.Generate(admin.ID.Hex(), admin.Email, RoleSuperAdmin, "", "", jwt.Permissions{}, features.PlanFeatures{})
	if err != nil {
		return "", nil, err
	}
	return token, &admin, nil
}

func Logout(adminID string) {
	// no-op: session storage removed
}

func List(page, limit int) (*ListResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{}
	total, _ := col().CountDocuments(ctx, filter)
	skip := int64((page - 1) * limit)
	opts := options.Find().
		SetSort(bson.M{"created_at": -1}).
		SetSkip(skip).
		SetLimit(int64(limit))

	cursor, err := col().Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	admins := []SuperAdmin{}
	if err = cursor.All(ctx, &admins); err != nil {
		return nil, err
	}

	pages := int(total) / limit
	if int(total)%limit != 0 {
		pages++
	}
	return &ListResult{Items: admins, Total: total, Page: page, Limit: limit, Pages: pages}, nil
}

// NeedsSetup returns true when no super admin exists yet.
func NeedsSetup() (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	count, err := col().CountDocuments(ctx, bson.M{})
	if err != nil {
		return false, err
	}
	return count == 0, nil
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
