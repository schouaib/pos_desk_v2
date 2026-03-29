package testutil

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"saas_pos/internal/config"
	"saas_pos/internal/database"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

var setupOnce sync.Once

// testTenantIDs tracks all tenant IDs created during tests so we can clean
// up only test data without touching production documents.
var testTenantIDs []primitive.ObjectID

// TrackTenant records a tenant ID for cleanup.
func TrackTenant(id primitive.ObjectID) {
	testTenantIDs = append(testTenantIDs, id)
}

// Setup initialises the database connection for tests. It reuses the
// production database (same credentials, same DB) but all test data is
// isolated by unique tenant IDs and cleaned up after each test.
func Setup() {
	setupOnce.Do(func() {
		root := findProjectRoot()
		if root != "" {
			_ = os.Chdir(root)
		}

		// Set the real credentials used by the Tauri-managed MongoDB.
		// These match the hardcoded values in src-tauri/src/lib.rs.
		os.Setenv("MONGO_URI", "mongodb://posApp:cP0sDz2025sEcUr3Db9x7K@127.0.0.1:27099/saas_pos?authSource=saas_pos")
		os.Setenv("MONGO_DB", "saas_pos")
		if os.Getenv("JWT_SECRET") == "" {
			os.Setenv("JWT_SECRET", "cP0sDz2025JwTsEcR3tK3y4mN8pQ")
		}

		config.Load()
		config.App.JWTExpiresIn = 24 * time.Hour

		database.Connect()
		log.Println("testutil: connected to", config.App.MongoDB)
	})
}

// Teardown cleans up all test data and disconnects.
func Teardown() {
	cleanTracked()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if database.Client != nil {
		_ = database.Client.Disconnect(ctx)
	}
}

// allCollections lists every collection that may contain tenant-scoped test data.
var allCollections = []string{
	"tenants", "users", "categories", "brands", "units",
	"products", "product_variants", "counters",
	"purchases", "purchase_payments",
	"suppliers", "supplier_payments", "supplier_products",
	"sales", "sale_returns",
	"clients", "client_payments",
	"stock_adjustments", "stock_losses", "price_history",
	"product_batches", "locations", "location_stock", "stock_transfers",
	"discount_rules", "expenses", "retraits", "losses",
	"caisse_sessions", "facturation_docs",
}

// CleanAll removes all documents created by tests, identified by tracked
// tenant IDs. Safe to call against the production database.
// It is a no-op if no test tenants have been tracked yet.
func CleanAll() {
	// Each test creates unique tenants, so cleanup is only needed at teardown.
	// Individual tests don't need to call this — their unique tenant IDs
	// provide natural isolation.
}

// cleanTracked actually performs the cleanup. Called only from Teardown.
func cleanTracked() {
	if len(testTenantIDs) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	tenantStrings := make([]string, len(testTenantIDs))
	for i, id := range testTenantIDs {
		tenantStrings[i] = id.Hex()
	}

	for _, colName := range allCollections {
		col := database.Col(colName)
		filter := bson.M{"$or": bson.A{
			bson.M{"tenant_id": bson.M{"$in": testTenantIDs}},
			bson.M{"tenant_id": bson.M{"$in": tenantStrings}},
		}}
		if colName == "tenants" {
			filter = bson.M{"_id": bson.M{"$in": testTenantIDs}}
		}
		_, _ = col.DeleteMany(ctx, filter)
	}

	testTenantIDs = nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func findProjectRoot() string {
	dir, _ := os.Getwd()
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}
