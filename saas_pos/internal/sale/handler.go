package sale

import (
	"time"

	"saas_pos/internal/middleware"

	"github.com/gofiber/fiber/v2"
)

// POST /api/tenant/sales
func HandleCreate(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var input CreateInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if input.PaymentMethod == "" {
		input.PaymentMethod = "cash"
	}
	sale, err := Create(claims.TenantID, claims.ID, claims.Email, input)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"data": sale})
}

// GET /api/tenant/sales?from=&to=&page=&limit=
func HandleList(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	now := time.Now()
	from := now.AddDate(0, 0, -30)
	to := now

	if f := c.Query("from"); f != "" {
		if t, err := time.Parse("2006-01-02", f); err == nil {
			from = t
		}
	}
	if t := c.Query("to"); t != "" {
		if parsed, err := time.Parse("2006-01-02", t); err == nil {
			to = parsed.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
		}
	}

	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 10)

	result, err := List(claims.TenantID, from, to, page, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Strip earnings fields for users without the sales.earnings permission.
	if claims.Role != "tenant_admin" && claims.Role != "super_admin" && !claims.Permissions.Sales.Earnings {
		for i := range result.Items {
			result.Items[i].TotalEarning = 0
			for j := range result.Items[i].Lines {
				result.Items[i].Lines[j].LineEarning = 0
				result.Items[i].Lines[j].PrixAchat = 0
			}
		}
	}

	return c.JSON(fiber.Map{"data": result})
}

// GET /api/tenant/clients/:id/sales?from=&to=&page=&limit=
func HandleListByClient(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	clientID := c.Params("id")

	now := time.Now()
	from := now.AddDate(0, 0, -30)
	to := now

	if f := c.Query("from"); f != "" {
		if t, err := time.Parse("2006-01-02", f); err == nil {
			from = t
		}
	}
	if t := c.Query("to"); t != "" {
		if parsed, err := time.Parse("2006-01-02", t); err == nil {
			to = parsed.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
		}
	}

	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 10)

	result, err := ListByClient(claims.TenantID, clientID, from, to, page, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": result})
}

// GET /api/tenant/sales/statistics?from=&to=&include_losses=1
func HandleSalesStatistics(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	now := time.Now()
	from := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	to := now

	if f := c.Query("from"); f != "" {
		if t, err := time.Parse("2006-01-02T15:04", f); err == nil {
			from = t
		} else if t, err := time.Parse("2006-01-02", f); err == nil {
			from = t
		}
	}
	if t := c.Query("to"); t != "" {
		if parsed, err := time.Parse("2006-01-02T15:04", t); err == nil {
			to = parsed
		} else if parsed, err := time.Parse("2006-01-02", t); err == nil {
			to = parsed.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
		}
	}
	includeLosses := c.Query("include_losses") == "1"

	result, err := SalesStatistics(claims.TenantID, from, to, includeLosses)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": result})
}

// GET /api/tenant/sales/user-summary?from=&to=&hour_from=&hour_to=&user_id=
func HandleUserSummary(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	now := time.Now()
	fromDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	toDate := fromDate

	if f := c.Query("from"); f != "" {
		if parsed, err := time.Parse("2006-01-02", f); err == nil {
			fromDate = parsed
		}
	}
	if t := c.Query("to"); t != "" {
		if parsed, err := time.Parse("2006-01-02", t); err == nil {
			toDate = parsed
		}
	}

	from := fromDate
	to := toDate.Add(23*time.Hour + 59*time.Minute + 59*time.Second)

	if h := c.QueryInt("hour_from", -1); h >= 0 && h <= 23 {
		from = time.Date(fromDate.Year(), fromDate.Month(), fromDate.Day(), h, 0, 0, 0, fromDate.Location())
	}
	if h := c.QueryInt("hour_to", -1); h >= 0 && h <= 23 {
		to = time.Date(toDate.Year(), toDate.Month(), toDate.Day(), h, 59, 59, 0, toDate.Location())
	}

	userID := c.Query("user_id")

	result, err := UserSummary(claims.TenantID, from, to, userID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": result})
}

// GET /api/tenant/sales/stats?from=&to=
func HandleStats(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	now := time.Now()
	from := now.AddDate(0, 0, -30)
	to := now

	if f := c.Query("from"); f != "" {
		if t, err := time.Parse("2006-01-02", f); err == nil {
			from = t
		}
	}
	if t := c.Query("to"); t != "" {
		if parsed, err := time.Parse("2006-01-02", t); err == nil {
			to = parsed.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
		}
	}

	result, err := Stats(claims.TenantID, from, to)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": result})
}
