package subscription

import (
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// POST /api/super-admin/plans
func HandleCreate(c *fiber.Ctx) error {
	var input PlanInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if input.Name == "" {
		return response.BadRequest(c, "name is required")
	}

	plan, err := Create(input)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Created(c, plan)
}

// GET /api/super-admin/plans  (all) or  GET /api/plans (active only, public)
func HandleList(onlyActive bool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		plans, err := List(onlyActive)
		if err != nil {
			return response.Error(c, fiber.StatusInternalServerError, err.Error())
		}
		return response.OK(c, plans)
	}
}

// GET /api/super-admin/plans/:id
func HandleGetByID(c *fiber.Ctx) error {
	plan, err := GetByID(c.Params("id"))
	if err != nil {
		return response.NotFound(c, err.Error())
	}
	return response.OK(c, plan)
}

// PUT /api/super-admin/plans/:id
func HandleUpdate(c *fiber.Ctx) error {
	var input PlanInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	plan, err := Update(c.Params("id"), input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, plan)
}

// PATCH /api/super-admin/plans/:id/active
func HandleSetActive(c *fiber.Ctx) error {
	var body struct {
		Active bool `json:"active"`
	}
	if err := c.BodyParser(&body); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if err := SetActive(c.Params("id"), body.Active); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, fiber.Map{"updated": true})
}
