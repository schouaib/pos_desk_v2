package retrait

import (
	"time"

	"saas_pos/internal/middleware"

	"github.com/gofiber/fiber/v2"
)

// POST /api/tenant/retraits
func HandleCreate(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var input CreateInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	r, err := Create(claims.TenantID, claims.ID, claims.Email, input)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"data": r})
}

// GET /api/tenant/retraits?from=&to=&page=&limit=
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
	return c.JSON(fiber.Map{"data": result})
}

// DELETE /api/tenant/retraits/:id
func HandleDelete(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	id := c.Params("id")
	if err := Delete(claims.TenantID, id); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": true})
}

// GET /api/tenant/retraits/sum?from=&to=
func HandleSum(c *fiber.Ctx) error {
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

	total, err := SumForPeriod(claims.TenantID, from, to)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": SumResult{Total: total}})
}
