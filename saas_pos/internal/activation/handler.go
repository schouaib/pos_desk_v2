package activation

import (
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ── Public endpoints (called by desktop POS clients) ────────────────────────

// HandleActivate binds a POS machine to an activation key.
func HandleActivate(c *fiber.Ctx) error {
	var req ActivateRequest
	if err := c.BodyParser(&req); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if req.Key == "" || req.Fingerprint == "" {
		return response.BadRequest(c, "key and fingerprint are required")
	}

	res, err := Activate(c.Context(), req)
	if err != nil {
		return response.Error(c, fiber.StatusForbidden, err.Error())
	}
	return response.OK(c, res)
}

// HandleValidate checks if an activation is still valid.
func HandleValidate(c *fiber.Ctx) error {
	var req ValidateRequest
	if err := c.BodyParser(&req); err != nil {
		return response.BadRequest(c, "invalid body")
	}

	res, err := Validate(c.Context(), req)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, "validation error")
	}
	return response.OK(c, res)
}

// ── Admin endpoints (called by tenant admins) ───────────────────────────────

// HandleCreateKey creates a new activation key for the tenant.
func HandleCreateKey(c *fiber.Ctx) error {
	tidStr, _ := c.Locals("tenant_id").(string)
	tenantID, _ := primitive.ObjectIDFromHex(tidStr)
	var req CreateKeyRequest
	if err := c.BodyParser(&req); err != nil {
		return response.BadRequest(c, "invalid body")
	}

	key, err := CreateKey(c.Context(), tenantID, req)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Created(c, key)
}

// HandleListKeys returns all activation keys for the tenant.
func HandleListKeys(c *fiber.Ctx) error {
	tidStr, _ := c.Locals("tenant_id").(string)
	tenantID, _ := primitive.ObjectIDFromHex(tidStr)
	keys, err := ListKeys(c.Context(), tenantID)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	if keys == nil {
		keys = []ActivationKey{}
	}
	return response.OK(c, keys)
}

// HandleRevokeKey deactivates an activation key.
func HandleRevokeKey(c *fiber.Ctx) error {
	tidStr, _ := c.Locals("tenant_id").(string)
	tenantID, _ := primitive.ObjectIDFromHex(tidStr)
	id, err := primitive.ObjectIDFromHex(c.Params("id"))
	if err != nil {
		return response.BadRequest(c, "invalid id")
	}

	if err := RevokeKey(c.Context(), id, tenantID); err != nil {
		return response.NotFound(c, err.Error())
	}
	return response.OK(c, fiber.Map{"revoked": true})
}

// HandleReactivateKey re-enables a previously revoked key.
func HandleReactivateKey(c *fiber.Ctx) error {
	tidStr, _ := c.Locals("tenant_id").(string)
	tenantID, _ := primitive.ObjectIDFromHex(tidStr)
	id, err := primitive.ObjectIDFromHex(c.Params("id"))
	if err != nil {
		return response.BadRequest(c, "invalid id")
	}

	if err := ReactivateKey(c.Context(), id, tenantID); err != nil {
		return response.NotFound(c, err.Error())
	}
	return response.OK(c, fiber.Map{"reactivated": true})
}

// HandleDeleteKey removes an activation key.
func HandleDeleteKey(c *fiber.Ctx) error {
	tidStr, _ := c.Locals("tenant_id").(string)
	tenantID, _ := primitive.ObjectIDFromHex(tidStr)
	id, err := primitive.ObjectIDFromHex(c.Params("id"))
	if err != nil {
		return response.BadRequest(c, "invalid id")
	}

	if err := DeleteKey(c.Context(), id, tenantID); err != nil {
		return response.NotFound(c, err.Error())
	}
	return response.OK(c, fiber.Map{"deleted": true})
}

// HandleRemoveInstall removes a machine from an activation key.
func HandleRemoveInstall(c *fiber.Ctx) error {
	tidStr, _ := c.Locals("tenant_id").(string)
	tenantID, _ := primitive.ObjectIDFromHex(tidStr)
	id, err := primitive.ObjectIDFromHex(c.Params("id"))
	if err != nil {
		return response.BadRequest(c, "invalid id")
	}
	fingerprint := c.Params("fingerprint")
	if fingerprint == "" {
		return response.BadRequest(c, "fingerprint is required")
	}

	if err := RemoveInstall(c.Context(), id, tenantID, fingerprint); err != nil {
		return response.NotFound(c, err.Error())
	}
	return response.OK(c, fiber.Map{"removed": true})
}
