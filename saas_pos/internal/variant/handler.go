package variant

import (
	"context"
	"time"

	"saas_pos/internal/database"
	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// GET /api/tenant/products/:id/variants
func HandleList(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	items, err := ListByProduct(tenantID, c.Params("id"))
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, items)
}

// POST /api/tenant/products/:id/variants
func HandleCreate(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	tenantID := claims.TenantID
	var input CreateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	v, err := Create(tenantID, c.Params("id"), input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	// Record initial stock adjustment if qty > 0
	if v.QtyAvailable != 0 {
		recordVariantAdjustment(tenantID, v, 0, v.QtyAvailable, "initial stock", claims.ID, claims.Email)
	}
	return response.Created(c, v)
}

// PUT /api/tenant/variants/:id
func HandleUpdate(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	tenantID := claims.TenantID
	var input UpdateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	// Get current qty before update
	oldVariant, _ := GetByID(tenantID, c.Params("id"))
	v, err := Update(tenantID, c.Params("id"), input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	// Record adjustment if qty changed
	if oldVariant != nil && oldVariant.QtyAvailable != v.QtyAvailable {
		recordVariantAdjustment(tenantID, v, oldVariant.QtyAvailable, v.QtyAvailable, "manual variant edit", claims.ID, claims.Email)
	}
	return response.OK(c, v)
}

// recordVariantAdjustment writes a stock_adjustments document for a variant qty change.
func recordVariantAdjustment(tenantID string, v *ProductVariant, qtyBefore, qtyAfter float64, reason, userID, userEmail string) {
	variantLabel := ""
	for k, val := range v.Attributes {
		if variantLabel != "" {
			variantLabel += ", "
		}
		variantLabel += k + ": " + val
	}
	barcode := ""
	if len(v.Barcodes) > 0 {
		barcode = v.Barcodes[0]
	}
	// Get parent product name
	productName := ""
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	var product struct{ Name string `bson:"name"` }
	if database.Col("products").FindOne(context.Background(), bson.M{"_id": v.ParentProductID, "tenant_id": tid}).Decode(&product) == nil {
		productName = product.Name
	}

	vid := v.ID
	doc := bson.M{
		"_id":              primitive.NewObjectID(),
		"tenant_id":        tenantID,
		"product_id":       v.ParentProductID,
		"variant_id":       vid,
		"variant_label":    variantLabel,
		"product_name":     productName,
		"barcode":          barcode,
		"qty_before":       qtyBefore,
		"qty_after":        qtyAfter,
		"reason":           reason,
		"created_by":       userID,
		"created_by_email": userEmail,
		"created_at":       time.Now(),
	}
	database.Col("stock_adjustments").InsertOne(context.Background(), doc)
}

// GET /api/tenant/variants/barcode/:barcode
func HandleFindByBarcode(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	v, err := FindByBarcode(tenantID, c.Params("barcode"))
	if err != nil {
		return response.NotFound(c, "variant not found")
	}
	return response.OK(c, v)
}

// DELETE /api/tenant/variants/:id
func HandleDelete(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	if err := Delete(tenantID, c.Params("id")); err != nil {
		return response.NotFound(c, err.Error())
	}
	return response.OK(c, nil)
}
