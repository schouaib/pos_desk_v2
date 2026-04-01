package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"saas_pos/internal/config"
	"saas_pos/internal/database"
	"saas_pos/internal/metrics"
	"saas_pos/internal/middleware"
	"saas_pos/internal/seed"
	"saas_pos/internal/activation"
	"saas_pos/internal/adjustment"
	"saas_pos/internal/batch"
	"saas_pos/internal/brand"
	"saas_pos/internal/caisse"
	"saas_pos/internal/category"
	"saas_pos/internal/chat"
	"saas_pos/internal/client"
	"saas_pos/internal/discount"
	"saas_pos/internal/docimport"
	"saas_pos/internal/dvr"
	"saas_pos/internal/expense"
	"saas_pos/internal/folder"
	"saas_pos/internal/location"
	"saas_pos/internal/loss"
	"saas_pos/internal/price_history"
	"saas_pos/internal/product"
	"saas_pos/internal/purchase"
	"saas_pos/internal/retrait"
	"saas_pos/internal/sale"
	"saas_pos/internal/sale_return"
	"saas_pos/internal/signup"
	"saas_pos/internal/storage"
	"saas_pos/internal/superadmin"
	"saas_pos/internal/subscription"
	"saas_pos/internal/supplier"
	"saas_pos/internal/supplier_product"
	"saas_pos/internal/tenant"
	"saas_pos/internal/transfer"
	"saas_pos/internal/unit"
	"saas_pos/internal/user"
	"saas_pos/internal/facturation"
	"saas_pos/internal/remotescan"
	"saas_pos/internal/scale"
	"saas_pos/internal/testrunner"
	"saas_pos/internal/variant"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"go.mongodb.org/mongo-driver/bson"
)

func disableExpiredTenants() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	now := time.Now()
	res, err := database.Col("tenants").UpdateMany(ctx,
		bson.M{"active": true, "plan_expires_at": bson.M{"$lt": now, "$gt": time.Time{}}},
		bson.M{"$set": bson.M{"active": false, "updated_at": now}},
	)
	if err != nil {
		log.Printf("plan expiry job error: %v", err)
	} else if res.ModifiedCount > 0 {
		log.Printf("plan expiry job: disabled %d tenant(s)", res.ModifiedCount)
	}
}

func startPlanExpiryJob(done <-chan struct{}) {
	go func() {
		disableExpiredTenants()
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				disableExpiredTenants()
			}
		}
	}()
}

var authLimiter fiber.Handler

