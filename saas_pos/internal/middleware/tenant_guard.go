package middleware

import (
	"context"
	"time"

	"saas_pos/internal/database"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// TenantActiveGuard checks that the tenant associated with the JWT is still active.
// Place this after Auth() on all tenant routes.
func TenantActiveGuard() fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims := GetClaims(c)
		if claims == nil || claims.TenantID == "" {
			return response.Unauthorized(c)
		}

		tid, err := primitive.ObjectIDFromHex(claims.TenantID)
		if err != nil {
			return response.Unauthorized(c)
		}

		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		var t struct {
			Active        bool      `bson:"active"`
			PlanExpiresAt time.Time `bson:"plan_expires_at"`
		}
		if err := database.Col("tenants").FindOne(ctx, bson.M{"_id": tid}).Decode(&t); err != nil {
			return response.Unauthorized(c)
		}
		if !t.Active {
			return response.Error(c, fiber.StatusForbidden, "store is disabled")
		}
		if !t.PlanExpiresAt.IsZero() && time.Now().After(t.PlanExpiresAt) {
			return response.Error(c, fiber.StatusPaymentRequired, "plan expired")
		}

		return c.Next()
	}
}
