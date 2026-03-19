package location

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Location struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	TenantID  primitive.ObjectID `bson:"tenant_id"     json:"tenant_id"`
	Name      string             `bson:"name"          json:"name"`
	Address   string             `bson:"address"       json:"address"`
	IsDefault bool               `bson:"is_default"    json:"is_default"`
	Active    bool               `bson:"active"        json:"active"`
	CreatedAt time.Time          `bson:"created_at"    json:"created_at"`
}

type CreateInput struct {
	Name    string `json:"name"`
	Address string `json:"address"`
}

type UpdateInput struct {
	Name    string `json:"name"`
	Address string `json:"address"`
	Active  bool   `json:"active"`
}
