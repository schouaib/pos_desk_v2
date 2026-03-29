package middleware

import (
	"strings"

	"saas_pos/pkg/jwt"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

const LocalsClaims = "claims"

// Auth validates the JWT.
func Auth() fiber.Handler {
	return func(c *fiber.Ctx) error {
		header := c.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			return response.Unauthorized(c)
		}
		claims, err := jwt.Parse(strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			return response.Unauthorized(c)
		}
		c.Locals(LocalsClaims, claims)
		return c.Next()
	}
}

// RequireRole allows only specific roles to proceed.
func RequireRole(roles ...string) fiber.Handler {
	allowed := make(map[string]struct{}, len(roles))
	for _, r := range roles {
		allowed[r] = struct{}{}
	}
	return func(c *fiber.Ctx) error {
		claims, ok := c.Locals(LocalsClaims).(*jwt.Claims)
		if !ok {
			return response.Unauthorized(c)
		}
		if _, ok := allowed[claims.Role]; !ok {
			return response.Forbidden(c)
		}
		return c.Next()
	}
}

// GetClaims is a helper to extract claims from context.
// Always returns a valid pointer — panics are impossible because Auth() middleware
// guarantees claims are set before any handler runs.
func GetClaims(c *fiber.Ctx) *jwt.Claims {
	claims, ok := c.Locals(LocalsClaims).(*jwt.Claims)
	if !ok || claims == nil {
		return &jwt.Claims{}
	}
	return claims
}

// RequireFeature blocks access if the tenant's plan does not include the named feature.
// feature: "products"|"purchases"|"suppliers"|"sales"|"pos"|"losses"|"expenses"|"retraits"|"stats"
func RequireFeature(feature string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims, ok := c.Locals(LocalsClaims).(*jwt.Claims)
		if !ok {
			return response.Unauthorized(c)
		}
		if !hasFeature(claims, feature) {
			return response.Error(c, fiber.StatusForbidden, "feature not available in your plan")
		}
		return c.Next()
	}
}

func hasFeature(claims *jwt.Claims, feature string) bool {
	f := claims.Features
	switch feature {
	case "products":
		return f.Products
	case "purchases":
		return f.Purchases
	case "suppliers":
		return f.Suppliers
	case "sales":
		return f.Sales
	case "pos":
		return f.POS
	case "losses":
		return f.Losses
	case "expenses":
		return f.Expenses
	case "retraits":
		return f.Retraits
	case "stats":
		return f.Stats
	case "multi_barcodes":
		return f.MultiBarcodes
	case "product_history":
		return f.ProductHistory
	case "clients":
		return f.Clients
	case "client_payments":
		return f.ClientPayments
	case "user_summary":
		return f.UserSummary
	case "multi_folders":
		return f.MultiFolders
	case "access_management":
		return f.AccessManagement
	case "favorites":
		return f.Favorites
	case "product_variants":
		return f.ProductVariants
	case "stock_transfers":
		return f.StockTransfers
	case "product_discounts":
		return f.ProductDiscounts
	case "product_bundles":
		return f.ProductBundles
	case "batch_tracking":
		return f.BatchTracking
	case "scale":
		return f.Scale
	case "facturation":
		return f.Facturation
	}
	return false
}

// RequirePermission checks that the authenticated user has the given action on the given module.
// tenant_admin always passes. For cashier, the permission flag must be true.
// module: "products" | "categories" | "brands" | "units" | "purchases" | "suppliers"
// action: "view" | "add" | "edit" | "delete" | "movement" | "loss"
func RequirePermission(module, action string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims, ok := c.Locals(LocalsClaims).(*jwt.Claims)
		if !ok {
			return response.Unauthorized(c)
		}
		if claims.Role == "tenant_admin" || claims.Role == "super_admin" {
			return c.Next()
		}
		if !hasPermission(claims.Permissions, module, action) {
			return response.Forbidden(c)
		}
		return c.Next()
	}
}

func hasPermission(p jwt.Permissions, module, action string) bool {
	var m jwt.ModulePerms
	switch module {
	case "products":
		m = p.Products
	case "categories":
		m = p.Categories
	case "brands":
		m = p.Brands
	case "units":
		m = p.Units
	case "purchases":
		m = p.Purchases
	case "suppliers":
		m = p.Suppliers
	case "sales":
		m = p.Sales
	case "expenses":
		m = p.Expenses
	case "retraits":
		m = p.Retraits
	case "folders":
		m = p.Folders
	case "favorites":
		m = p.Favorites
	case "facturation":
		m = p.Facturation
	default:
		return false
	}
	switch action {
	case "view":
		return m.View
	case "add":
		return m.Add
	case "edit":
		return m.Edit
	case "delete":
		return m.Delete
	case "movement":
		return m.Movement
	case "loss":
		return m.Loss
	case "validate":
		return m.Validate
	case "pay":
		return m.Pay
	case "earnings":
		return m.Earnings
	case "user_summary":
		return m.UserSummary
	case "adjustment":
		return m.Adjustment
	case "alert":
		return m.Alert
	case "export":
		return m.Export
	case "return":
		return m.Return
	case "archive":
		return m.Archive
	case "price_history":
		return m.PriceHistory
	case "valuation":
		return m.Valuation
	case "bc":
		return m.BC
	case "devis":
		return m.Devis
	case "avoir":
		return m.Avoir
	}
	return false
}
