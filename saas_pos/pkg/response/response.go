package response

import "github.com/gofiber/fiber/v2"

func OK(c *fiber.Ctx, data interface{}) error {
	return c.Status(fiber.StatusOK).JSON(fiber.Map{"success": true, "data": data})
}

func Created(c *fiber.Ctx, data interface{}) error {
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"success": true, "data": data})
}

func Error(c *fiber.Ctx, status int, msg string) error {
	return c.Status(status).JSON(fiber.Map{"success": false, "error": msg})
}

func BadRequest(c *fiber.Ctx, msg string) error {
	return Error(c, fiber.StatusBadRequest, msg)
}

func Unauthorized(c *fiber.Ctx) error {
	return Error(c, fiber.StatusUnauthorized, "unauthorized")
}

func Forbidden(c *fiber.Ctx) error {
	return Error(c, fiber.StatusForbidden, "forbidden")
}

func NotFound(c *fiber.Ctx, msg string) error {
	return Error(c, fiber.StatusNotFound, msg)
}
