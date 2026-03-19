package middleware

import (
	"crypto/ed25519"
	"encoding/hex"
	"strings"
	"sync"
	"time"

	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// Ed25519 public key — same as embedded in Tauri apps (verify-only)
const activationPubKeyHex = "3e3ce7e1af68e01eadbb9af7f45cee360efefa84deb7da65eb47049d0c26b283"

var (
	pubKey     ed25519.PublicKey
	pubKeyOnce sync.Once
)

func getActivationPubKey() ed25519.PublicKey {
	pubKeyOnce.Do(func() {
		b, err := hex.DecodeString(activationPubKeyHex)
		if err == nil {
			pubKey = ed25519.PublicKey(b)
		}
	})
	return pubKey
}

// Cache verified machine IDs to avoid repeated Ed25519 verification
var (
	verifiedCache   = make(map[string]time.Time)
	verifiedCacheMu sync.RWMutex
	cacheTTL        = 10 * time.Minute
)

func isVerifiedCached(machineID string) bool {
	verifiedCacheMu.RLock()
	t, ok := verifiedCache[machineID]
	verifiedCacheMu.RUnlock()
	return ok && time.Since(t) < cacheTTL
}

func cacheVerified(machineID string) {
	verifiedCacheMu.Lock()
	verifiedCache[machineID] = time.Now()
	verifiedCacheMu.Unlock()
}

// RequireActivation checks that the request includes valid activation headers:
//   - X-Machine-ID: the client's hardware fingerprint
//   - X-Activation-Key: the Ed25519 signature (hex) of the machine ID
//
// Only health/readiness probes are exempt. All other requests must come from
// an activated desktop app — browser access is blocked.
func RequireActivation() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Allow health check and setup endpoints without activation
		path := c.Path()
		if path == "/healthz" || path == "/readyz" || strings.HasPrefix(path, "/uploads/") ||
			path == "/api/super-admin/setup-status" || path == "/api/super-admin/setup" ||
			path == "/api/super-admin/login" ||
			path == "/api/plans" || path == "/api/signup" ||
			path == "/api/tenant/auth/login" {
			return c.Next()
		}

		machineID := strings.TrimSpace(c.Get("X-Machine-ID"))
		activationKey := strings.TrimSpace(c.Get("X-Activation-Key"))

		// Both headers are required — no browser access allowed
		if machineID == "" || activationKey == "" {
			return response.Error(c, fiber.StatusForbidden, "desktop activation required")
		}

		// Check cache first
		cacheKey := machineID + ":" + activationKey
		if isVerifiedCached(cacheKey) {
			return c.Next()
		}

		// Verify Ed25519 signature
		pk := getActivationPubKey()
		if pk == nil {
			return response.Error(c, fiber.StatusInternalServerError, "activation verification unavailable")
		}

		hexStr := strings.ReplaceAll(activationKey, "-", "")
		sigBytes, err := hex.DecodeString(hexStr)
		if err != nil || len(sigBytes) != ed25519.SignatureSize {
			return response.Error(c, fiber.StatusForbidden, "invalid activation")
		}

		if !ed25519.Verify(pk, []byte(machineID), sigBytes) {
			return response.Error(c, fiber.StatusForbidden, "invalid activation")
		}

		cacheVerified(cacheKey)
		return c.Next()
	}
}
