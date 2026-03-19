package caisse

import (
	"strconv"
	"time"

	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// POST /api/tenant/caisse/open
func HandleOpen(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var input OpenInput
	if err := c.BodyParser(&input); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "invalid body")
	}
	session, err := Open(claims.TenantID, claims.ID, claims.Email, input)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": session})
}

// POST /api/tenant/caisse/close
func HandleClose(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var input CloseInput
	if err := c.BodyParser(&input); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "invalid body")
	}
	session, err := Close(claims.TenantID, claims.ID, input)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return c.JSON(fiber.Map{"data": session})
}

// GET /api/tenant/caisse/current
func HandleGetCurrent(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	session, err := GetCurrent(claims.TenantID, claims.ID)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": session})
}

// GET /api/tenant/caisse/history?page=&limit=
func HandleHistory(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	items, total, err := ListHistory(claims.TenantID, page, limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"items": items, "total": total}})
}

// GET /api/tenant/caisse/sum?from=&to=
func HandleSum(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	now := time.Now()
	from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
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

	totals, err := SumAmounts(claims.TenantID, from, to)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"total": totals.Opening, "closing": totals.Closing}})
}
