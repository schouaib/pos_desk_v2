package storage

import (
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// GET /api/super-admin/tenants/storage
func HandleGetUsage(c *fiber.Ctx) error {
	result, err := GetUsage()
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, result)
}
