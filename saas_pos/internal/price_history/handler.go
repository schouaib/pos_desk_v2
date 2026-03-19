package price_history

import (
	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// GET /api/tenant/products/:id/price-history?page=&limit=
func HandleList(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	productID := c.Params("id")
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 10)

	result, err := List(tenantID, productID, page, limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": result})
}
