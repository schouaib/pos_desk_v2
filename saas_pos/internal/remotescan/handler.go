package remotescan

import (
	_ "embed"
	"strings"
	"time"

	"saas_pos/internal/middleware"
	"saas_pos/pkg/jwt"
	"saas_pos/pkg/response"

	"github.com/fasthttp/websocket"
	"github.com/gofiber/fiber/v2"
	gws "github.com/gofiber/contrib/websocket"
)

//go:embed scanner.html
var scannerHTML []byte

//go:embed home.html
var homeHTML []byte

//go:embed manifest.json
var manifestJSON []byte

//go:embed sw.js
var swJS []byte

// HandleScannerPage serves the mobile scanner web page.
// Public route — no auth or activation required (phone browser).
func HandleScannerPage(c *fiber.Ctx) error {
	token := c.Params("token")
	// "home" is the PWA launch page (no token needed)
	if token == "home" {
		c.Set("Content-Type", "text/html; charset=utf-8")
		return c.Send(homeHTML)
	}
	if DefaultHub.Get(token) == nil {
		return c.Status(404).SendString("Invalid or expired scanner session")
	}
	c.Set("Content-Type", "text/html; charset=utf-8")
	c.Set("Cache-Control", "no-store")
	return c.Send(scannerHTML)
}

// HandleManifest serves the PWA manifest.
func HandleManifest(c *fiber.Ctx) error {
	c.Set("Content-Type", "application/manifest+json")
	return c.Send(manifestJSON)
}

// HandleSW serves the service worker.
func HandleSW(c *fiber.Ctx) error {
	c.Set("Content-Type", "application/javascript")
	c.Set("Service-Worker-Allowed", "/")
	return c.Send(swJS)
}

// HandleIcon serves generated PWA icons.
func HandleIcon192(c *fiber.Ctx) error {
	c.Set("Content-Type", "image/png")
	c.Set("Cache-Control", "public, max-age=86400")
	return c.Send(getIcon(192))
}

func HandleIcon512(c *fiber.Ctx) error {
	c.Set("Content-Type", "image/png")
	c.Set("Cache-Control", "public, max-age=86400")
	return c.Send(getIcon(512))
}

// HandleCreateSession creates a scanner session (authenticated desktop).
func HandleCreateSession(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)
	if claims == nil {
		return response.Unauthorized(c)
	}
	token, err := DefaultHub.Create(claims.TenantID)
	if err != nil {
		return response.Error(c, fiber.StatusTooManyRequests, err.Error())
	}
	return response.OK(c, fiber.Map{"token": token})
}

// HandleDeleteSession explicitly ends a scanner session.
func HandleDeleteSession(c *fiber.Ctx) error {
	var body struct {
		Token string `json:"token"`
	}
	if err := c.BodyParser(&body); err != nil || body.Token == "" {
		return response.Error(c, 400, "token required")
	}
	DefaultHub.Remove(body.Token)
	return response.OK(c, nil)
}

// DesktopWSUpgrade is the Fiber middleware that checks for WS upgrade.
// Larger write buffer to relay photo data to desktop.
var DesktopWSUpgrade = gws.New(handleDesktopWS, gws.Config{
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
})

// PhoneWSUpgrade is the Fiber middleware for phone WS connections.
// Larger buffers to support photo uploads (up to ~2MB base64).
var PhoneWSUpgrade = gws.New(handlePhoneWS, gws.Config{
	ReadBufferSize:  4096,
	WriteBufferSize: 1024,
})

func handleDesktopWS(c *gws.Conn) {
	token := c.Query("token")
	sess := DefaultHub.Get(token)
	if sess == nil {
		c.Close()
		return
	}

	sess.mu.Lock()
	// Close previous desktop connection if any
	if sess.Desktop != nil {
		sess.Desktop.Close()
	}
	sess.Desktop = c.Conn
	sess.mu.Unlock()

	// Notify phone that desktop connected
	sess.RelayToPhone([]byte(`{"type":"desktop_connected"}`))

	defer func() {
		sess.mu.Lock()
		if sess.Desktop == c.Conn {
			sess.Desktop = nil
		}
		sess.mu.Unlock()
		c.Close()
	}()

	c.SetReadDeadline(time.Time{}) // no read timeout
	for {
		_, msg, err := c.ReadMessage()
		if err != nil {
			break
		}
		// Relay desktop→phone (e.g., ack messages)
		sess.RelayToPhone(msg)
	}
}

func handlePhoneWS(c *gws.Conn) {
	token := c.Query("token")
	sess := DefaultHub.Get(token)
	if sess == nil {
		c.Close()
		return
	}

	sess.mu.Lock()
	if sess.Phone != nil {
		sess.Phone.Close()
	}
	sess.Phone = c.Conn
	sess.mu.Unlock()

	// Notify desktop that phone connected
	sess.RelayToDesktop([]byte(`{"type":"phone_connected"}`))

	defer func() {
		sess.mu.Lock()
		if sess.Phone == c.Conn {
			sess.Phone = nil
		}
		sess.mu.Unlock()
		sess.RelayToDesktop([]byte(`{"type":"phone_disconnected"}`))
		c.Close()
	}()

	c.SetReadDeadline(time.Time{})
	c.SetReadLimit(3 * 1024 * 1024) // 3MB max message (for photo uploads)
	for {
		_, msg, err := c.ReadMessage()
		if err != nil {
			break
		}
		// Relay phone→desktop (barcode scans + photos)
		sess.RelayToDesktop(msg)
	}
}

// ValidateDesktopWS is a pre-upgrade middleware that validates activation headers
// for the desktop WebSocket (since standard RequireActivation runs before upgrade).
func ValidateDesktopWS() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Validate token exists
		token := c.Query("token")
		if DefaultHub.Get(token) == nil {
			return response.Error(c, 404, "invalid session")
		}
		// Validate JWT — try Authorization header first, fallback to ?auth= query param
		// (browser WebSocket API cannot set custom headers)
		authToken := ""
		authHeader := c.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			authToken = strings.TrimPrefix(authHeader, "Bearer ")
		} else {
			authToken = c.Query("auth")
		}
		if authToken == "" {
			return response.Unauthorized(c)
		}
		claims, err := jwt.Parse(authToken)
		if err != nil {
			return response.Unauthorized(c)
		}
		// Verify the session belongs to this tenant
		sess := DefaultHub.Get(token)
		if sess == nil || sess.TenantID != claims.TenantID {
			return response.Error(c, 403, "session does not belong to this tenant")
		}
		return c.Next()
	}
}

// IsWSUpgrade checks if a request is a WebSocket upgrade (for routing).
func IsWSUpgrade(c *fiber.Ctx) bool {
	return websocket.FastHTTPIsWebSocketUpgrade(c.Context())
}