func main() {
	config.Load()
	database.Connect()
	database.EnsureIndexes()
	seed.RunDesktopSeed()
	done := make(chan struct{})
	metrics.Init(done)
	startPlanExpiryJob(done)

	app := fiber.New(fiber.Config{
		// Reduce memory: disable pre-fork, limit body size
		Prefork:        false,
		BodyLimit:      2 * 1024 * 1024, // 2 MB
		ReadBufferSize: 16384,           // 16 KB — needed for enlarged JWT with permission fields + activation headers
		StrictRouting:  true,
	})

	app.Use(recover.New())
	// Private Network Access: must be before CORS so preflight responses include it
	app.Use(func(c *fiber.Ctx) error {
		c.Set("Access-Control-Allow-Private-Network", "true")
		return c.Next()
	})
	app.Use(cors.New(cors.Config{
		AllowOrigins:     config.App.CORSOrigins,
		AllowMethods:     "GET,POST,PUT,PATCH,DELETE,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization,X-Machine-ID,X-Activation-Key,Access-Control-Request-Private-Network",
		AllowCredentials: false,
		ExposeHeaders:    "Access-Control-Allow-Private-Network",
	}))
	// Serve uploaded files before rate limiter (no directory listing)
	app.Static("/uploads", "./uploads", fiber.Static{
		Browse: false,
	})

	app.Use(logger.New(logger.Config{
		Format: "${time} ${method} ${path} ${status} ${latency}\n",
	}))
	app.Use(limiter.New(limiter.Config{
		Max:        60,
		Expiration: 1 * time.Minute,
	}))

	// Stricter rate limit for auth endpoints (10 req/min per IP)
	authLimiter = limiter.New(limiter.Config{
		Max:        10,
		Expiration: 1 * time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP() + ":" + c.Path()
		},
	})
	app.Use(middleware.MetricsRecorder())
	app.Use(middleware.RequireActivation())

	// Health check endpoints for K8s probes
	app.Get("/healthz", func(c *fiber.Ctx) error {
		return c.SendStatus(200)
	})
	app.Get("/readyz", func(c *fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := database.Client.Ping(ctx, nil); err != nil {
			return c.Status(503).SendString("mongo down")
		}
		return c.SendStatus(200)
	})

	// Start HTTPS scanner server for iOS camera access
	remotescan.StartTLSServer(done)

	// Remote scanner — public routes (phone browser, no activation)
	app.Get("/scan/manifest.json", remotescan.HandleManifest)
	app.Get("/scan/sw.js", remotescan.HandleSW)
	app.Get("/scan/icon-192.png", remotescan.HandleIcon192)
	app.Get("/scan/icon-512.png", remotescan.HandleIcon512)
	app.Get("/scan/:token", remotescan.HandleScannerPage)
	app.Get("/api/scan/ws/phone", remotescan.PhoneWSUpgrade)
	// Desktop scanner WS — requires valid JWT + session token
	app.Get("/api/scan/ws/desktop", remotescan.ValidateDesktopWS(), remotescan.DesktopWSUpgrade)

	registerRoutes(app)

	// Graceful shutdown: wait for SIGTERM/SIGINT
	go func() { log.Fatal(app.Listen(config.App.AppHost + ":" + config.App.AppPort)) }()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	<-quit
	log.Println("shutting down...")
	close(done) // signal background goroutines to stop
	app.ShutdownWithTimeout(10 * time.Second)
}

