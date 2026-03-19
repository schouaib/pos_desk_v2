package transfer

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

const (
	StatusDraft     = "draft"
	StatusCompleted = "completed"
)

type TransferLine struct {
	ProductID   primitive.ObjectID `bson:"product_id"    json:"product_id"`
	ProductName string             `bson:"product_name"  json:"product_name"`
	Qty         float64            `bson:"qty"           json:"qty"`
}

type StockTransfer struct {
	ID               primitive.ObjectID `bson:"_id,omitempty"     json:"id"`
	TenantID         primitive.ObjectID `bson:"tenant_id"         json:"tenant_id"`
	FromLocationID   primitive.ObjectID `bson:"from_location_id"  json:"from_location_id"`
	FromLocationName string             `bson:"from_location_name" json:"from_location_name"`
	ToLocationID     primitive.ObjectID `bson:"to_location_id"    json:"to_location_id"`
	ToLocationName   string             `bson:"to_location_name"  json:"to_location_name"`
	Lines            []TransferLine     `bson:"lines"             json:"lines"`
	Status           string             `bson:"status"            json:"status"`
	CreatedBy        string             `bson:"created_by"        json:"created_by"`
	CreatedByEmail   string             `bson:"created_by_email"  json:"created_by_email"`
	CreatedAt        time.Time          `bson:"created_at"        json:"created_at"`
	CompletedAt      *time.Time         `bson:"completed_at"      json:"completed_at,omitempty"`
}

type TransferLineInput struct {
	ProductID string  `json:"product_id"`
	Qty       float64 `json:"qty"`
}

type CreateInput struct {
	FromLocationID string             `json:"from_location_id"`
	ToLocationID   string             `json:"to_location_id"`
	Lines          []TransferLineInput `json:"lines"`
}

type ListResult struct {
	Items []StockTransfer `json:"items"`
	Total int64           `json:"total"`
}
