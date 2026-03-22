package user

import (
	"saas_pos/internal/captcha"
	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// POST /api/tenant/users/login
func HandleLogin(c *fiber.Ctx) error {
	var input LoginInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	// Desktop apps send X-Machine-ID — skip captcha for activated devices
	if c.Get("X-Machine-ID") == "" && !captcha.Verify(input.CfToken) {
		return response.BadRequest(c, "captcha verification failed")
	}

	token, u, err := Login(input)
	if err != nil {
		return response.Error(c, fiber.StatusUnauthorized, err.Error())
	}
	result := fiber.Map{"token": token, "user": u}
	if folders := GetLinkedTenants(u.TenantID); folders != nil {
		result["folders"] = folders
	}
	return response.OK(c, result)
}

// POST /api/tenant/auth/logout
func HandleLogout(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	Logout(claims.ID)
	return response.OK(c, fiber.Map{"logged_out": true})
}

// GET /api/tenant/users/me
func HandleMe(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	return response.OK(c, fiber.Map{
		"id":        claims.ID,
		"email":     claims.Email,
		"role":      claims.Role,
		"tenant_id": claims.TenantID,
	})
}

// POST /api/tenant/auth/change-password  [any authenticated user]
func HandleChangePassword(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var body struct {
		NewPassword string `json:"new_password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if body.NewPassword == "" {
		return response.BadRequest(c, "new_password is required")
	}
	if err := ChangePassword(claims.TenantID, claims.ID, body.NewPassword); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, fiber.Map{"updated": true})
}

// POST /api/tenant/users  [tenant_admin only]
func HandleCreate(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)

	var input CreateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if input.Name == "" || input.Email == "" || input.Password == "" || input.Role == "" {
		return response.BadRequest(c, "name, email, password and role are required")
	}

	u, err := Create(claims.TenantID, input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, u)
}

// GET /api/tenant/users  [tenant_admin only]
func HandleList(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	page := c.QueryInt("page", 1)
	if page < 1 {
		page = 1
	}
	result, err := ListByTenantPaged(claims.TenantID, page, 10)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, result)
}

// GET /api/tenant/users/:id  [tenant_admin only]
func HandleGetByID(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	u, err := GetByID(claims.TenantID, c.Params("id"))
	if err != nil {
		return response.NotFound(c, err.Error())
	}
	return response.OK(c, u)
}

// PATCH /api/tenant/users/:id/password  [tenant_admin only — reset any user's password]
func HandleResetPassword(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var body struct {
		NewPassword string `json:"new_password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if body.NewPassword == "" {
		return response.BadRequest(c, "new_password is required")
	}
	if err := ChangePassword(claims.TenantID, c.Params("id"), body.NewPassword); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, fiber.Map{"updated": true})
}

// PUT /api/tenant/users/:id  [tenant_admin only]
func HandleUpdate(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var input UpdateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	u, err := Update(claims.TenantID, c.Params("id"), input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, u)
}

// PATCH /api/tenant/users/:id/active  [tenant_admin only]
func HandleSetActive(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var body struct {
		Active bool `json:"active"`
	}
	if err := c.BodyParser(&body); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if err := SetActive(claims.TenantID, c.Params("id"), body.Active); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, fiber.Map{"updated": true})
}

// Super-admin: GET /api/super-admin/tenants/:tenantId/users
func HandleListBySuperAdmin(c *fiber.Ctx) error {
	users, err := ListByTenant(c.Params("tenantId"))
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, users)
}

// Super-admin: PATCH /api/super-admin/tenants/:tenantId/users/:id/active
func HandleSetActiveBySuperAdmin(c *fiber.Ctx) error {
	var body struct {
		Active bool `json:"active"`
	}
	if err := c.BodyParser(&body); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if err := SetActive(c.Params("tenantId"), c.Params("id"), body.Active); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, fiber.Map{"updated": true})
}
