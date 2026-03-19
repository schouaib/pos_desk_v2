package unit

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Unit struct {
	ID        primitive.ObjectID `bson:"_id" json:"id"`
	TenantID  primitive.ObjectID `bson:"tenant_id" json:"tenant_id"`
	Name      string             `bson:"name" json:"name"`
	CreatedAt time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time          `bson:"updated_at" json:"updated_at"`
}

type CreateInput struct {
	Name string `json:"name"`
}

type UpdateInput struct {
	Name string `json:"name"`
}

type ListResult struct {
	Items []Unit `json:"items"`
	Total int64  `json:"total"`
	Page  int    `json:"page"`
	Limit int    `json:"limit"`
	Pages int    `json:"pages"`
}
