package activation

import (
	"context"
	"crypto/rand"
	"fmt"
	"strings"
	"time"

	"saas_pos/internal/database"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func col() *mongo.Collection { return database.Col("activation_keys") }
func tenantCol() *mongo.Collection { return database.Col("tenants") }

// generateKey produces a key like "XXXXX-XXXXX-XXXXX-XXXXX"
func generateKey() string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no 0/O/1/I to avoid confusion
	b := make([]byte, 20)
	rand.Read(b)
	var parts [4]string
	for g := 0; g < 4; g++ {
		seg := make([]byte, 5)
		for i := 0; i < 5; i++ {
			seg[i] = chars[b[g*5+i]%byte(len(chars))]
		}
		parts[g] = string(seg)
	}
	return strings.Join(parts[:], "-")
}

// CreateKey generates a new activation key for a tenant.
func CreateKey(ctx context.Context, tenantID primitive.ObjectID, req CreateKeyRequest) (*ActivationKey, error) {
	now := time.Now()
	ak := ActivationKey{
		TenantID:    tenantID,
		Key:         generateKey(),
		Label:       req.Label,
		MaxInstalls: req.MaxInstalls,
		Installs:    []Installation{},
		Active:      true,
		CreatedAt:   now,
	}
	if req.ExpiresIn > 0 {
		exp := now.AddDate(0, 0, req.ExpiresIn)
		ak.ExpiresAt = &exp
	}

	res, err := col().InsertOne(ctx, ak)
	if err != nil {
		return nil, err
	}
	ak.ID = res.InsertedID.(primitive.ObjectID)
	return &ak, nil
}

// ListKeys returns all activation keys for a tenant.
func ListKeys(ctx context.Context, tenantID primitive.ObjectID) ([]ActivationKey, error) {
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})
	cur, err := col().Find(ctx, bson.M{"tenant_id": tenantID}, opts)
	if err != nil {
		return nil, err
	}
	var keys []ActivationKey
	if err := cur.All(ctx, &keys); err != nil {
		return nil, err
	}
	return keys, nil
}

// RevokeKey deactivates an activation key.
func RevokeKey(ctx context.Context, id primitive.ObjectID, tenantID primitive.ObjectID) error {
	res, err := col().UpdateOne(ctx,
		bson.M{"_id": id, "tenant_id": tenantID},
		bson.M{"$set": bson.M{"active": false}},
	)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return fmt.Errorf("key not found")
	}
	return nil
}

// ReactivateKey re-enables a previously revoked key.
func ReactivateKey(ctx context.Context, id primitive.ObjectID, tenantID primitive.ObjectID) error {
	res, err := col().UpdateOne(ctx,
		bson.M{"_id": id, "tenant_id": tenantID},
		bson.M{"$set": bson.M{"active": true}},
	)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return fmt.Errorf("key not found")
	}
	return nil
}

// DeleteKey removes an activation key entirely.
func DeleteKey(ctx context.Context, id primitive.ObjectID, tenantID primitive.ObjectID) error {
	res, err := col().DeleteOne(ctx, bson.M{"_id": id, "tenant_id": tenantID})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return fmt.Errorf("key not found")
	}
	return nil
}

// Activate binds a machine fingerprint to an activation key.
func Activate(ctx context.Context, req ActivateRequest) (*ActivateResponse, error) {
	var ak ActivationKey
	err := col().FindOne(ctx, bson.M{"key": req.Key, "active": true}).Decode(&ak)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("invalid or revoked activation key")
		}
		return nil, err
	}

	// Check expiry
	if ak.ExpiresAt != nil && ak.ExpiresAt.Before(time.Now()) {
		return nil, fmt.Errorf("activation key has expired")
	}

	// Check if this fingerprint is already installed
	for _, inst := range ak.Installs {
		if inst.Fingerprint == req.Fingerprint {
			// Already activated on this machine — just update last_seen
			col().UpdateOne(ctx,
				bson.M{"_id": ak.ID, "installs.fingerprint": req.Fingerprint},
				bson.M{"$set": bson.M{"installs.$.last_seen_at": time.Now()}},
			)
			tenantName := getTenantName(ctx, ak.TenantID)
			return &ActivateResponse{TenantName: tenantName, Valid: true}, nil
		}
	}

	// Check max installs
	if ak.MaxInstalls > 0 && len(ak.Installs) >= ak.MaxInstalls {
		return nil, fmt.Errorf("maximum number of installations reached (%d)", ak.MaxInstalls)
	}

	// Add new installation
	now := time.Now()
	inst := Installation{
		Fingerprint: req.Fingerprint,
		ActivatedAt: now,
		LastSeenAt:  now,
	}
	_, err = col().UpdateOne(ctx,
		bson.M{"_id": ak.ID},
		bson.M{"$push": bson.M{"installs": inst}},
	)
	if err != nil {
		return nil, err
	}

	tenantName := getTenantName(ctx, ak.TenantID)
	return &ActivateResponse{TenantName: tenantName, Valid: true}, nil
}

// Validate checks if an activation key is still valid for a given fingerprint.
func Validate(ctx context.Context, req ValidateRequest) (*ActivateResponse, error) {
	var ak ActivationKey
	err := col().FindOne(ctx, bson.M{"key": req.Key, "active": true}).Decode(&ak)
	if err != nil {
		return &ActivateResponse{Valid: false}, nil
	}

	if ak.ExpiresAt != nil && ak.ExpiresAt.Before(time.Now()) {
		return &ActivateResponse{Valid: false}, nil
	}

	// Check fingerprint is registered
	for _, inst := range ak.Installs {
		if inst.Fingerprint == req.Fingerprint {
			// Update last_seen
			col().UpdateOne(ctx,
				bson.M{"_id": ak.ID, "installs.fingerprint": req.Fingerprint},
				bson.M{"$set": bson.M{"installs.$.last_seen_at": time.Now()}},
			)
			tenantName := getTenantName(ctx, ak.TenantID)
			return &ActivateResponse{TenantName: tenantName, Valid: true}, nil
		}
	}

	return &ActivateResponse{Valid: false}, nil
}

// RemoveInstall removes a specific machine installation from a key.
func RemoveInstall(ctx context.Context, keyID primitive.ObjectID, tenantID primitive.ObjectID, fingerprint string) error {
	res, err := col().UpdateOne(ctx,
		bson.M{"_id": keyID, "tenant_id": tenantID},
		bson.M{"$pull": bson.M{"installs": bson.M{"fingerprint": fingerprint}}},
	)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return fmt.Errorf("key not found")
	}
	return nil
}

func getTenantName(ctx context.Context, tenantID primitive.ObjectID) string {
	var t struct {
		Name string `bson:"name"`
	}
	tenantCol().FindOne(ctx, bson.M{"_id": tenantID}).Decode(&t)
	return t.Name
}
