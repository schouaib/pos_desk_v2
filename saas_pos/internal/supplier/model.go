package supplier

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Supplier struct {
	ID        primitive.ObjectID `bson:"_id"        json:"id"`
	TenantID  primitive.ObjectID `bson:"tenant_id"  json:"tenant_id"`
	Name      string             `bson:"name"       json:"name"`
	Phone     string             `bson:"phone"      json:"phone"`
	Address   string             `bson:"address"    json:"address"`
	Balance    float64            `bson:"balance"    json:"balance"`
	Archived   bool               `bson:"archived"   json:"archived"`
	ArchivedAt *time.Time         `bson:"archived_at,omitempty" json:"archived_at,omitempty"`
	CreatedAt  time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt  time.Time          `bson:"updated_at" json:"updated_at"`
}

type CreateInput struct {
	Name    string  `json:"name"`
	Phone   string  `json:"phone"`
	Address string  `json:"address"`
	Balance float64 `json:"balance"`
}

type UpdateInput struct {
	Name    string `json:"name"`
	Phone   string `json:"phone"`
	Address string `json:"address"`
}

type AdjustBalanceInput struct {
	Amount float64 `json:"amount"` // positive = add, negative = subtract
}

type PayBalanceInput struct {
	Amount float64 `json:"amount"` // positive; distributed across unpaid purchases oldest first
	Note   string  `json:"note"`
}

type SupplierPayment struct {
	ID           primitive.ObjectID `bson:"_id"           json:"id"`
	TenantID     primitive.ObjectID `bson:"tenant_id"     json:"tenant_id"`
	SupplierID   primitive.ObjectID `bson:"supplier_id"   json:"supplier_id"`
	SupplierName string             `bson:"supplier_name" json:"supplier_name"`
	Amount       float64            `bson:"amount"        json:"amount"`
	Note         string             `bson:"note"          json:"note"`
	CreatedBy    string             `bson:"created_by"    json:"created_by"`
	CreatedAt    time.Time          `bson:"created_at"    json:"created_at"`
}

type PaymentListResult struct {
	Items []SupplierPayment `json:"items"`
	Total int64             `json:"total"`
	Page  int               `json:"page"`
	Limit int               `json:"limit"`
	Pages int               `json:"pages"`
}

type ListResult struct {
	Items []Supplier `json:"items"`
	Total int64      `json:"total"`
	Page  int        `json:"page"`
	Limit int        `json:"limit"`
	Pages int        `json:"pages"`
}
