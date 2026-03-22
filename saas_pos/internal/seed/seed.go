package seed

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"time"

	"saas_pos/internal/database"
	"saas_pos/pkg/features"
	"saas_pos/pkg/jwt"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/crypto/bcrypt"
)

// mongoCredentials matches the Rust-side MongoCredentials struct
type mongoCredentials struct {
	AdminUser  string `json:"admin_user"`
	AdminPass  string `json:"admin_pass"`
	AppUser    string `json:"app_user"`
	AppPass    string `json:"app_pass"`
	JWTSecret  string `json:"jwt_secret"`
	Initialized bool  `json:"initialized"`
}

// InitMongoAuth reads the init signal file and creates MongoDB database users.
// Called on first launch when mongod is running without --auth.
// After creating users, marks credentials as initialized so Tauri restarts with --auth next time.
func InitMongoAuth() {
	// Find the signal file in the app data directory
	// Tauri writes it next to the db directory
	initPath := findInitSignalFile()
	if initPath == "" {
		return // No signal file = not first launch or already done
	}

	data, err := os.ReadFile(initPath)
	if err != nil {
		log.Printf("seed/auth: failed to read init signal: %v", err)
		return
	}

	var creds mongoCredentials
	if err := json.Unmarshal(data, &creds); err != nil {
		log.Printf("seed/auth: failed to parse init signal: %v", err)
		return
	}

	log.Println("seed/auth: creating MongoDB database users...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Create admin user on the admin database
	adminDB := database.Client.Database("admin")
	adminCmd := bson.D{
		{Key: "createUser", Value: creds.AdminUser},
		{Key: "pwd", Value: creds.AdminPass},
		{Key: "roles", Value: bson.A{bson.D{{Key: "role", Value: "root"}, {Key: "db", Value: "admin"}}}},
	}
	if err := adminDB.RunCommand(ctx, adminCmd).Err(); err != nil {
		// Ignore "already exists" errors
		if !isAlreadyExistsError(err) {
			log.Printf("seed/auth: failed to create admin user: %v", err)
			return
		}
		log.Println("seed/auth: admin user already exists, skipping")
	} else {
		log.Println("seed/auth: created MongoDB admin user (posAdmin)")
	}

	// Create app user on the saas_pos database
	appDB := database.Client.Database("saas_pos")
	appCmd := bson.D{
		{Key: "createUser", Value: creds.AppUser},
		{Key: "pwd", Value: creds.AppPass},
		{Key: "roles", Value: bson.A{bson.D{{Key: "role", Value: "readWrite"}, {Key: "db", Value: "saas_pos"}}}},
	}
	if err := appDB.RunCommand(ctx, appCmd).Err(); err != nil {
		if !isAlreadyExistsError(err) {
			log.Printf("seed/auth: failed to create app user: %v", err)
			return
		}
		log.Println("seed/auth: app user already exists, skipping")
	} else {
		log.Println("seed/auth: created MongoDB app user (posApp)")
	}

	// Mark credentials as initialized
	creds.Initialized = true
	credsPath := filepath.Join(filepath.Dir(initPath), "mongo_credentials.json")
	if updatedJSON, err := json.MarshalIndent(creds, "", "  "); err == nil {
		os.WriteFile(credsPath, updatedJSON, 0600)
	}

	// Remove the signal file
	os.Remove(initPath)

	log.Println("seed/auth: MongoDB auth users created! Auth will be enabled on next app restart.")
}

func isAlreadyExistsError(err error) bool {
	return err != nil && (
		contains(err.Error(), "already exists") ||
		contains(err.Error(), "User") && contains(err.Error(), "already"))
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// findInitSignalFile looks for mongo_init_pending.json in common app data locations
func findInitSignalFile() string {
	// Try to find it relative to the executable (same dir as Tauri app data)
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		// Check in parent directories (Tauri app data is usually up from the binary)
		for _, candidate := range []string{
			filepath.Join(dir, "mongo_init_pending.json"),
			filepath.Join(dir, "..", "mongo_init_pending.json"),
		} {
			if _, err := os.Stat(candidate); err == nil {
				return candidate
			}
		}
	}

	// Check common Tauri app data directories
	home, _ := os.UserHomeDir()
	candidates := []string{
		// macOS
		filepath.Join(home, "Library", "Application Support", "com.ciposdz.pos-desktop", "mongo_init_pending.json"),
		// Windows
		filepath.Join(home, "AppData", "Roaming", "com.ciposdz.pos-desktop", "mongo_init_pending.json"),
		// Linux
		filepath.Join(home, ".local", "share", "com.ciposdz.pos-desktop", "mongo_init_pending.json"),
	}
	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	return ""
}

// RunDesktopSeed checks if the database is empty and seeds default data
// for a local desktop installation: super admin, plan, tenant, and POS user.
// This only runs when no super admin exists (fresh install).
func RunDesktopSeed() {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Check if any super admin exists — if so, skip seeding
	count, err := database.Col("super_admins").CountDocuments(ctx, bson.M{})
	if err != nil {
		log.Printf("seed: failed to check super_admins: %v", err)
		return
	}
	if count > 0 {
		return // Already seeded
	}

	log.Println("seed: first launch detected — seeding default data...")

	now := time.Now()

	// 1. Create super admin
	saHash, _ := bcrypt.GenerateFromPassword([]byte("admin1234"), bcrypt.DefaultCost)
	superAdminID := primitive.NewObjectID()
	_, err = database.Col("super_admins").InsertOne(ctx, bson.M{
		"_id":                    superAdminID,
		"name":                   "Admin",
		"email":                  "admin",
		"password":               string(saHash),
		"active":                 true,
		"must_change_password":   true,
		"created_at":             now,
		"updated_at":             now,
	})
	if err != nil {
		log.Printf("seed: failed to create super admin: %v", err)
		return
	}
	log.Println("seed: created super admin (admin / admin1234)")

	// 2. Create unlimited local plan (all features enabled)
	allFeatures := features.PlanFeatures{
		Products:         true,
		Purchases:        true,
		Suppliers:        true,
		Sales:            true,
		POS:              true,
		Losses:           true,
		Expenses:         true,
		Retraits:         true,
		Stats:            true,
		MultiBarcodes:    true,
		ProductHistory:   true,
		Clients:          true,
		ClientPayments:   true,
		UserSummary:      true,
		MultiFolders:     true,
		AccessManagement: true,
		Favorites:        true,
		ProductVariants:  true,
		StockTransfers:   true,
		ProductDiscounts: true,
		ProductBundles:   true,
		BatchTracking:    true,
		Scale:            true,
	}

	planID := primitive.NewObjectID()
	_, err = database.Col("subscription_plans").InsertOne(ctx, bson.M{
		"_id":              planID,
		"name":             "Local Plan",
		"description":      "Unlimited local desktop plan",
		"price":            0,
		"max_users":        0, // 0 = unlimited
		"max_products":     0,
		"max_sales_month":  0,
		"features":         allFeatures,
		"active":           true,
		"created_at":       now,
		"updated_at":       now,
	})
	if err != nil {
		log.Printf("seed: failed to create plan: %v", err)
		return
	}
	log.Println("seed: created 'Local Plan' (unlimited)")

	// 3. Create default tenant (store)
	tenantID := primitive.NewObjectID()
	_, err = database.Col("tenants").InsertOne(ctx, bson.M{
		"_id":              tenantID,
		"name":             "My Store",
		"email":            "store",
		"phone":            "",
		"address":          "",
		"logo_url":         "",
		"brand_color":      "#4F46E5",
		"currency":         "DZD",
		"default_sale_price": 1,
		"plan_id":          planID,
		"features":         allFeatures,
		"max_users":        0,
		"max_products":     0,
		"max_sales_month":  0,
		"active":           true,
		"subscribed_at":    now,
		"plan_expires_at":  now.AddDate(100, 0, 0), // expires in 100 years
		"created_at":       now,
		"updated_at":       now,
	})
	if err != nil {
		log.Printf("seed: failed to create tenant: %v", err)
		return
	}
	log.Println("seed: created tenant 'My Store'")

	// 4. Create default tenant admin user
	adminHash, _ := bcrypt.GenerateFromPassword([]byte("admin1234"), bcrypt.DefaultCost)
	_, err = database.Col("users").InsertOne(ctx, bson.M{
		"_id":                  primitive.NewObjectID(),
		"tenant_id":            tenantID,
		"name":                 "Admin",
		"email":                "admin",
		"password":             string(adminHash),
		"role":                 "tenant_admin",
		"permissions":          jwt.Permissions{},
		"active":               true,
		"must_change_password": true,
		"created_at":           now,
		"updated_at":           now,
	})
	if err != nil {
		log.Printf("seed: failed to create admin user: %v", err)
		return
	}
	log.Println("seed: created tenant admin (admin / admin1234)")

	// 5. Create default cashier user
	cashierHash, _ := bcrypt.GenerateFromPassword([]byte("pos1234!"), bcrypt.DefaultCost)
	_, err = database.Col("users").InsertOne(ctx, bson.M{
		"_id":       primitive.NewObjectID(),
		"tenant_id": tenantID,
		"name":      "Cashier",
		"email":     "cashier",
		"password":  string(cashierHash),
		"role":      "cashier",
		"permissions": jwt.Permissions{
			Products:   jwt.ModulePerms{View: true},
			Categories: jwt.ModulePerms{View: true},
			Brands:     jwt.ModulePerms{View: true},
			Units:      jwt.ModulePerms{View: true},
			Sales:      jwt.ModulePerms{View: true, Add: true},
			Favorites:  jwt.ModulePerms{View: true},
		},
		"active":               true,
		"must_change_password": true,
		"created_at":           now,
		"updated_at":           now,
	})
	if err != nil {
		log.Printf("seed: failed to create cashier user: %v", err)
		return
	}
	log.Println("seed: created cashier (cashier / pos1234!)")
	log.Println("seed: default data seeded successfully!")
}
