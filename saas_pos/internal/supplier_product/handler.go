package supplier_product

import (
	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// POST /api/tenant/supplier-products
func HandleCreate(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var input CreateInput
	if err := c.BodyParser(&input); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "invalid body")
	}
	sp, err := Create(tenantID, input)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": sp})
}

// GET /api/tenant/suppliers/:id/products?page=&limit=
func HandleListBySupplier(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	supplierID := c.Params("id")
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 10)

	result, err := ListBySupplier(tenantID, supplierID, page, limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": result})
}

// GET /api/tenant/products/:id/suppliers
func HandleListByProduct(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	productID := c.Params("id")

	items, err := ListByProduct(tenantID, productID)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": items})
}

// DELETE /api/tenant/supplier-products/:id
func HandleDelete(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	if err := Delete(tenantID, c.Params("id")); err != nil {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}
	return response.OK(c, nil)
}
