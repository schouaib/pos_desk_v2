package folder

import (
	"saas_pos/internal/config"
	"saas_pos/internal/database"
	"saas_pos/internal/middleware"
	"saas_pos/pkg/jwt"
	rdb "saas_pos/pkg/redis"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"saas_pos/pkg/features"
	"saas_pos/pkg/response"
)

// POST /api/tenant/folders — tenant admin requests a new folder
func HandleRequest(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var input RequestInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if input.FolderName == "" {
		return response.BadRequest(c, "folder_name is required")
	}

	req, err := RequestFolder(claims.TenantID, input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, req)
}

// GET /api/tenant/folders — list folders for current tenant group
func HandleListFolders(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	folders, err := GetFolders(claims.TenantID)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, folders)
}

// GET /api/tenant/folders/requests — list folder requests for this tenant
func HandleListRequests(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	requests, err := ListByTenant(claims.TenantID)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, requests)
}

// POST /api/tenant/folders/switch — switch active folder
func HandleSwitch(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)

	var body struct {
		FolderID string `json:"folder_id"`
	}
	if err := c.BodyParser(&body); err != nil {
		return response.BadRequest(c, "invalid body")
	}

	if err := ValidateSwitch(claims.Email, claims.TenantID, body.FolderID); err != nil {
		return response.BadRequest(c, err.Error())
	}

	// Find the user in the target tenant
	targetOID, _ := primitive.ObjectIDFromHex(body.FolderID)
	ctx := c.UserContext()

	var u struct {
		ID          primitive.ObjectID `bson:"_id"`
		Email       string             `bson:"email"`
		Role        string             `bson:"role"`
		Permissions jwt.Permissions    `bson:"permissions"`
	}
	if err := database.Col("users").FindOne(ctx, bson.M{
		"tenant_id": targetOID,
		"email":     claims.Email,
		"active":    true,
	}).Decode(&u); err != nil {
		return response.Error(c, fiber.StatusUnauthorized, "user not found in target folder")
	}

	// Get target tenant features
	var t struct {
		Features features.PlanFeatures `bson:"features"`
	}
	database.Col("tenants").FindOne(ctx, bson.M{"_id": targetOID}).Decode(&t)

	// Create new session
	sessionToken := uuid.New().String()
	if err := rdb.Set("session:"+u.ID.Hex(), sessionToken, config.App.JWTExpiresIn); err != nil {
		return response.Error(c, fiber.StatusInternalServerError, "failed to create session")
	}

	token, err := jwt.Generate(u.ID.Hex(), u.Email, u.Role, body.FolderID, sessionToken, u.Permissions, t.Features)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}

	return response.OK(c, fiber.Map{
		"token":     token,
		"folder_id": body.FolderID,
	})
}

// POST /api/tenant/folders/copy — copy data between folders
func HandleCopy(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	var input CopyInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if input.SourceFolderID == "" {
		return response.BadRequest(c, "source_folder_id is required")
	}

	result, err := CopyData(claims.TenantID, input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, result)
}

// ─── Super Admin Handlers ────────────────────────────────────────────────────

// GET /api/super-admin/folders/pending
func HandleListPending(c *fiber.Ctx) error {
	requests, err := ListPending()
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, requests)
}

// PATCH /api/super-admin/folders/:id/approve
func HandleApprove(c *fiber.Ctx) error {
	req, err := Approve(c.Params("id"))
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, req)
}

// PATCH /api/super-admin/folders/:id/reject
func HandleReject(c *fiber.Ctx) error {
	if err := Reject(c.Params("id")); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, fiber.Map{"rejected": true})
}
