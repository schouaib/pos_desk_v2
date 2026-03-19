package sale_return

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type ReturnLine struct {
	ProductID   primitive.ObjectID `bson:"product_id"    json:"product_id"`
	ProductName string             `bson:"product_name"  json:"product_name"`
	Barcode     string             `bson:"barcode"       json:"barcode"`
	Qty         float64            `bson:"qty"           json:"qty"`
	UnitPrice   float64            `bson:"unit_price"    json:"unit_price"`
	PrixAchat   float64            `bson:"prix_achat"    json:"prix_achat"`
	Reason      string             `bson:"reason"        json:"reason"`
	TotalHT     float64            `bson:"total_ht"      json:"total_ht"`
	TotalTTC    float64            `bson:"total_ttc"     json:"total_ttc"`
	VAT         int                `bson:"vat"           json:"vat"`
}

type SaleReturn struct {
	ID             primitive.ObjectID `bson:"_id,omitempty"    json:"id"`
	TenantID       string             `bson:"tenant_id"        json:"-"`
	Ref            string             `bson:"ref"              json:"ref"`
	OriginalSaleID primitive.ObjectID `bson:"original_sale_id" json:"original_sale_id"`
	OriginalSaleRef string            `bson:"original_sale_ref" json:"original_sale_ref"`
	Lines          []ReturnLine       `bson:"lines"            json:"lines"`
	Total          float64            `bson:"total"            json:"total"` // negative
	CashierID      string             `bson:"cashier_id"       json:"cashier_id"`
	CashierEmail   string             `bson:"cashier_email"    json:"cashier_email"`
	CreatedAt      time.Time          `bson:"created_at"       json:"created_at"`
}

type ReturnLineInput struct {
	ProductID string  `json:"product_id"`
	Qty       float64 `json:"qty"`
	Reason    string  `json:"reason"`
}

type CreateInput struct {
	Lines []ReturnLineInput `json:"lines"`
}

type ListResult struct {
	Items []SaleReturn `json:"items"`
	Total int64        `json:"total"`
}
