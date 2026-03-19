package tenant

import (
	"fmt"
	"os"

	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// POST /api/super-admin/tenants
func HandleCreate(c *fiber.Ctx) error {
	var input CreateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if input.Name == "" || input.Email == "" || input.PlanID == "" {
		return response.BadRequest(c, "name, email and plan_id are required")
	}

	t, err := Create(input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, t)
}

// GET /api/super-admin/tenants
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

// GET /api/super-admin/tenants/:id
func HandleGetByID(c *fiber.Ctx) error {
	t, err := GetByID(c.Params("id"))
	if err != nil {
		return response.NotFound(c, err.Error())
	}
	return response.OK(c, t)
}

// PUT /api/super-admin/tenants/:id
func HandleUpdate(c *fiber.Ctx) error {
	var input UpdateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	t, err := Update(c.Params("id"), input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, t)
}

// PATCH /api/super-admin/tenants/:id/active
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

// GET /api/tenant/settings
func HandleGetSettings(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	t, err := GetSettings(tenantID)
	if err != nil {
		return response.NotFound(c, err.Error())
	}
	return response.OK(c, t)
}

// PUT /api/tenant/settings
func HandleUpdateSettings(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var input SettingsInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	if input.Name == "" {
		return response.BadRequest(c, "name is required")
	}
	t, err := UpdateSettings(tenantID, input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, t)
}

// PUT /api/tenant/settings/pos-favorites
func HandleUpdatePosFavorites(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var body struct {
		ProductIDs []string          `json:"product_ids"`
		Colors     map[string]string `json:"colors"`
	}
	if err := c.BodyParser(&body); err != nil {
		return response.BadRequest(c, "invalid body")
	}

	oids := make([]primitive.ObjectID, 0, len(body.ProductIDs))
	for _, id := range body.ProductIDs {
		oid, err := primitive.ObjectIDFromHex(id)
		if err != nil {
			continue
		}
		oids = append(oids, oid)
	}

	if err := UpdatePosFavorites(tenantID, oids, body.Colors); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, fiber.Map{"updated": true})
}

// PUT /api/tenant/settings/pos-fav-groups
func HandleUpdatePosFavGroups(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var body struct {
		Groups []struct {
			Name       string   `json:"name"`
			Color      string   `json:"color"`
			ProductIDs []string `json:"product_ids"`
		} `json:"groups"`
	}
	if err := c.BodyParser(&body); err != nil {
		return response.BadRequest(c, "invalid body")
	}

	groups := make([]PosFavGroup, 0, len(body.Groups))
	for _, g := range body.Groups {
		if g.Name == "" {
			continue
		}
		oids := make([]primitive.ObjectID, 0, len(g.ProductIDs))
		for _, id := range g.ProductIDs {
			oid, err := primitive.ObjectIDFromHex(id)
			if err != nil {
				continue
			}
			oids = append(oids, oid)
		}
		groups = append(groups, PosFavGroup{Name: g.Name, Color: g.Color, ProductIDs: oids})
	}

	if err := UpdatePosFavGroups(tenantID, groups); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, fiber.Map{"updated": true})
}

// POST /api/tenant/settings/upload-logo
func HandleUploadLogo(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID

	file, err := c.FormFile("logo")
	if err != nil {
		return response.BadRequest(c, "logo file required")
	}
	if file.Size > 2*1024*1024 {
		return response.BadRequest(c, "logo too large (max 2MB)")
	}

	ct := file.Header.Get("Content-Type")
	ext := ""
	switch ct {
	case "image/webp":
		ext = ".webp"
	case "image/jpeg":
		ext = ".jpg"
	case "image/png":
		ext = ".png"
	default:
		return response.BadRequest(c, "unsupported image type")
	}

	dir := fmt.Sprintf("./uploads/%s/logo", tenantID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return response.Error(c, fiber.StatusInternalServerError, "storage error")
	}

	filename := primitive.NewObjectID().Hex() + ext
	savePath := fmt.Sprintf("%s/%s", dir, filename)
	if err := c.SaveFile(file, savePath); err != nil {
		return response.Error(c, fiber.StatusInternalServerError, "failed to save logo")
	}

	url := fmt.Sprintf("/uploads/%s/logo/%s", tenantID, filename)
	return response.OK(c, fiber.Map{"url": url})
}
