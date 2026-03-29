package testutil

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"saas_pos/internal/database"
	"saas_pos/pkg/features"
	"saas_pos/pkg/jwt"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/crypto/bcrypt"
)

var tenantCounter atomic.Int64

// ---------- Tenant ----------

// TestTenant is the in-DB representation used by factories.
type TestTenant struct {
	ID             primitive.ObjectID    `bson:"_id"`
	Name           string                `bson:"name"`
	Email          string                `bson:"email"`
	Active         bool                  `bson:"active"`
	Features       features.PlanFeatures `bson:"features"`
	MaxProducts    int                   `bson:"max_products"`
	MaxUsers       int                   `bson:"max_users"`
	MaxSalesMonth  int                   `bson:"max_sales_month"`
	PlanExpiresAt  time.Time             `bson:"plan_expires_at"`
	CreatedAt      time.Time             `bson:"created_at"`
	UpdatedAt      time.Time             `bson:"updated_at"`
}

func allFeaturesEnabled() features.PlanFeatures {
	return features.PlanFeatures{
		Products: true, Purchases: true, Suppliers: true, Sales: true,
		POS: true, Losses: true, Expenses: true, Retraits: true, Stats: true,
		MultiBarcodes: true, ProductHistory: true, Clients: true,
		ClientPayments: true, UserSummary: true, MultiFolders: true,
		AccessManagement: true, Favorites: true, ProductVariants: true,
		StockTransfers: true, ProductDiscounts: true, ProductBundles: true,
		BatchTracking: true, Scale: true, Facturation: true,
	}
}

