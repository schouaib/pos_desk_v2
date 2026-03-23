package client

import (
	"strconv"
	"time"

	"saas_pos/internal/middleware"

	"github.com/gofiber/fiber/v2"
)

func HandleList(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	q := c.Query("q", "")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))

	result, err := List(claims.TenantID, q, page, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": result})
}

func HandleCreate(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var input ClientInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	client, err := Create(claims.TenantID, input)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"data": client})
}

func HandleUpdate(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	id := c.Params("id")
	var input ClientInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	client, err := Update(claims.TenantID, id, input)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": client})
}

func HandleDelete(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	id := c.Params("id")
	archived, err := Delete(claims.TenantID, id)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if archived {
		return c.JSON(fiber.Map{"data": fiber.Map{"archived": true}})
	}
	return c.JSON(fiber.Map{"data": true})
}

// GET /api/tenant/clients/archived
func HandleListArchived(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	q := c.Query("q", "")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	result, err := ListArchived(claims.TenantID, q, page, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": result})
}

// POST /api/tenant/clients/:id/unarchive
func HandleUnarchive(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	if err := Unarchive(claims.TenantID, c.Params("id")); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": true})
}

func HandleAddPayment(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	clientID := c.Params("id")
	var input PaymentInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	payment, err := AddPayment(claims.TenantID, clientID, input)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"data": payment})
}

func HandleGetStatement(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	clientID := c.Params("id")
	entries, err := GetStatement(claims.TenantID, clientID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": entries})
}

func HandlePaymentsSum(c *fiber.Ctx) error {
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

	total, err := PaymentsSum(claims.TenantID, from, to)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"total": total}})
}

func HandleListPayments(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	clientID := c.Params("id")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))

	result, err := ListPayments(claims.TenantID, clientID, page, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": result})
}
