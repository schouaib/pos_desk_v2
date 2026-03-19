package metrics

import (
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

func HandleGetStats(c *fiber.Ctx) error {
	period := c.Query("period", "1h")
	result, err := GetStats(period)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, result)
}
