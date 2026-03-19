package discount

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type DiscountRule struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	TenantID  primitive.ObjectID `bson:"tenant_id"     json:"tenant_id"`
	ProductID primitive.ObjectID `bson:"product_id"    json:"product_id"`
	Type      string             `bson:"type"          json:"type"` // "percentage" | "fixed"
	Value     float64            `bson:"value"         json:"value"`
	MinQty    float64            `bson:"min_qty"       json:"min_qty"`
	StartDate *time.Time         `bson:"start_date"    json:"start_date,omitempty"`
	EndDate   *time.Time         `bson:"end_date"      json:"end_date,omitempty"`
	Active    bool               `bson:"active"        json:"active"`
	CreatedAt time.Time          `bson:"created_at"    json:"created_at"`
}

type CreateInput struct {
	ProductID string   `json:"product_id"`
	Type      string   `json:"type"`
	Value     float64  `json:"value"`
	MinQty    float64  `json:"min_qty"`
	StartDate *string  `json:"start_date"`
	EndDate   *string  `json:"end_date"`
}

type UpdateInput struct {
	Type      string   `json:"type"`
	Value     float64  `json:"value"`
	MinQty    float64  `json:"min_qty"`
	StartDate *string  `json:"start_date"`
	EndDate   *string  `json:"end_date"`
	Active    bool     `json:"active"`
}
