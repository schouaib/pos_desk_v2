package facturation

import (
	"strconv"
	"time"

	"saas_pos/internal/caisse"
	"saas_pos/internal/dvr"
	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// GET /api/tenant/facturation?doc_type=&status=&client_id=&q=&date_from=&date_to=&page=1&limit=20
func HandleList(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	docType := c.Query("doc_type", "")
	status := c.Query("status", "")
	clientID := c.Query("client_id", "")
	q := c.Query("q", "")
	dateFrom := c.Query("date_from", "")
	dateTo := c.Query("date_to", "")

	result, err := List(tenantID, docType, status, clientID, q, dateFrom, dateTo, page, limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, result)
}

// GET /api/tenant/facturation/:id
func HandleGetByID(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	doc, err := GetByID(tenantID, c.Params("id"))
	if err != nil {
		return response.NotFound(c, err.Error())
	}
	return response.OK(c, doc)
}

// POST /api/tenant/facturation
func HandleCreate(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var input CreateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	doc, err := Create(claims.TenantID, claims.ID, claims.Email, input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, doc)
}

// PUT /api/tenant/facturation/:id
func HandleUpdate(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var input UpdateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	doc, err := Update(tenantID, c.Params("id"), input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, doc)
}

// DELETE /api/tenant/facturation/:id
func HandleDelete(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	if err := Delete(tenantID, c.Params("id")); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, fiber.Map{"deleted": true})
}

// POST /api/tenant/facturation/:id/convert — Convert BC/Devis → Facture
func HandleConvert(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var input ConvertInput
	c.BodyParser(&input)
	doc, err := Convert(claims.TenantID, c.Params("id"), claims.ID, claims.Email, input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, doc)
}

// PATCH /api/tenant/facturation/:id/status — Update BC/Devis status
func HandleUpdateStatus(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var body struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil || body.Status == "" {
		return response.BadRequest(c, "status is required")
	}
	doc, err := UpdateStatus(tenantID, c.Params("id"), body.Status)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, doc)
}

// POST /api/tenant/facturation/:id/avoir — Create Avoir from Facture
func HandleCreateAvoir(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var input AvoirInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	doc, err := CreateAvoir(claims.TenantID, c.Params("id"), claims.ID, claims.Email, input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}

	// DVR: fire-and-forget clip extraction for avoir/refund
	if ch := caisse.GetCameraChannel(claims.TenantID, claims.ID); ch > 0 {
		dvr.SaveEvent(dvr.ClipRequest{
			TenantID:      claims.TenantID,
			EventType:     dvr.EventAvoir,
			EventRef:      doc.Ref,
			EventID:       doc.ID.Hex(),
			CameraChannel: ch,
			EventTime:     time.Now(),
			CashierID:     claims.ID,
			CashierEmail:  claims.Email,
			Amount:        doc.Total,
		})
	}

	return response.Created(c, doc)
}

// POST /api/tenant/facturation/:id/pay — Record payment on facture
func HandlePay(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var input PayInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	doc, err := Pay(tenantID, c.Params("id"), input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, doc)
}
