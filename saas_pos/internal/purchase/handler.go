package purchase

import (
	"strconv"
	"time"

	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// GET /api/tenant/purchases?page=1&limit=10&supplier_id=&status=&q=&date_from=&date_to=
func HandleList(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	supplierID := c.Query("supplier_id", "")
	status := c.Query("status", "")
	q := c.Query("q", "")
	dateFrom := c.Query("date_from", "")
	dateTo := c.Query("date_to", "")

	result, err := List(tenantID, supplierID, status, q, dateFrom, dateTo, page, limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, result)
}

// GET /api/tenant/purchases/:id
func HandleGetByID(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	p, err := GetByID(tenantID, c.Params("id"))
	if err != nil {
		return response.NotFound(c, err.Error())
	}
	return response.OK(c, p)
}

// POST /api/tenant/purchases/
func HandleCreate(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var input CreateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	p, err := Create(claims.TenantID, claims.ID, claims.Email, input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, p)
}

// PUT /api/tenant/purchases/:id
func HandleUpdate(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var input UpdateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	p, err := Update(tenantID, c.Params("id"), input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, p)
}

// POST /api/tenant/purchases/:id/validate
func HandleValidate(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var input ValidateInput
	// Body is optional — if empty, full validation is assumed
	c.BodyParser(&input)
	var inputPtr *ValidateInput
	if len(input.Lines) > 0 {
		inputPtr = &input
	}
	p, err := Validate(claims.TenantID, c.Params("id"), claims.ID, claims.Email, inputPtr)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, p)
}

// GET /api/tenant/purchases/:id/preview
func HandlePreviewValidation(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	preview, err := PreviewValidation(tenantID, c.Params("id"))
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, preview)
}

// POST /api/tenant/purchases/:id/pay
func HandlePay(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var input PayInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	p, err := Pay(claims.TenantID, c.Params("id"), claims.ID, input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, p)
}

// GET /api/tenant/purchases/:id/payments?page=1&limit=25
func HandleListPayments(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	items, total, err := ListPayments(tenantID, c.Params("id"), page, limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, fiber.Map{"items": items, "total": total})
}

// DELETE /api/tenant/purchases/:id
func HandleDelete(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	if err := Delete(tenantID, c.Params("id")); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, nil)
}

// POST /api/tenant/purchases/:id/duplicate
func HandleDuplicate(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	p, err := Duplicate(claims.TenantID, c.Params("id"), claims.ID, claims.Email)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, p)
}

// GET /api/tenant/purchases/:id/returnable
func HandleGetReturnable(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	lines, err := GetReturnableLines(tenantID, c.Params("id"))
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, lines)
}

// POST /api/tenant/purchases/:id/return
func HandleReturn(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var body struct {
		Lines []ValidateLineInput `json:"lines"`
	}
	if err := c.BodyParser(&body); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	p, err := Return(claims.TenantID, c.Params("id"), claims.ID, claims.Email, body.Lines)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, p)
}

// GET /api/tenant/purchases/low-stock?limit=50
func HandleLowStock(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	items, err := LowStockProducts(tenantID, limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, items)
}

// GET /api/tenant/purchases/stats?from=&to=
func HandleStats(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	now := time.Now()
	from := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
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

	stats, err := Stats(tenantID, from, to)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, stats)
}
