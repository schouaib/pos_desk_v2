package signup

import (
	"context"
	"errors"
	"time"

	"saas_pos/internal/captcha"
	"saas_pos/internal/database"
	"saas_pos/internal/tenant"
	"saas_pos/internal/user"
	"saas_pos/pkg/jwt"
	"saas_pos/pkg/response"
	"saas_pos/pkg/validate"

	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Input struct {
	StoreName  string `json:"store_name"`
	Email      string `json:"email"`
	Password   string `json:"password"`
	Phone      string `json:"phone"`
	BrandColor string `json:"brand_color"`
	PlanID     string `json:"plan_id"`
	CfToken    string `json:"cf_token"`
}

// POST /api/signup
// Creates a new tenant store + tenant_admin user in a single transaction-like operation.
func Handle(c *fiber.Ctx) error {
	var input Input
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if !captcha.Verify(input.CfToken) {
		return response.BadRequest(c, "captcha verification failed")
	}
	if input.StoreName == "" || input.Email == "" || input.Password == "" || input.PlanID == "" {
		return response.BadRequest(c, "store_name, email, password and plan_id are required")
	}
	if err := validate.Password(input.Password); err != nil {
		return response.BadRequest(c, err.Error())
	}
	if input.BrandColor == "" {
		input.BrandColor = "#3b82f6"
	}

	// Verify plan exists and is active
	if err := validatePlan(input.PlanID); err != nil {
		return response.BadRequest(c, err.Error())
	}

	// Create tenant
	t, err := tenant.Create(tenant.CreateInput{
		Name:       input.StoreName,
		Email:      input.Email,
		Phone:      input.Phone,
		BrandColor: input.BrandColor,
		PlanID:     input.PlanID,
	})
	if err != nil {
		return response.BadRequest(c, err.Error())
	}

	// Create tenant_admin user for this store
	u, err := user.Create(t.ID.Hex(), user.CreateInput{
		Name:     input.StoreName + " Admin",
		Email:    input.Email,
		Password: input.Password,
		Role:     user.RoleTenantAdmin,
	})
	if err != nil {
		// Rollback: delete the tenant we just created
		_ = deleteTenant(t.ID)
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}

	token, err := jwt.Generate(u.ID.Hex(), u.Email, u.Role, t.ID.Hex(), "", jwt.Permissions{}, t.Features)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}

	return response.Created(c, fiber.Map{
		"token":  token,
		"user":   u,
		"tenant": t,
	})
}

func validatePlan(planID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	oid, err := primitive.ObjectIDFromHex(planID)
	if err != nil {
		return errors.New("invalid plan_id")
	}

	count, err := database.Col("subscription_plans").CountDocuments(ctx,
		bson.M{"_id": oid, "active": true},
	)
	if err != nil || count == 0 {
		return errors.New("plan not found or inactive")
	}
	return nil
}

func deleteTenant(id primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, err := database.Col("tenants").DeleteOne(ctx, bson.M{"_id": id})
	return err
}
