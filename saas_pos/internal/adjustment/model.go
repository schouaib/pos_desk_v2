package adjustment

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type StockAdjustment struct {
	ID             primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	TenantID       string             `bson:"tenant_id"     json:"-"`
	ProductID      primitive.ObjectID `bson:"product_id"    json:"product_id"`
	ProductName    string             `bson:"product_name"  json:"product_name"`
	Barcode        string             `bson:"barcode"       json:"barcode"`
	QtyBefore      float64            `bson:"qty_before"    json:"qty_before"`
	QtyAfter       float64            `bson:"qty_after"     json:"qty_after"`
	Reason         string             `bson:"reason"        json:"reason"`
	CreatedBy      string             `bson:"created_by"    json:"created_by"`
	CreatedByEmail string             `bson:"created_by_email" json:"created_by_email"`
	CreatedAt      time.Time          `bson:"created_at"    json:"created_at"`
}

type CreateInput struct {
	ProductID string  `json:"product_id"`
	QtyAfter  float64 `json:"qty_after"`
	Reason    string  `json:"reason"`
}

type ListResult struct {
	Items []StockAdjustment `json:"items"`
	Total int64             `json:"total"`
}
