package scale

import (
	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// POST /api/tenant/scale/connect
func HandleConnect(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var input ConnectInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	status, err := Connect(tenantID, input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, status)
}

// POST /api/tenant/scale/disconnect
func HandleDisconnect(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	if err := Disconnect(tenantID); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, nil)
}

// GET /api/tenant/scale/status
func HandleGetStatus(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	return response.OK(c, GetStatus(tenantID))
}

// GET /api/tenant/scale/weight
func HandleGetWeight(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	weight, err := GetWeight(tenantID)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, fiber.Map{"weight": weight})
}

// POST /api/tenant/scale/plu/sync
func HandleSyncPLU(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	result, err := SyncPLU(tenantID)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, result)
}

// DELETE /api/tenant/scale/plu
func HandleClearPLU(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	if err := ClearPLU(tenantID); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, nil)
}

// PUT /api/tenant/scale/settings
func HandleSaveSettings(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var input ConnectInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if err := SaveConnection(tenantID, input); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, nil)
}

// GET /api/tenant/scale/settings
func HandleGetSettings(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	sc, err := GetConnection(tenantID)
	if err != nil {
		return response.OK(c, fiber.Map{"ip": "", "name": ""})
	}
	return response.OK(c, sc)
}
