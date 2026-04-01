package supplier

import (
	"strconv"

	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// GET /api/tenant/suppliers?q=&page=1&limit=10
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

// POST /api/tenant/suppliers/
func HandleCreate(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var input CreateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	s, err := Create(tenantID, input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, s)
}

// PUT /api/tenant/suppliers/:id
func HandleUpdate(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var input UpdateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	s, err := Update(tenantID, c.Params("id"), input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, s)
}

// DELETE /api/tenant/suppliers/:id
func HandleDelete(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	archived, err := Delete(tenantID, c.Params("id"))
	if err != nil {
		return response.NotFound(c, err.Error())
	}
	if archived {
		return response.OK(c, fiber.Map{"archived": true})
	}
	return response.OK(c, nil)
}

// GET /api/tenant/suppliers/archived
func HandleListArchived(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	q := c.Query("q", "")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "500"))
	result, err := ListArchived(tenantID, q, page, limit)
	if err != nil {
		return response.Error(c, 500, err.Error())
	}
	return response.OK(c, result)
}

// POST /api/tenant/suppliers/:id/unarchive
func HandleUnarchive(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	if err := Unarchive(tenantID, c.Params("id")); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, nil)
}

// PATCH /api/tenant/suppliers/:id/balance
func HandleAdjustBalance(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var input AdjustBalanceInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	s, err := AdjustBalance(tenantID, c.Params("id"), input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, s)
}

// POST /api/tenant/suppliers/:id/pay
func HandlePayBalance(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var input PayBalanceInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	s, err := PayBalance(claims.TenantID, c.Params("id"), input.Amount, input.Note, claims.Email)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, s)
}

// POST /api/tenant/suppliers/:id/payments/:paymentId/reverse
func HandleReversePayment(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	s, err := ReversePayment(claims.TenantID, c.Params("id"), c.Params("paymentId"), claims.Email)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, s)
}

// GET /api/tenant/suppliers/:id/payments?page=1&limit=10&date_from=&date_to=
func HandleListPayments(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	dateFrom := c.Query("date_from", "")
	dateTo := c.Query("date_to", "")
	result, err := ListPayments(tenantID, c.Params("id"), dateFrom, dateTo, page, limit)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, result)
}
