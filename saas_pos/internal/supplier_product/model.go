package supplier_product

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type SupplierProduct struct {
	ID               primitive.ObjectID `bson:"_id,omitempty"     json:"id"`
	TenantID         string             `bson:"tenant_id"         json:"-"`
	SupplierID       primitive.ObjectID `bson:"supplier_id"       json:"supplier_id"`
	SupplierName     string             `bson:"supplier_name"     json:"supplier_name"`
	ProductID        primitive.ObjectID `bson:"product_id"        json:"product_id"`
	ProductName      string             `bson:"product_name"      json:"product_name"`
	SupplierRef      string             `bson:"supplier_ref"      json:"supplier_ref"`
	SupplierPrice    float64            `bson:"supplier_price"    json:"supplier_price"`
	LastPurchaseDate *time.Time         `bson:"last_purchase_date" json:"last_purchase_date,omitempty"`
	CreatedAt        time.Time          `bson:"created_at"        json:"created_at"`
	UpdatedAt        time.Time          `bson:"updated_at"        json:"updated_at"`
}

type CreateInput struct {
	SupplierID    string  `json:"supplier_id"`
	ProductID     string  `json:"product_id"`
	SupplierRef   string  `json:"supplier_ref"`
	SupplierPrice float64 `json:"supplier_price"`
}

type ListResult struct {
	Items []SupplierProduct `json:"items"`
	Total int64             `json:"total"`
}
