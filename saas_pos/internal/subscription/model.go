package subscription

import (
	"time"

	"saas_pos/pkg/features"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Plan struct {
	ID          primitive.ObjectID    `bson:"_id,omitempty" json:"id"`
	Name        string                `bson:"name"          json:"name"`
	Description string                `bson:"description"   json:"description"`
	Price       float64               `bson:"price"         json:"price"`
	MaxUsers      int                   `bson:"max_users"       json:"max_users"`       // 0 = unlimited
	MaxProducts   int                   `bson:"max_products"    json:"max_products"`    // 0 = unlimited
	MaxSalesMonth int                   `bson:"max_sales_month" json:"max_sales_month"` // 0 = unlimited
	Features    features.PlanFeatures `bson:"features"      json:"features"`
	Active      bool                  `bson:"active"        json:"active"`
	CreatedAt   time.Time             `bson:"created_at"    json:"created_at"`
	UpdatedAt   time.Time             `bson:"updated_at"    json:"updated_at"`
}

type PlanInput struct {
	Name        string                `json:"name"`
	Description string                `json:"description"`
	Price       float64               `json:"price"`
	MaxUsers      int                   `json:"max_users"`
	MaxProducts   int                   `json:"max_products"`
	MaxSalesMonth int                   `json:"max_sales_month"`
	Features    features.PlanFeatures `json:"features"`
}
