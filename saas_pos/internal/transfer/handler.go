package transfer

import (
	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

func HandleCreate(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var input CreateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	t, err := Create(claims.TenantID, claims.ID, claims.Email, input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, t)
}

func HandleComplete(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	t, err := Complete(tenantID, c.Params("id"))
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, t)
}

func HandleList(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 10)
	result, err := List(tenantID, page, limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": result})
}

func HandleDelete(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	if err := Delete(tenantID, c.Params("id")); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, nil)
}