func registerRoutes(app *fiber.App) {
	api := app.Group("/api")

	// ─── Public ──────────────────────────────────────────────────────────────
	api.Get("/plans", subscription.HandleList(true))
	api.Post("/signup", authLimiter, signup.Handle)
	api.Post("/tenant/auth/login", authLimiter, user.HandleLogin)

	// ─── Desktop POS Activation (public) ─────────────────────────────────────
	api.Post("/activation/activate", activation.HandleActivate)
	api.Post("/activation/validate", activation.HandleValidate)

	// ─── Super Admin ─────────────────────────────────────────────────────────
	sa := api.Group("/super-admin")

	// First-time setup (blocked once any admin exists)
	sa.Get("/setup-status", superadmin.HandleSetupStatus)
	sa.Post("/setup", authLimiter, superadmin.HandleSetup)

	sa.Post("/login", authLimiter, superadmin.HandleLogin)
	sa.Post("/logout", middleware.Auth(), superadmin.HandleLogout)

	// Password change (requires auth)
	sa.Post("/change-password", middleware.Auth(), middleware.RequireRole("super_admin"), superadmin.HandleChangePassword)

	// Protected super-admin routes
	saAuth := sa.Group("", middleware.Auth(), middleware.RequireRole("super_admin"))

	// Super admins management (add more admins from within the panel)
	saAuth.Post("/admins", superadmin.HandleRegister)
	saAuth.Get("/admins", superadmin.HandleList)
	saAuth.Patch("/admins/:id/active", superadmin.HandleSetActive)

	// Subscription plans
	saAuth.Post("/plans", subscription.HandleCreate)
	saAuth.Get("/plans", subscription.HandleList(false))
	saAuth.Get("/plans/:id", subscription.HandleGetByID)
	saAuth.Put("/plans/:id", subscription.HandleUpdate)
	saAuth.Patch("/plans/:id/active", subscription.HandleSetActive)

	// Tenant storage usage (must be before :id routes)
	saAuth.Get("/tenants/storage", storage.HandleGetUsage)

	// Tenant (store) management
	saAuth.Post("/tenants", tenant.HandleCreate)
	saAuth.Get("/tenants", tenant.HandleList)
	saAuth.Get("/tenants/:id", tenant.HandleGetByID)
	saAuth.Put("/tenants/:id", tenant.HandleUpdate)
	saAuth.Patch("/tenants/:id/active", tenant.HandleSetActive)

	// Users inside a tenant (super-admin view)
	saAuth.Get("/tenants/:tenantId/users", user.HandleListBySuperAdmin)
	saAuth.Patch("/tenants/:tenantId/users/:id/active", user.HandleSetActiveBySuperAdmin)

	// Bulk product import for a tenant
	saAuth.Post("/tenants/:tenantId/products/import", product.HandleBulkImport)

	// Folder requests (super admin)
	saAuth.Get("/folders/pending", folder.HandleListPending)
	saAuth.Patch("/folders/:id/approve", folder.HandleApprove)
	saAuth.Patch("/folders/:id/reject", folder.HandleReject)

	// Chat
	saAuth.Get("/chat/conversations", chat.HandleAdminConversations)
	saAuth.Get("/chat/messages/:tenantId", chat.HandleAdminMessages)
	saAuth.Post("/chat/messages/:tenantId", chat.HandleAdminSend)
	saAuth.Put("/chat/read/:tenantId", chat.HandleAdminMarkRead)
	saAuth.Get("/chat/unread", chat.HandleAdminUnread)

	// API metrics
	saAuth.Get("/metrics", metrics.HandleGetStats)

	// Integration test runner
	saAuth.Post("/run-tests", testrunner.HandleRunTests)

	// ─── Tenant Panel ─────────────────────────────────────────────────────────
	tp := api.Group("/tenant",
		middleware.Auth(),
		middleware.RequireRole("tenant_admin", "cashier"),
		middleware.TenantActiveGuard(),
	)

	// Authenticated user info
	tp.Get("/auth/me", user.HandleMe)
	tp.Post("/auth/logout", user.HandleLogout)
	tp.Post("/auth/change-password", user.HandleChangePassword)

	// Folders (requires multi_folders feature + folder permissions)
	tpFolders := tp.Group("/folders", middleware.RequireFeature("multi_folders"))
	tpFolders.Get("", middleware.RequirePermission("folders", "view"), folder.HandleListFolders)
	tpFolders.Get("/requests", middleware.RequirePermission("folders", "view"), folder.HandleListRequests)
	tpFolders.Post("", middleware.RequirePermission("folders", "add"), folder.HandleRequest)
	tpFolders.Post("/switch", middleware.RequirePermission("folders", "edit"), folder.HandleSwitch)
	tpFolders.Post("/copy", middleware.RequirePermission("folders", "edit"), folder.HandleCopy)

	// Chat (tenant_admin only)
	tpChat := tp.Group("/chat", middleware.RequireRole("tenant_admin"))
	tpChat.Get("/messages", chat.HandleTenantMessages)
	tpChat.Post("/messages", chat.HandleTenantSend)
	tpChat.Put("/read", chat.HandleTenantMarkRead)
	tpChat.Get("/unread", chat.HandleTenantUnread)

	// Store settings (tenant_admin only)
	tpSettings := tp.Group("/settings", middleware.RequireRole("tenant_admin"))
	tpSettings.Get("", tenant.HandleGetSettings)
	tpSettings.Put("", tenant.HandleUpdateSettings)
	tpSettings.Put("/pos-favorites", middleware.RequireFeature("favorites"), tenant.HandleUpdatePosFavorites)
	tpSettings.Put("/pos-fav-groups", middleware.RequireFeature("favorites"), tenant.HandleUpdatePosFavGroups)
	tpSettings.Post("/upload-logo", tenant.HandleUploadLogo)

	// Activation keys (tenant_admin only)
	tpKeys := tp.Group("/activation-keys", middleware.RequireRole("tenant_admin"))
	tpKeys.Get("", activation.HandleListKeys)
	tpKeys.Post("", activation.HandleCreateKey)
	tpKeys.Patch("/:id/revoke", activation.HandleRevokeKey)
	tpKeys.Patch("/:id/reactivate", activation.HandleReactivateKey)
	tpKeys.Delete("/:id", activation.HandleDeleteKey)
	tpKeys.Delete("/:id/installs/:fingerprint", activation.HandleRemoveInstall)

	// User management (tenant_admin only, requires access_management feature)
	tpAdmin := tp.Group("/users", middleware.RequireRole("tenant_admin"), middleware.RequireFeature("access_management"))
	tpAdmin.Post("/", user.HandleCreate)
	tpAdmin.Get("/", user.HandleList)
	tpAdmin.Get("/:id", user.HandleGetByID)
	tpAdmin.Put("/:id", user.HandleUpdate)
	tpAdmin.Patch("/:id/active", user.HandleSetActive)
	tpAdmin.Patch("/:id/password", user.HandleResetPassword)

	// Category management (gated behind products feature)
	tpProducts := tp.Group("", middleware.RequireFeature("products"))
	tpProducts.Get("/categories", middleware.RequirePermission("categories", "view"), category.HandleList)
	tpProducts.Post("/categories/", middleware.RequirePermission("categories", "add"), category.HandleCreate)
	tpProducts.Put("/categories/:id", middleware.RequirePermission("categories", "edit"), category.HandleUpdate)
	tpProducts.Delete("/categories/:id", middleware.RequirePermission("categories", "delete"), category.HandleDelete)

	tpProducts.Get("/brands", middleware.RequirePermission("brands", "view"), brand.HandleList)
	tpProducts.Post("/brands/", middleware.RequirePermission("brands", "add"), brand.HandleCreate)
	tpProducts.Put("/brands/:id", middleware.RequirePermission("brands", "edit"), brand.HandleUpdate)
	tpProducts.Delete("/brands/:id", middleware.RequirePermission("brands", "delete"), brand.HandleDelete)

	tpProducts.Get("/units", middleware.RequirePermission("units", "view"), unit.HandleList)
	tpProducts.Post("/units/", middleware.RequirePermission("units", "add"), unit.HandleCreate)
	tpProducts.Put("/units/:id", middleware.RequirePermission("units", "edit"), unit.HandleUpdate)
	tpProducts.Delete("/units/:id", middleware.RequirePermission("units", "delete"), unit.HandleDelete)

	tpProducts.Get("/products/generate-barcode", middleware.RequirePermission("products", "add"), product.HandleGenerateBarcode)
	tpProducts.Get("/products/low-stock", middleware.RequirePermission("products", "alert"), product.HandleLowStock)
	tpProducts.Get("/products/export", middleware.RequirePermission("products", "export"), product.HandleExport)
	tpProducts.Get("/products/valuation", middleware.RequirePermission("products", "valuation"), product.HandleValuation)
	tpProducts.Get("/products/archived", middleware.RequirePermission("products", "archive"), product.HandleListArchived)
	tpProducts.Get("/products", middleware.RequirePermission("products", "view"), product.HandleList)
	tpProducts.Post("/products/by-ids", middleware.RequirePermission("products", "view"), product.HandleGetByIDs)
	tpProducts.Get("/products/:id", middleware.RequirePermission("products", "view"), product.HandleGetByID)
	tpProducts.Get("/products/:id/movements", middleware.RequireFeature("product_history"), middleware.RequirePermission("products", "movement"), product.HandleListMovements)
	tpProducts.Get("/products/:id/price-history", middleware.RequirePermission("products", "price_history"), price_history.HandleList)
	tpProducts.Get("/products/:id/suppliers", middleware.RequirePermission("products", "view"), supplier_product.HandleListByProduct)
	tpProducts.Post("/products/upload-image", middleware.RequirePermission("products", "add"), product.HandleUploadImage)
	tpProducts.Post("/products/", middleware.RequirePermission("products", "add"), product.HandleCreate)
	tpProducts.Post("/products/:id/duplicate", middleware.RequirePermission("products", "add"), product.HandleDuplicate)
	tpProducts.Post("/products/:id/archive", middleware.RequirePermission("products", "archive"), product.HandleArchive)
	tpProducts.Post("/products/:id/unarchive", middleware.RequirePermission("products", "archive"), product.HandleUnarchive)
	tpProducts.Put("/products/:id", middleware.RequirePermission("products", "edit"), product.HandleUpdate)
	tpProducts.Delete("/products/:id", middleware.RequirePermission("products", "delete"), product.HandleDelete)

	// Stock adjustments
	tpProducts.Get("/adjustments", middleware.RequirePermission("products", "adjustment"), adjustment.HandleList)
	tpProducts.Post("/adjustments", middleware.RequirePermission("products", "adjustment"), adjustment.HandleCreate)

	// Supplier management
	tpSuppliers := tp.Group("", middleware.RequireFeature("suppliers"))
	tpSuppliers.Get("/suppliers", middleware.RequirePermission("suppliers", "view"), supplier.HandleList)
	tpSuppliers.Get("/suppliers/archived", middleware.RequirePermission("suppliers", "view"), supplier.HandleListArchived)
	tpSuppliers.Post("/suppliers/", middleware.RequirePermission("suppliers", "add"), supplier.HandleCreate)
	tpSuppliers.Post("/suppliers/:id/unarchive", middleware.RequirePermission("suppliers", "edit"), supplier.HandleUnarchive)
	tpSuppliers.Put("/suppliers/:id", middleware.RequirePermission("suppliers", "edit"), supplier.HandleUpdate)
	tpSuppliers.Delete("/suppliers/:id", middleware.RequirePermission("suppliers", "delete"), supplier.HandleDelete)
	tpSuppliers.Patch("/suppliers/:id/balance", middleware.RequirePermission("suppliers", "edit"), supplier.HandleAdjustBalance)
	tpSuppliers.Post("/suppliers/:id/pay", middleware.RequirePermission("suppliers", "pay"), supplier.HandlePayBalance)
	tpSuppliers.Get("/suppliers/:id/payments", middleware.RequirePermission("suppliers", "view"), supplier.HandleListPayments)
	tpSuppliers.Post("/suppliers/:id/payments/:paymentId/reverse", middleware.RequirePermission("suppliers", "pay"), supplier.HandleReversePayment)
	tpSuppliers.Get("/suppliers/:id/products", middleware.RequirePermission("suppliers", "view"), supplier_product.HandleListBySupplier)
	tpSuppliers.Post("/supplier-products", middleware.RequirePermission("suppliers", "edit"), supplier_product.HandleCreate)
	tpSuppliers.Delete("/supplier-products/:id", middleware.RequirePermission("suppliers", "edit"), supplier_product.HandleDelete)

	// Purchase management
	tpPurchases := tp.Group("", middleware.RequireFeature("purchases"))
	tpPurchases.Get("/purchases/low-stock", middleware.RequirePermission("purchases", "view"), purchase.HandleLowStock)
	tpPurchases.Get("/purchases/stats", middleware.RequirePermission("purchases", "view"), purchase.HandleStats)
	tpPurchases.Get("/purchases", middleware.RequirePermission("purchases", "view"), purchase.HandleList)
	tpPurchases.Get("/purchases/:id", middleware.RequirePermission("purchases", "view"), purchase.HandleGetByID)
	tpPurchases.Get("/purchases/:id/preview", middleware.RequirePermission("purchases", "validate"), purchase.HandlePreviewValidation)
	tpPurchases.Get("/purchases/:id/payments", middleware.RequirePermission("purchases", "view"), purchase.HandleListPayments)
	tpPurchases.Post("/purchases/", middleware.RequirePermission("purchases", "add"), purchase.HandleCreate)
	tpPurchases.Put("/purchases/:id", middleware.RequirePermission("purchases", "edit"), purchase.HandleUpdate)
	tpPurchases.Post("/purchases/:id/validate", middleware.RequirePermission("purchases", "validate"), purchase.HandleValidate)
	tpPurchases.Post("/purchases/:id/pay", middleware.RequirePermission("purchases", "pay"), purchase.HandlePay)
	tpPurchases.Post("/purchases/:id/duplicate", middleware.RequirePermission("purchases", "add"), purchase.HandleDuplicate)
	tpPurchases.Get("/purchases/:id/returnable", middleware.RequirePermission("purchases", "return"), purchase.HandleGetReturnable)
	tpPurchases.Post("/purchases/:id/return", middleware.RequirePermission("purchases", "return"), purchase.HandleReturn)
	tpPurchases.Delete("/purchases/:id", middleware.RequirePermission("purchases", "delete"), purchase.HandleDelete)
	tpPurchases.Post("/purchases/import/parse", middleware.RequirePermission("purchases", "add"), docimport.HandleParse)
	tpPurchases.Post("/purchases/import/confirm", middleware.RequirePermission("purchases", "add"), docimport.HandleConfirm)

	// Stock loss management
	tpLosses := tp.Group("", middleware.RequireFeature("losses"))
	tpLosses.Get("/losses", middleware.RequirePermission("products", "loss"), loss.HandleList)
	tpLosses.Post("/losses", middleware.RequirePermission("products", "loss"), loss.HandleCreate)

	// Caisse (cash register sessions)
	tpCaisse := tp.Group("/caisse", middleware.RequireFeature("pos"))
	tpCaisse.Post("/open", middleware.RequirePermission("sales", "add"), caisse.HandleOpen)
	tpCaisse.Post("/close", middleware.RequirePermission("sales", "add"), caisse.HandleClose)
	tpCaisse.Get("/current", middleware.RequirePermission("sales", "add"), caisse.HandleGetCurrent)
	tpCaisse.Get("/history", middleware.RequireRole("tenant_admin"), caisse.HandleHistory)
	tpCaisse.Get("/sum", middleware.RequirePermission("sales", "earnings"), caisse.HandleSum)

	// POS (sale creation)
	tpPOS := tp.Group("", middleware.RequireFeature("pos"))
	tpPOS.Post("/sales", middleware.RequirePermission("sales", "add"), sale.HandleCreate)

	// Remote barcode scanner (phone → desktop relay)
	tpScanner := tp.Group("", middleware.RequireFeature("remote_scanner"), middleware.RequireFeature("pos"))
	tpScanner.Post("/scan/session", middleware.RequirePermission("sales", "add"), remotescan.HandleCreateSession)
	tpScanner.Post("/scan/session/delete", middleware.RequirePermission("sales", "add"), remotescan.HandleDeleteSession)

	// Sales history & stats
	tpSales := tp.Group("", middleware.RequireFeature("sales"))
	tpSales.Get("/sales/stats", middleware.RequirePermission("sales", "earnings"), sale.HandleStats)
	tpSales.Get("/sales/statistics", middleware.RequirePermission("sales", "earnings"), sale.HandleSalesStatistics)
	tpSales.Get("/sales/user-summary", middleware.RequireFeature("user_summary"), middleware.RequirePermission("sales", "user_summary"), sale.HandleUserSummary)
	tpSales.Get("/sales", middleware.RequirePermission("sales", "view"), sale.HandleList)
	tpSales.Post("/sales/:id/return", middleware.RequirePermission("sales", "return"), sale_return.HandleCreate)
	tpSales.Get("/sale-returns", middleware.RequirePermission("sales", "return"), sale_return.HandleList)

	// Expenses
	tpExpenses := tp.Group("", middleware.RequireFeature("expenses"))
	tpExpenses.Get("/expenses/sum", middleware.RequirePermission("expenses", "view"), expense.HandleSum)
	tpExpenses.Get("/expenses", middleware.RequirePermission("expenses", "view"), expense.HandleList)
	tpExpenses.Post("/expenses", middleware.RequirePermission("expenses", "add"), expense.HandleCreate)
	tpExpenses.Put("/expenses/:id", middleware.RequirePermission("expenses", "edit"), expense.HandleUpdate)
	tpExpenses.Delete("/expenses/:id", middleware.RequirePermission("expenses", "delete"), expense.HandleDelete)

	// Retraits (cash withdrawals)
	tpRetraits := tp.Group("", middleware.RequireFeature("retraits"))
	tpRetraits.Get("/retraits/sum", middleware.RequirePermission("retraits", "view"), retrait.HandleSum)
	tpRetraits.Get("/retraits", middleware.RequirePermission("retraits", "view"), retrait.HandleList)
	tpRetraits.Post("/retraits", middleware.RequirePermission("retraits", "add"), retrait.HandleCreate)
	tpRetraits.Delete("/retraits/:id", middleware.RequirePermission("retraits", "delete"), retrait.HandleDelete)

	// Client management
	tpClients := tp.Group("", middleware.RequireFeature("clients"))
	tpClients.Get("/clients", middleware.RequirePermission("clients", "view"), client.HandleList)
	tpClients.Get("/clients/archived", middleware.RequirePermission("clients", "view"), client.HandleListArchived)
	tpClients.Post("/clients/", middleware.RequirePermission("clients", "add"), client.HandleCreate)
	tpClients.Post("/clients/:id/unarchive", middleware.RequirePermission("clients", "edit"), client.HandleUnarchive)
	tpClients.Put("/clients/:id", middleware.RequirePermission("clients", "edit"), client.HandleUpdate)
	tpClients.Delete("/clients/:id", middleware.RequirePermission("clients", "delete"), client.HandleDelete)
	tpClients.Get("/clients/payments/sum", middleware.RequireFeature("client_payments"), middleware.RequirePermission("clients", "view"), client.HandlePaymentsSum)
	tpClients.Get("/clients/:id/payments", middleware.RequireFeature("client_payments"), middleware.RequirePermission("clients", "view"), client.HandleListPayments)
	tpClients.Get("/clients/:id/statement", middleware.RequireFeature("client_payments"), middleware.RequirePermission("clients", "view"), client.HandleGetStatement)
	tpClients.Get("/clients/:id/sales", middleware.RequireFeature("sales"), middleware.RequirePermission("sales", "view"), sale.HandleListByClient)
	tpClients.Post("/clients/:id/payments", middleware.RequireFeature("client_payments"), middleware.RequirePermission("clients", "edit"), client.HandleAddPayment)

	// Product variants (plan-gated)
	tpVariants := tp.Group("", middleware.RequireFeature("product_variants"), middleware.RequireFeature("products"))
	tpVariants.Get("/products/:id/variants", middleware.RequirePermission("products", "view"), variant.HandleList)
	tpVariants.Post("/products/:id/variants", middleware.RequirePermission("products", "add"), variant.HandleCreate)
	tpVariants.Get("/variants/barcode/:barcode", middleware.RequirePermission("products", "view"), variant.HandleFindByBarcode)
	tpVariants.Put("/variants/:id", middleware.RequirePermission("products", "edit"), variant.HandleUpdate)
	tpVariants.Delete("/variants/:id", middleware.RequirePermission("products", "delete"), variant.HandleDelete)

	// Stock transfers (plan-gated)
	tpTransfers := tp.Group("", middleware.RequireFeature("stock_transfers"))
	tpTransfers.Get("/locations", middleware.RequirePermission("products", "view"), location.HandleList)
	tpTransfers.Post("/locations", middleware.RequirePermission("products", "add"), location.HandleCreate)
	tpTransfers.Put("/locations/:id", middleware.RequirePermission("products", "edit"), location.HandleUpdate)
	tpTransfers.Delete("/locations/:id", middleware.RequirePermission("products", "delete"), location.HandleDelete)
	tpTransfers.Get("/transfers", middleware.RequirePermission("products", "view"), transfer.HandleList)
	tpTransfers.Post("/transfers", middleware.RequirePermission("products", "add"), transfer.HandleCreate)
	tpTransfers.Post("/transfers/:id/complete", middleware.RequirePermission("products", "edit"), transfer.HandleComplete)
	tpTransfers.Delete("/transfers/:id", middleware.RequirePermission("products", "delete"), transfer.HandleDelete)

	// Discount rules (plan-gated)
	tpDiscounts := tp.Group("", middleware.RequireFeature("product_discounts"), middleware.RequireFeature("products"))
	tpDiscounts.Get("/products/:id/discounts", middleware.RequirePermission("products", "view"), discount.HandleListByProduct)
	tpDiscounts.Get("/products/:id/discount-applicable", middleware.RequirePermission("products", "view"), discount.HandleGetApplicable)
	tpDiscounts.Post("/discounts", middleware.RequirePermission("products", "edit"), discount.HandleCreate)
	tpDiscounts.Put("/discounts/:id", middleware.RequirePermission("products", "edit"), discount.HandleUpdate)
	tpDiscounts.Delete("/discounts/:id", middleware.RequirePermission("products", "delete"), discount.HandleDelete)

	// Scale (Rongta RL1000) — requires scale feature + tenant_admin
	tpScale := tp.Group("/scale", middleware.RequireFeature("scale"), middleware.RequireRole("tenant_admin"))
	tpScale.Post("/connect", scale.HandleConnect)
	tpScale.Post("/disconnect", scale.HandleDisconnect)
	tpScale.Get("/status", scale.HandleGetStatus)
	tpScale.Get("/weight", scale.HandleGetWeight)
	tpScale.Post("/plu/sync", scale.HandleSyncPLU)
	tpScale.Delete("/plu", scale.HandleClearPLU)
	tpScale.Put("/settings", scale.HandleSaveSettings)
	tpScale.Get("/settings", scale.HandleGetSettings)

	// Batch/lot tracking (plan-gated)
	tpBatch := tp.Group("", middleware.RequireFeature("batch_tracking"), middleware.RequireFeature("products"))
	tpBatch.Get("/products/:id/batches", middleware.RequirePermission("products", "view"), batch.HandleListByProduct)
	tpBatch.Post("/batches", middleware.RequirePermission("products", "add"), batch.HandleCreate)
	tpBatch.Get("/batches/expiring", middleware.RequirePermission("products", "view"), batch.HandleListExpiring)
	tpBatch.Get("/batches/expiring-list", middleware.RequirePermission("products", "view"), batch.HandleListExpiringPaginated)
	tpBatch.Get("/batches/alerts", middleware.RequirePermission("products", "view"), batch.HandleListAlerts)
	tpBatch.Delete("/batches/:id", middleware.RequirePermission("products", "delete"), batch.HandleDelete)

	// Facturation (BC / Devis / Facture / Avoir)
	tpFact := tp.Group("/facturation", middleware.RequireFeature("facturation"))
	tpFact.Get("", middleware.RequirePermission("facturation", "view"), facturation.HandleList)
	tpFact.Get("/:id", middleware.RequirePermission("facturation", "view"), facturation.HandleGetByID)
	tpFact.Post("", middleware.RequirePermission("facturation", "add"), facturation.HandleCreate)
	tpFact.Put("/:id", middleware.RequirePermission("facturation", "edit"), facturation.HandleUpdate)
	tpFact.Delete("/:id", middleware.RequirePermission("facturation", "delete"), facturation.HandleDelete)
	tpFact.Post("/:id/convert", middleware.RequirePermission("facturation", "add"), facturation.HandleConvert)
	tpFact.Patch("/:id/status", middleware.RequirePermission("facturation", "edit"), facturation.HandleUpdateStatus)
	tpFact.Post("/:id/avoir", middleware.RequirePermission("facturation", "avoir"), facturation.HandleCreateAvoir)
	tpFact.Post("/:id/pay", middleware.RequirePermission("facturation", "edit"), facturation.HandlePay)

	// DVR surveillance (plan-gated, tenant_admin only)
	tpDVR := tp.Group("/dvr", middleware.RequireFeature("dvr"), middleware.RequireRole("tenant_admin"))
	tpDVR.Get("/events", dvr.HandleList)
	tpDVR.Get("/events/:id", dvr.HandleGetByID)
	tpDVR.Post("/events/:id/fetch", dvr.HandleFetchClip)
	tpDVR.Get("/events/:id/clip", dvr.HandleStreamClip)
	tpDVR.Post("/test", dvr.HandleTestConnection)
}
