package batch

import (
	"log"
	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// GET /api/tenant/products/:id/batches?page=&limit=
func HandleListByProduct(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 10)
	result, err := ListByProduct(tenantID, c.Params("id"), page, limit)
	if err != nil {
		log.Printf("[batch] ListByProduct error: %v", err)
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, result)
}

// POST /api/tenant/batches
func HandleCreate(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var input CreateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	b, err := Create(tenantID, input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, b)
}

// GET /api/tenant/batches/expiring?days=30
func HandleListExpiring(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	days := c.QueryInt("days", 30)
	items, err := ListExpiring(tenantID, days)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, items)
}

// GET /api/tenant/batches/expiring-list?days=30&page=1&limit=10
func HandleListExpiringPaginated(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	days := c.QueryInt("days", 30)
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 10)
	result, err := ListExpiringPaginated(tenantID, days, page, limit)
	if err != nil {
		log.Printf("[batch] ListExpiringPaginated error: %v", err)
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, result)
}

// GET /api/tenant/batches/alerts
func HandleListAlerts(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	items, err := ListAlerts(tenantID)
	if err != nil {
		log.Printf("[batch] ListAlerts error: %v", err)
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, items)
}

// DELETE /api/tenant/batches/:id
func HandleDelete(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	if err := Delete(tenantID, c.Params("id")); err != nil {
		return response.NotFound(c, err.Error())
	}
	return response.OK(c, nil)
}
