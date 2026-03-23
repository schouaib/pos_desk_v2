package tenant

import (
	"context"
	"errors"
	"time"

	"saas_pos/internal/database"
	"saas_pos/pkg/features"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// planData holds the limits and features copied from a subscription plan.
type planData struct {
	MaxUsers      int                   `bson:"max_users"`
	MaxProducts   int                   `bson:"max_products"`
	MaxSalesMonth int                   `bson:"max_sales_month"`
	Features      features.PlanFeatures `bson:"features"`
}

func fetchPlan(ctx context.Context, planID primitive.ObjectID) (*planData, error) {
	var p planData
	if err := database.Col("subscription_plans").FindOne(ctx, bson.M{"_id": planID}).Decode(&p); err != nil {
		return nil, errors.New("plan not found")
	}
	return &p, nil
}

func col() *mongo.Collection {
	return database.Col("tenants")
}

func Create(input CreateInput) (*Tenant, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var existing Tenant
	if err := col().FindOne(ctx, bson.M{"email": input.Email}).Decode(&existing); err == nil {
		return nil, errors.New("email already in use")
	}

	planID, err := primitive.ObjectIDFromHex(input.PlanID)
	if err != nil {
		return nil, errors.New("invalid plan_id")
	}

	plan, err := fetchPlan(ctx, planID)
	if err != nil {
		return nil, err
	}

	expiresAt, err := time.Parse(time.RFC3339, input.PlanExpiresAt)
	if err != nil {
		expiresAt = time.Now().AddDate(0, 1, 0) // default 1 month
	}

	now := time.Now()
	t := Tenant{
		ID:            primitive.NewObjectID(),
		Name:          input.Name,
		Email:         input.Email,
		Phone:         input.Phone,
		BrandColor:    input.BrandColor,
		PlanID:        planID,
		Features:      plan.Features,
		MaxUsers:      plan.MaxUsers,
		MaxProducts:   plan.MaxProducts,
		MaxSalesMonth: plan.MaxSalesMonth,
		Active:        false,
		SubscribedAt:  now,
		PlanExpiresAt: expiresAt,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if _, err = col().InsertOne(ctx, t); err != nil {
		return nil, err
	}
	return &t, nil
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

	tenants := []Tenant{}
	if err = cursor.All(ctx, &tenants); err != nil {
		return nil, err
	}

	pages := int(total) / limit
	if int(total)%limit != 0 {
		pages++
	}
	return &ListResult{Items: tenants, Total: total, Page: page, Limit: limit, Pages: pages}, nil
}

func GetByID(id string) (*Tenant, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	var t Tenant
	if err = col().FindOne(ctx, bson.M{"_id": oid}).Decode(&t); err != nil {
		return nil, errors.New("tenant not found")
	}
	return &t, nil
}

func Update(id string, input UpdateInput) (*Tenant, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	set := bson.M{
		"name":        input.Name,
		"phone":       input.Phone,
		"brand_color": input.BrandColor,
		"updated_at":  time.Now(),
	}

	if input.PlanID != "" {
		planID, err := primitive.ObjectIDFromHex(input.PlanID)
		if err == nil {
			set["plan_id"] = planID
			if plan, err := fetchPlan(ctx, planID); err == nil {
				set["features"]        = plan.Features
				set["max_users"]       = plan.MaxUsers
				set["max_products"]    = plan.MaxProducts
				set["max_sales_month"] = plan.MaxSalesMonth
			}
		}
	}
	if input.PlanExpiresAt != "" {
		if exp, err := time.Parse(time.RFC3339, input.PlanExpiresAt); err == nil {
			set["plan_expires_at"] = exp
		}
	}

	after := options.After
	var t Tenant
	err = col().FindOneAndUpdate(ctx, bson.M{"_id": oid}, bson.M{"$set": set},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&t)
	if err != nil {
		return nil, err
	}
	return &t, nil
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

// GetSettings returns the tenant's own settings (used by the tenant panel).
func GetSettings(tenantID string) (*Tenant, error) {
	return GetByID(tenantID)
}

// UpdateSettings lets a tenant admin update their own store settings.
func UpdateSettings(tenantID string, input SettingsInput) (*Tenant, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	oid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	currency := input.Currency
	if currency == "" {
		currency = "DZD"
	}

	defaultSalePrice := input.DefaultSalePrice
	if defaultSalePrice < 1 || defaultSalePrice > 3 {
		defaultSalePrice = 1
	}

	set := bson.M{
		"name":               input.Name,
		"phone":              input.Phone,
		"address":            input.Address,
		"logo_url":           input.LogoURL,
		"currency":           currency,
		"default_sale_price": defaultSalePrice,
		"rc":                 input.RC,
		"nif":                input.NIF,
		"nis":                input.NIS,
		"nart":               input.NART,
		"compte_rib":         input.CompteRIB,
		"use_vat":              input.UseVAT,
		"pos_expiry_warning":  input.PosExpiryWarning,
		"max_cash_amount":     input.MaxCashAmount,
		"tap_rate":            input.TapRate,
		"ibs_rate":            input.IbsRate,
		"updated_at":          time.Now(),
	}

	after := options.After
	var t Tenant
	err = col().FindOneAndUpdate(ctx, bson.M{"_id": oid}, bson.M{"$set": set},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&t)
	if err != nil {
		return nil, errors.New("tenant not found")
	}
	return &t, nil
}

// UpdatePosFavorites saves the list of product IDs for the POS favorites grid.
func UpdatePosFavorites(tenantID string, productIDs []primitive.ObjectID, colors map[string]string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	oid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return errors.New("invalid tenant_id")
	}

	if productIDs == nil {
		productIDs = []primitive.ObjectID{}
	}
	if colors == nil {
		colors = map[string]string{}
	}

	_, err = col().UpdateOne(ctx, bson.M{"_id": oid}, bson.M{"$set": bson.M{
		"pos_favorites":  productIDs,
		"pos_fav_colors": colors,
		"updated_at":     time.Now(),
	}})
	return err
}

// UpdatePosFavGroups saves the sub-favorite groups for the POS catalog.
func UpdatePosFavGroups(tenantID string, groups []PosFavGroup) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	oid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return errors.New("invalid tenant_id")
	}

	if groups == nil {
		groups = []PosFavGroup{}
	}

	_, err = col().UpdateOne(ctx, bson.M{"_id": oid}, bson.M{"$set": bson.M{
		"pos_fav_groups": groups,
		"updated_at":     time.Now(),
	}})
	return err
}

// ListLinked returns all tenants in the same folder group (parent + children).
func ListLinked(tenantID string) ([]Tenant, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	oid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	var current Tenant
	if err := col().FindOne(ctx, bson.M{"_id": oid}).Decode(&current); err != nil {
		return nil, errors.New("tenant not found")
	}

	rootID := oid
	if !current.ParentID.IsZero() {
		rootID = current.ParentID
	}

	filter := bson.M{"$or": bson.A{
		bson.M{"_id": rootID},
		bson.M{"parent_id": rootID},
	}}

	cursor, err := col().Find(ctx, filter, options.Find().SetSort(bson.M{"created_at": 1}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var tenants []Tenant
	if err = cursor.All(ctx, &tenants); err != nil {
		return nil, err
	}
	return tenants, nil
}

// GetActiveByID is used internally to check if a tenant is active.
func GetActiveByID(id string) (*Tenant, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	var t Tenant
	if err = col().FindOne(ctx, bson.M{"_id": oid, "active": true}).Decode(&t); err != nil {
		return nil, errors.New("tenant not found or disabled")
	}
	return &t, nil
}
