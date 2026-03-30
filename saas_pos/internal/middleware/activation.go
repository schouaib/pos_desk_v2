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

// Ed25519 public keys — same as embedded in Tauri apps (verify-only)
var activationPubKeyHexList = []string{
	"3e3ce7e1af68e01eadbb9af7f45cee360efefa84deb7da65eb47049d0c26b283",
	"f14c96fad2e14455c9994d1b7d4b1d96b6623afd50fa79d2938f6254594726a8",
}

var (
	pubKeys     []ed25519.PublicKey
	pubKeysOnce sync.Once
)

func getActivationPubKeys() []ed25519.PublicKey {
	pubKeysOnce.Do(func() {
		for _, h := range activationPubKeyHexList {
			b, err := hex.DecodeString(h)
			if err == nil {
				pubKeys = append(pubKeys, ed25519.PublicKey(b))
			}
		}
	})
	return pubKeys
}

// Cache verified machine IDs to avoid repeated Ed25519 verification
var (
	verifiedCache   = make(map[string]time.Time)
	verifiedCacheMu sync.RWMutex
	cacheTTL        = 10 * time.Minute
	cacheMaxSize    = 200
)

func isVerifiedCached(machineID string) bool {
	verifiedCacheMu.RLock()
	t, ok := verifiedCache[machineID]
	verifiedCacheMu.RUnlock()
	return ok && time.Since(t) < cacheTTL
}

func cacheVerified(machineID string) {
	verifiedCacheMu.Lock()
	// Evict expired entries if cache is getting large
	if len(verifiedCache) >= cacheMaxSize {
		now := time.Now()
		for k, t := range verifiedCache {
			if now.Sub(t) >= cacheTTL {
				delete(verifiedCache, k)
			}
		}
	}
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
			path == "/api/tenant/auth/login" ||
			strings.HasPrefix(path, "/api/activation/") ||
			strings.HasPrefix(path, "/scan/") ||
			path == "/api/scan/ws/phone" ||
			path == "/api/scan/ws/desktop" ||
			strings.Contains(path, "/dvr/events/") && strings.HasSuffix(path, "/clip") {
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
		pks := getActivationPubKeys()
		if len(pks) == 0 {
			return response.Error(c, fiber.StatusInternalServerError, "activation verification unavailable")
		}

		hexStr := strings.ReplaceAll(activationKey, "-", "")
		sigBytes, err := hex.DecodeString(hexStr)
		if err != nil || len(sigBytes) != ed25519.SignatureSize {
			return response.Error(c, fiber.StatusForbidden, "invalid activation")
		}

		verified := false
		for _, pk := range pks {
			if ed25519.Verify(pk, []byte(machineID), sigBytes) {
				verified = true
				break
			}
		}
		if !verified {
			return response.Error(c, fiber.StatusForbidden, "invalid activation")
		}

		cacheVerified(cacheKey)
		return c.Next()
	}
}
