package user

import (
	"context"
	"errors"
	"time"

	"saas_pos/internal/config"
	"saas_pos/internal/database"
	"saas_pos/pkg/features"
	"saas_pos/pkg/jwt"
	rdb "saas_pos/pkg/redis"
	"saas_pos/pkg/validate"

	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

func col() *mongo.Collection {
	return database.Col("users")
}

func Create(tenantID string, input CreateInput) (*User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	// enforce valid roles
	if input.Role != RoleTenantAdmin && input.Role != RoleCashier {
		return nil, errors.New("role must be tenant_admin or cashier")
	}

	// Enforce max_users plan limit
	var tenantLimits struct {
		MaxUsers int `bson:"max_users"`
	}
	if err = database.Col("tenants").FindOne(ctx, bson.M{"_id": tid}).Decode(&tenantLimits); err == nil {
		if tenantLimits.MaxUsers > 0 {
			count, _ := col().CountDocuments(ctx, bson.M{"tenant_id": tid})
			if count >= int64(tenantLimits.MaxUsers) {
				return nil, errors.New("user limit reached for your plan")
			}
		}
	}

	var existing User
	if err = col().FindOne(ctx, bson.M{"tenant_id": tid, "email": input.Email}).Decode(&existing); err == nil {
		return nil, errors.New("email already in use for this tenant")
	}

	if err := validate.Password(input.Password); err != nil {
		return nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	u := User{
		ID:          primitive.NewObjectID(),
		TenantID:    tid,
		Name:        input.Name,
		Email:       input.Email,
		Password:    string(hash),
		Role:        input.Role,
		Permissions: input.Permissions,
		Active:      false,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if _, err = col().InsertOne(ctx, u); err != nil {
		return nil, err
	}
	return &u, nil
}

func ListByTenant(tenantID string) ([]User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	cursor, err := col().Find(ctx, bson.M{"tenant_id": tid},
		options.Find().SetSort(bson.M{"created_at": -1}),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	users := []User{}
	if err = cursor.All(ctx, &users); err != nil {
		return nil, err
	}
	return users, nil
}

func ListByTenantPaged(tenantID string, page, limit int) (*ListResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	filter := bson.M{"tenant_id": tid}
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

	items := []User{}
	if err = cursor.All(ctx, &items); err != nil {
		return nil, err
	}

	pages := int(total) / limit
	if int(total)%limit != 0 {
		pages++
	}
	return &ListResult{Items: items, Total: total, Page: page, Limit: limit, Pages: pages}, nil
}

func GetByID(tenantID, id string) (*User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	var u User
	if err = col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tid}).Decode(&u); err != nil {
		return nil, errors.New("user not found")
	}
	return &u, nil
}

func Update(tenantID, id string, input UpdateInput) (*User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	set := bson.M{"updated_at": time.Now(), "permissions": input.Permissions}
	if input.Name != "" {
		set["name"] = input.Name
	}
	if input.Role == RoleTenantAdmin || input.Role == RoleCashier {
		set["role"] = input.Role
	}

	after := options.After
	var u User
	err = col().FindOneAndUpdate(ctx,
		bson.M{"_id": oid, "tenant_id": tid},
		bson.M{"$set": set},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&u)
	if err != nil {
		return nil, errors.New("user not found")
	}
	return &u, nil
}

func SetActive(tenantID, id string, active bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid id")
	}

	_, err = col().UpdateOne(ctx,
		bson.M{"_id": oid, "tenant_id": tid},
		bson.M{"$set": bson.M{"active": active, "updated_at": time.Now()}},
	)
	return err
}

// Login authenticates a tenant user and returns a JWT.
// Blocks login if the user is disabled OR if the store (tenant) is disabled.
func Login(input LoginInput) (string, *User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Find user by email
	var u User
	if err := col().FindOne(ctx, bson.M{"email": input.Email}).Decode(&u); err != nil {
		return "", nil, errors.New("invalid credentials")
	}

	// Check password before revealing account status
	if err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(input.Password)); err != nil {
		return "", nil, errors.New("invalid credentials")
	}

	// Check user is active
	if !u.Active {
		return "", nil, errors.New("your account is disabled — please contact the administrator")
	}

	// Check tenant (store) is active and plan not expired
	var t struct {
		Active        bool                  `bson:"active"`
		PlanExpiresAt time.Time             `bson:"plan_expires_at"`
		Features      features.PlanFeatures `bson:"features"`
	}
	if err := database.Col("tenants").FindOne(ctx, bson.M{"_id": u.TenantID}).Decode(&t); err != nil || !t.Active {
		return "", nil, errors.New("your store is disabled — please contact the administrator")
	}
	if !t.PlanExpiresAt.IsZero() && time.Now().After(t.PlanExpiresAt) {
		return "", nil, errors.New("plan expired")
	}

	sessionToken := uuid.New().String()
	if err := rdb.Set("session:"+u.ID.Hex(), sessionToken, config.App.JWTExpiresIn); err != nil {
		return "", nil, errors.New("failed to create session")
	}

	token, err := jwt.Generate(u.ID.Hex(), u.Email, u.Role, u.TenantID.Hex(), sessionToken, u.Permissions, t.Features)
	if err != nil {
		return "", nil, err
	}
	return token, &u, nil
}

// LinkedTenantInfo is a lightweight struct for the login response.
type LinkedTenantInfo struct {
	ID         primitive.ObjectID `json:"id"`
	Name       string             `json:"name"`
	FolderName string             `json:"folder_name"`
}

// GetLinkedTenants returns all folders the user's tenant belongs to.
func GetLinkedTenants(tenantID primitive.ObjectID) []LinkedTenantInfo {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var current struct {
		ParentID primitive.ObjectID `bson:"parent_id"`
	}
	database.Col("tenants").FindOne(ctx, bson.M{"_id": tenantID}).Decode(&current)

	rootID := tenantID
	if !current.ParentID.IsZero() {
		rootID = current.ParentID
	}

	filter := bson.M{"$or": bson.A{
		bson.M{"_id": rootID},
		bson.M{"parent_id": rootID},
	}}

	cursor, err := database.Col("tenants").Find(ctx, filter)
	if err != nil {
		return nil
	}
	defer cursor.Close(ctx)

	var results []LinkedTenantInfo
	for cursor.Next(ctx) {
		var t struct {
			ID         primitive.ObjectID `bson:"_id"`
			Name       string             `bson:"name"`
			FolderName string             `bson:"folder_name"`
		}
		if cursor.Decode(&t) == nil {
			fn := t.FolderName
			if fn == "" {
				fn = "Main"
			}
			results = append(results, LinkedTenantInfo{ID: t.ID, Name: t.Name, FolderName: fn})
		}
	}
	if len(results) <= 1 {
		return nil
	}
	return results
}

func Logout(userID string) {
	_ = rdb.Del("session:" + userID)
}
