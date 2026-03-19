package chat

import (
	"strconv"

	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// ─── Tenant Handlers ─────────────────────────────────────────────────────────

// POST /api/tenant/chat/messages
func HandleTenantSend(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var input SendInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	msg, err := SendMessage(claims.TenantID, claims.ID, "tenant", claims.Email, input.Content)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, msg)
}

// GET /api/tenant/chat/messages?page=1&limit=50
func HandleTenantMessages(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	result, err := ListMessages(claims.TenantID, page, limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, result)
}

// PUT /api/tenant/chat/read
func HandleTenantMarkRead(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	if err := MarkAsRead(claims.TenantID, "tenant"); err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, nil)
}

// GET /api/tenant/chat/unread
func HandleTenantUnread(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	count, err := UnreadCount(claims.TenantID, "tenant")
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, fiber.Map{"count": count})
}

// ─── Super Admin Handlers ────────────────────────────────────────────────────

// GET /api/super-admin/chat/conversations
func HandleAdminConversations(c *fiber.Ctx) error {
	convos, err := ListConversations()
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, convos)
}

// POST /api/super-admin/chat/messages/:tenantId
func HandleAdminSend(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	tenantID := c.Params("tenantId")
	var input SendInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	msg, err := SendMessage(tenantID, claims.ID, "super_admin", claims.Email, input.Content)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, msg)
}

// GET /api/super-admin/chat/messages/:tenantId?page=1&limit=50
func HandleAdminMessages(c *fiber.Ctx) error {
	tenantID := c.Params("tenantId")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	result, err := ListMessages(tenantID, page, limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, result)
}

// PUT /api/super-admin/chat/read/:tenantId
func HandleAdminMarkRead(c *fiber.Ctx) error {
	tenantID := c.Params("tenantId")
	if err := MarkAsRead(tenantID, "super_admin"); err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, nil)
}

// GET /api/super-admin/chat/unread
func HandleAdminUnread(c *fiber.Ctx) error {
	count, err := TotalUnreadForAdmin()
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, fiber.Map{"count": count})
}