// CreateTenant inserts a fully-enabled test tenant and returns its hex ID.
func CreateTenant(t *testing.T) string {
	t.Helper()
	tenant := TestTenant{
		ID:            primitive.NewObjectID(),
		Name:          "Test Store",
		Email:         fmt.Sprintf("test-%d-%s@store.local", tenantCounter.Add(1), primitive.NewObjectID().Hex()),
		Active:        true,
		Features:      allFeaturesEnabled(),
		MaxProducts:   0, // unlimited
		MaxUsers:      0,
		MaxSalesMonth: 0,
		PlanExpiresAt: time.Now().Add(365 * 24 * time.Hour),
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := database.Col("tenants").InsertOne(ctx, tenant)
	if err != nil {
		t.Fatalf("CreateTenant: %v", err)
	}
	TrackTenant(tenant.ID)
	return tenant.ID.Hex()
}

// CreateTenantWithLimits inserts a tenant with specific plan limits.
func CreateTenantWithLimits(t *testing.T, maxProducts, maxUsers, maxSales int) string {
	t.Helper()
	tenant := TestTenant{
		ID:            primitive.NewObjectID(),
		Name:          "Limited Store",
		Email:         fmt.Sprintf("limited-%d-%s@store.local", tenantCounter.Add(1), primitive.NewObjectID().Hex()),
		Active:        true,
		Features:      allFeaturesEnabled(),
		MaxProducts:   maxProducts,
		MaxUsers:      maxUsers,
		MaxSalesMonth: maxSales,
		PlanExpiresAt: time.Now().Add(365 * 24 * time.Hour),
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := database.Col("tenants").InsertOne(ctx, tenant)
	if err != nil {
		t.Fatalf("CreateTenantWithLimits: %v", err)
	}
	TrackTenant(tenant.ID)
	return tenant.ID.Hex()
}

// ---------- User + JWT ----------

type TestUser struct {
	ID       primitive.ObjectID `bson:"_id"`
	TenantID primitive.ObjectID `bson:"tenant_id"`
	Name     string             `bson:"name"`
	Email    string             `bson:"email"`
	Password string             `bson:"password"`
	Role     string             `bson:"role"`
	Active   bool               `bson:"active"`
	Perms    jwt.Permissions    `bson:"permissions"`
	CreatedAt time.Time         `bson:"created_at"`
	UpdatedAt time.Time         `bson:"updated_at"`
}

func fullPermissions() jwt.Permissions {
	full := jwt.ModulePerms{
		View: true, Add: true, Edit: true, Delete: true,
		Movement: true, Loss: true, Validate: true, Pay: true,
		Earnings: true, UserSummary: true, Adjustment: true,
		Alert: true, Export: true, Return: true, Archive: true,
		PriceHistory: true, Valuation: true,
		ViewPrixAchat: true, ViewQty: true, ViewPV1: true, ViewPV2: true, ViewPV3: true,
		BC: true, Devis: true, Avoir: true,
	}
	return jwt.Permissions{
		Products: full, Categories: full, Brands: full, Units: full,
		Purchases: full, Suppliers: full, Sales: full, Expenses: full,
		Retraits: full, Folders: full, Favorites: full, Facturation: full,
	}
}

// CreateUser inserts a test user and returns (userID, JWT token).
func CreateUser(t *testing.T, tenantID, role string) (string, string) {
	t.Helper()
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	hash, _ := bcrypt.GenerateFromPassword([]byte("Test1234!"), bcrypt.MinCost)

	uid := primitive.NewObjectID()
	user := TestUser{
		ID:        uid,
		TenantID:  tid,
		Name:      "Test User",
		Email:     "user-" + uid.Hex() + "@test.local",
		Password:  string(hash),
		Role:      role,
		Active:    true,
		Perms:     fullPermissions(),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := database.Col("users").InsertOne(ctx, user)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	token, err := jwt.Generate(
		user.ID.Hex(), user.Email, role, tenantID, "test-session",
		user.Perms, allFeaturesEnabled(),
	)
	if err != nil {
		t.Fatalf("CreateUser JWT: %v", err)
	}
	return user.ID.Hex(), token
}

// CreateCashierWithPerms inserts a cashier with specific permissions.
func CreateCashierWithPerms(t *testing.T, tenantID string, perms jwt.Permissions) (string, string) {
	t.Helper()
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	hash, _ := bcrypt.GenerateFromPassword([]byte("Test1234!"), bcrypt.MinCost)

	user := TestUser{
		ID:        primitive.NewObjectID(),
		TenantID:  tid,
		Name:      "Limited Cashier",
		Email:     "cashier-" + primitive.NewObjectID().Hex()[:8] + "@test.local",
		Password:  string(hash),
		Role:      "cashier",
		Active:    true,
		Perms:     perms,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := database.Col("users").InsertOne(ctx, user)
	if err != nil {
		t.Fatalf("CreateCashierWithPerms: %v", err)
	}
	token, err := jwt.Generate(
		user.ID.Hex(), user.Email, "cashier", tenantID, "test-session",
		perms, allFeaturesEnabled(),
	)
	if err != nil {
		t.Fatalf("CreateCashierWithPerms JWT: %v", err)
	}
	return user.ID.Hex(), token
}

// ---------- Helpers for reading back from DB ----------

// GetProductStock reads the current qty_available for a product.
func GetProductStock(t *testing.T, tenantID, productID string) float64 {
	t.Helper()
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	pid, _ := primitive.ObjectIDFromHex(productID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var p struct {
		QtyAvailable float64 `bson:"qty_available"`
	}
	err := database.Col("products").FindOne(ctx, bson.M{"_id": pid, "tenant_id": tid}).Decode(&p)
	if err != nil {
		t.Fatalf("GetProductStock: %v", err)
	}
	return p.QtyAvailable
}

// GetVariantStock reads the current qty_available for a variant.
func GetVariantStock(t *testing.T, variantID string) float64 {
	t.Helper()
	vid, _ := primitive.ObjectIDFromHex(variantID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var v struct {
		QtyAvailable float64 `bson:"qty_available"`
	}
	err := database.Col("product_variants").FindOne(ctx, bson.M{"_id": vid}).Decode(&v)
	if err != nil {
		t.Fatalf("GetVariantStock: %v", err)
	}
	return v.QtyAvailable
}

// GetClientBalance reads the current balance for a client.
func GetClientBalance(t *testing.T, tenantID, clientID string) float64 {
	t.Helper()
	cid, _ := primitive.ObjectIDFromHex(clientID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var c struct {
		Balance float64 `bson:"balance"`
	}
	err := database.Col("clients").FindOne(ctx, bson.M{"_id": cid, "tenant_id": tenantID}).Decode(&c)
	if err != nil {
		t.Fatalf("GetClientBalance: %v", err)
	}
	return c.Balance
}

// GetSupplierBalance reads the current balance for a supplier.
func GetSupplierBalance(t *testing.T, tenantID, supplierID string) float64 {
	t.Helper()
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	sid, _ := primitive.ObjectIDFromHex(supplierID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var s struct {
		Balance float64 `bson:"balance"`
	}
	err := database.Col("suppliers").FindOne(ctx, bson.M{"_id": sid, "tenant_id": tid}).Decode(&s)
	if err != nil {
		t.Fatalf("GetSupplierBalance: %v", err)
	}
	return s.Balance
}

// GetProductPrixAchat reads the current prix_achat for a product.
func GetProductPrixAchat(t *testing.T, tenantID, productID string) float64 {
	t.Helper()
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	pid, _ := primitive.ObjectIDFromHex(productID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var p struct {
		PrixAchat float64 `bson:"prix_achat"`
	}
	err := database.Col("products").FindOne(ctx, bson.M{"_id": pid, "tenant_id": tid}).Decode(&p)
	if err != nil {
		t.Fatalf("GetProductPrixAchat: %v", err)
	}
	return p.PrixAchat
}
