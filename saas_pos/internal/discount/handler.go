package discount

import (
	"time"

	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// GET /api/tenant/products/:id/discounts
func HandleListByProduct(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	items, err := ListByProduct(tenantID, c.Params("id"))
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, items)
}

// POST /api/tenant/discounts
func HandleCreate(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var input CreateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	r, err := Create(tenantID, input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, r)
}

// PUT /api/tenant/discounts/:id
func HandleUpdate(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var input UpdateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	r, err := Update(tenantID, c.Params("id"), input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, r)
}

// GET /api/tenant/products/:id/discount-applicable?qty=1
func HandleGetApplicable(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	pid, err := primitive.ObjectIDFromHex(c.Params("id"))
	if err != nil {
		return response.BadRequest(c, "invalid product id")
	}
	qty := c.QueryFloat("qty", 1)
	rule := GetApplicable(tenantID, pid, qty, time.Now())
	return response.OK(c, rule) // nil → null in JSON
}

// DELETE /api/tenant/discounts/:id
func HandleDelete(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	if err := Delete(tenantID, c.Params("id")); err != nil {
		return response.NotFound(c, err.Error())
	}
	return response.OK(c, nil)
}
