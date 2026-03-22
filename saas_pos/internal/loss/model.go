package loss

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type StockLoss struct {
	ID           primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	TenantID     string              `bson:"tenant_id"     json:"-"`
	ProductID    primitive.ObjectID  `bson:"product_id"    json:"product_id"`
	VariantID    *primitive.ObjectID `bson:"variant_id,omitempty" json:"variant_id,omitempty"`
	VariantLabel string              `bson:"variant_label,omitempty" json:"variant_label,omitempty"`
	ProductName  string              `bson:"product_name"  json:"product_name"`
	Barcode      string              `bson:"barcode"       json:"barcode"`
	Type         string              `bson:"type"          json:"type"` // "vol" | "perte" | "casse"
	Qty          int                 `bson:"qty"           json:"qty"`
	Remark       string              `bson:"remark"        json:"remark"`
	CreatedAt    time.Time           `bson:"created_at"    json:"created_at"`
}

type CreateInput struct {
	ProductID string `json:"product_id"`
	VariantID string `json:"variant_id,omitempty"`
	Type      string `json:"type"`
	Qty       int    `json:"qty"`
	Remark    string `json:"remark"`
}

type ListResult struct {
	Items []StockLoss `json:"items"`
	Total int64       `json:"total"`
}
