package unit

import (
	"strconv"

	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// GET /api/tenant/units?q=&page=1&limit=10
func HandleList(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	q := c.Query("q", "")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	result, err := List(tenantID, q, page, limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, result)
}

// POST /api/tenant/units/
func HandleCreate(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var input CreateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	u, err := Create(tenantID, input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, u)
}

// PUT /api/tenant/units/:id
func HandleUpdate(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var input UpdateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	u, err := Update(tenantID, c.Params("id"), input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, u)
}

// DELETE /api/tenant/units/:id
func HandleDelete(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	if err := Delete(tenantID, c.Params("id")); err != nil {
		return response.NotFound(c, err.Error())
	}
	return response.OK(c, nil)
}
