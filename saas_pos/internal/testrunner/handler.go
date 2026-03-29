package testrunner

import (
	"github.com/gofiber/fiber/v2"
)

// HandleRunTests runs the full integration test suite and returns structured results.
// Query params:
//   - suite: optional -run regex to filter tests (e.g. "TestPurchase" or "TestE2E")
func HandleRunTests(c *fiber.Ctx) error {
	suite := c.Query("suite", "")

	result, err := Run(suite)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{
			"success": false,
			"error":   "failed to run tests: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    result,
	})
}
