package activation

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type ActivationKey struct {
	ID            primitive.ObjectID `bson:"_id,omitempty"     json:"id"`
	TenantID      primitive.ObjectID `bson:"tenant_id"         json:"tenant_id"`
	Key           string             `bson:"key"               json:"key"`
	Label         string             `bson:"label"             json:"label"`           // friendly name e.g. "POS Counter 1"
	MaxInstalls   int                `bson:"max_installs"      json:"max_installs"`    // 0 = unlimited
	Installs      []Installation     `bson:"installs"          json:"installs"`
	Active        bool               `bson:"active"            json:"active"`
	CreatedAt     time.Time          `bson:"created_at"        json:"created_at"`
	ExpiresAt     *time.Time         `bson:"expires_at"        json:"expires_at"`      // nil = never expires
}

type Installation struct {
	Fingerprint string    `bson:"fingerprint" json:"fingerprint"`
	Hostname    string    `bson:"hostname"    json:"hostname"`
	ActivatedAt time.Time `bson:"activated_at" json:"activated_at"`
	LastSeenAt  time.Time `bson:"last_seen_at" json:"last_seen_at"`
}

// ── DTOs ────────────────────────────────────────────────────────────────────

type CreateKeyRequest struct {
	Label       string `json:"label"`
	MaxInstalls int    `json:"max_installs"`
	ExpiresIn   int    `json:"expires_in"` // days, 0 = never
}

type ActivateRequest struct {
	Key         string `json:"key"`
	Fingerprint string `json:"fingerprint"`
}

type ValidateRequest struct {
	Key         string `json:"key"`
	Fingerprint string `json:"fingerprint"`
}

type ActivateResponse struct {
	TenantName string `json:"tenant_name"`
	Valid      bool   `json:"valid"`
}
