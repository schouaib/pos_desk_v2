package superadmin

import (
	"saas_pos/internal/captcha"
	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// GET /api/super-admin/setup-status
// Returns whether a first-time setup is needed (no admins exist yet).
func HandleSetupStatus(c *fiber.Ctx) error {
	needs, err := NeedsSetup()
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, fiber.Map{"needs_setup": needs})
}

// POST /api/super-admin/setup
// One-time first admin creation — blocked once any admin exists.
func HandleSetup(c *fiber.Ctx) error {
	needs, err := NeedsSetup()
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	if !needs {
		return response.Error(c, fiber.StatusForbidden, "setup already completed")
	}

	var input RegisterInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if !captcha.Verify(input.CfToken) {
		return response.BadRequest(c, "captcha verification failed")
	}
	if input.Name == "" || input.Email == "" || input.Password == "" {
		return response.BadRequest(c, "name, email and password are required")
	}

	admin, err := Register(input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, admin)
}

// POST /api/super-admin/register  [super_admin only — add more admins]
func HandleRegister(c *fiber.Ctx) error {
	var input RegisterInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if input.Name == "" || input.Email == "" || input.Password == "" {
		return response.BadRequest(c, "name, email and password are required")
	}

	admin, err := Register(input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, admin)
}

// POST /api/super-admin/logout
func HandleLogout(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	Logout(claims.ID)
	return response.OK(c, fiber.Map{"logged_out": true})
}

// POST /api/super-admin/login
func HandleLogin(c *fiber.Ctx) error {
	var input LoginInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if !captcha.Verify(input.CfToken) {
		return response.BadRequest(c, "captcha verification failed")
	}

	token, admin, err := Login(input)
	if err != nil {
		return response.Error(c, fiber.StatusUnauthorized, err.Error())
	}
	return response.OK(c, fiber.Map{"token": token, "admin": admin})
}

// GET /api/super-admin/admins  [super_admin only]
func HandleList(c *fiber.Ctx) error {
	page := c.QueryInt("page", 1)
	if page < 1 {
		page = 1
	}
	result, err := List(page, 10)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, result)
}

// POST /api/super-admin/change-password  [super_admin only]
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
	if err := ChangePassword(claims.ID, body.NewPassword); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, fiber.Map{"updated": true})
}

// PATCH /api/super-admin/admins/:id/active  [super_admin only]
func HandleSetActive(c *fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Active bool `json:"active"`
	}
	if err := c.BodyParser(&body); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if err := SetActive(id, body.Active); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, fiber.Map{"updated": true})
}
