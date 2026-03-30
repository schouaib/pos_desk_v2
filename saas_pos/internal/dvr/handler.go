package dvr

import (
	"log"
	"time"

	"saas_pos/internal/middleware"
	"saas_pos/internal/tenant"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// GET /api/tenant/dvr/events?from=&to=&type=&page=&limit=
func HandleList(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	now := time.Now()
	from := now.AddDate(0, 0, -30)
	to := now

	if f := c.Query("from"); f != "" {
		if t, err := time.Parse("2006-01-02", f); err == nil {
			from = t
		}
	}
	if t := c.Query("to"); t != "" {
		if parsed, err := time.Parse("2006-01-02", t); err == nil {
			to = parsed.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
		}
	}

	eventType := c.Query("type")
	ref := c.Query("ref")
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)

	items, total, err := List(claims.TenantID, from, to, eventType, ref, page, limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"items": items, "total": total}})
}

// GET /api/tenant/dvr/events/:id
func HandleGetByID(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	event, err := GetByID(claims.TenantID, c.Params("id"))
	if err != nil {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}
	return c.JSON(fiber.Map{"data": event})
}

// POST /api/tenant/dvr/events/:id/fetch — trigger download in background
func HandleFetchClip(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	event, err := GetByID(claims.TenantID, c.Params("id"))
	if err != nil {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}
	if event.Status == "done" && event.ClipPath != "" {
		return response.OK(c, fiber.Map{"status": "done"})
	}
	if event.Status == "downloading" {
		return response.OK(c, fiber.Map{"status": "downloading"})
	}
	// Start background download
	tid := claims.TenantID
	go func() {
		if _, err := FetchClip(tid, event); err != nil {
			log.Printf("[DVR] FetchClip failed for %s: %v", event.EventRef, err)
		}
	}()
	return response.OK(c, fiber.Map{"status": "downloading"})
}

// GET /api/tenant/dvr/events/:id/clip — serve saved MP4 (must be "done")
func HandleStreamClip(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	event, err := GetByID(claims.TenantID, c.Params("id"))
	if err != nil {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}
	if event.Status != "done" || event.ClipPath == "" {
		return response.Error(c, fiber.StatusNotFound, "clip not ready")
	}

	c.Set("Content-Type", "video/mp4")
	c.Set("Content-Disposition", "inline; filename=\""+event.EventRef+".mp4\"")
	return c.SendFile(event.ClipPath)
}

// POST /api/tenant/dvr/test — test DVR connection
func HandleTestConnection(c *fiber.Ctx) error {
	var cfg tenant.DVRConfig
	if err := c.BodyParser(&cfg); err != nil || cfg.IP == "" {
		return response.Error(c, fiber.StatusBadRequest, "DVR IP is required")
	}
	if cfg.Port <= 0 {
		cfg.Port = 37777
	}
	if err := TestConnection(&cfg); err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.OK(c, fiber.Map{"message": "DVR connection successful"})
}
