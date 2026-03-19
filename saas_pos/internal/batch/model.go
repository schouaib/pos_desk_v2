package batch

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type ProductBatch struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	TenantID    primitive.ObjectID `bson:"tenant_id"     json:"tenant_id"`
	ProductID   primitive.ObjectID `bson:"product_id"    json:"product_id"`
	ProductName string             `bson:"product_name"  json:"product_name"`
	BatchNumber string             `bson:"batch_number"  json:"batch_number"`
	ExpiryDate  *time.Time         `bson:"expiry_date"   json:"expiry_date,omitempty"`
	Qty         float64            `bson:"qty"           json:"qty"`
	PrixAchat   float64            `bson:"prix_achat"    json:"prix_achat"`
	CreatedAt   time.Time          `bson:"created_at"    json:"created_at"`
}

type CreateInput struct {
	ProductID   string  `json:"product_id"`
	BatchNumber string  `json:"batch_number"`
	ExpiryDate  *string `json:"expiry_date"`
	Qty         float64 `json:"qty"`
	PrixAchat   float64 `json:"prix_achat"`
}

type ListResult struct {
	Items []ProductBatch `json:"items"`
	Total int64          `json:"total"`
}

type PaginatedResult struct {
	Items []ProductBatch `json:"items"`
	Total int64          `json:"total"`
	Page  int            `json:"page"`
	Limit int            `json:"limit"`
	Pages int            `json:"pages"`
}
