package sale_return

import (
	"time"

	"saas_pos/internal/caisse"
	"saas_pos/internal/dvr"
	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// POST /api/tenant/sales/:id/return
func HandleCreate(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	saleID := c.Params("id")
	var input CreateInput
	if err := c.BodyParser(&input); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "invalid body")
	}
	ret, err := Create(claims.TenantID, claims.ID, claims.Email, saleID, input)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}

	// DVR: fire-and-forget clip extraction for return
	if ch := caisse.GetCameraChannel(claims.TenantID, claims.ID); ch > 0 {
		dvr.SaveEvent(dvr.ClipRequest{
			TenantID:      claims.TenantID,
			EventType:     dvr.EventReturn,
			EventRef:      ret.Ref,
			EventID:       ret.ID.Hex(),
			CameraChannel: ch,
			EventTime:     ret.CreatedAt,
			CashierID:     claims.ID,
			CashierEmail:  claims.Email,
			Amount:        ret.Total,
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": ret})
}

// GET /api/tenant/sale-returns?from=&to=&page=&limit=
func HandleList(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
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

	result, err := List(tenantID, from, to, page, limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": result})
}
