package purchase

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

const (
	StatusDraft              = "draft"
	StatusPartiallyValidated = "partially_validated"
	StatusValidated          = "validated"
	StatusPaid               = "paid"
)

type PurchaseLine struct {
	ProductID         primitive.ObjectID  `bson:"product_id"                   json:"product_id"`
	VariantID         *primitive.ObjectID `bson:"variant_id,omitempty"         json:"variant_id,omitempty"`
	VariantAttributes map[string]string   `bson:"variant_attributes,omitempty" json:"variant_attributes,omitempty"`
	ProductName       string              `bson:"product_name"                 json:"product_name"`
	Qty               float64             `bson:"qty"                          json:"qty"`
	ReceivedQty       float64             `bson:"received_qty"                 json:"received_qty"`
	PrixAchat         float64             `bson:"prix_achat"                   json:"prix_achat"`
	Remise            float64             `bson:"remise"                       json:"remise"`
	VAT               int                 `bson:"vat"                          json:"vat"`
	TotalHT           float64             `bson:"total_ht"                     json:"total_ht"`
	TotalVAT          float64             `bson:"total_vat"                    json:"total_vat"`
	TotalTTC          float64             `bson:"total_ttc"                    json:"total_ttc"`
	PrixVente1        float64             `bson:"prix_vente_1"                 json:"prix_vente_1"`
	PrixVente2        float64             `bson:"prix_vente_2"                 json:"prix_vente_2"`
	PrixVente3        float64             `bson:"prix_vente_3"                 json:"prix_vente_3"`
	Lot               string              `bson:"lot,omitempty"                json:"lot,omitempty"`
	ExpiryDate        *time.Time          `bson:"expiry_date,omitempty"        json:"expiry_date,omitempty"`
}

// PurchaseExpense represents an additional cost on a purchase (shipping, customs, etc.)
type PurchaseExpense struct {
	Label  string  `bson:"label"  json:"label"`
	Amount float64 `bson:"amount" json:"amount"`
}

type Purchase struct {
	ID               primitive.ObjectID  `bson:"_id"                json:"id"`
	Ref              string              `bson:"ref"                json:"ref"`
	TenantID         primitive.ObjectID  `bson:"tenant_id"          json:"tenant_id"`
	SupplierID       primitive.ObjectID  `bson:"supplier_id"        json:"supplier_id"`
	SupplierName     string              `bson:"supplier_name"      json:"supplier_name"`
	SupplierInvoice  string              `bson:"supplier_invoice"   json:"supplier_invoice"`
	ExpectedDelivery *time.Time          `bson:"expected_delivery,omitempty" json:"expected_delivery,omitempty"`
	Status           string              `bson:"status"             json:"status"`
	Lines            []PurchaseLine      `bson:"lines"              json:"lines"`
	Expenses         []PurchaseExpense   `bson:"expenses"           json:"expenses"`
	TotalHT            float64             `bson:"total_ht"             json:"total_ht"`
	TotalVAT           float64             `bson:"total_vat"            json:"total_vat"`
	Total              float64             `bson:"total"                json:"total"`
	GlobalRemise       float64             `bson:"global_remise"        json:"global_remise"`
	GlobalRemiseType   string              `bson:"global_remise_type"   json:"global_remise_type"`
	DiscountTotal      float64             `bson:"discount_total"       json:"discount_total"`
	ExpensesTotal      float64             `bson:"expenses_total"       json:"expenses_total"`
	DistributeExpenses bool                `bson:"distribute_expenses"  json:"distribute_expenses"`
	PaidAmount         float64             `bson:"paid_amount"          json:"paid_amount"`
	Note             string              `bson:"note"               json:"note"`
	CreatedBy        string              `bson:"created_by"         json:"created_by"`
	CreatedByEmail   string              `bson:"created_by_email"   json:"created_by_email"`
	ValidatedBy      string              `bson:"validated_by"       json:"validated_by,omitempty"`
	ValidatedByEmail string              `bson:"validated_by_email" json:"validated_by_email,omitempty"`
	CreatedAt        time.Time           `bson:"created_at"         json:"created_at"`
	UpdatedAt        time.Time           `bson:"updated_at"         json:"updated_at"`
	ValidatedAt      *time.Time          `bson:"validated_at"       json:"validated_at,omitempty"`
}

type LineInput struct {
	ProductID  string  `json:"product_id"`
	VariantID  string  `json:"variant_id,omitempty"`
	Qty        float64 `json:"qty"`
	PrixAchat  float64 `json:"prix_achat"`
	Remise     float64 `json:"remise"`
	PrixVente1 float64 `json:"prix_vente_1"`
	PrixVente2 float64 `json:"prix_vente_2"`
	PrixVente3 float64 `json:"prix_vente_3"`
	Lot        string  `json:"lot"`
	ExpiryDate string  `json:"expiry_date"`
}

type ExpenseInput struct {
	Label  string  `json:"label"`
	Amount float64 `json:"amount"`
}

type CreateInput struct {
	SupplierID         string         `json:"supplier_id"`
	SupplierInvoice    string         `json:"supplier_invoice"`
	ExpectedDelivery   string         `json:"expected_delivery"`
	Note               string         `json:"note"`
	Lines              []LineInput    `json:"lines"`
	Expenses           []ExpenseInput `json:"expenses"`
	GlobalRemise       float64        `json:"global_remise"`
	GlobalRemiseType   string         `json:"global_remise_type"`
	DistributeExpenses bool           `json:"distribute_expenses"`
}

type UpdateInput struct {
	SupplierID         string         `json:"supplier_id"`
	SupplierInvoice    string         `json:"supplier_invoice"`
	ExpectedDelivery   string         `json:"expected_delivery"`
	Note               string         `json:"note"`
	Lines              []LineInput    `json:"lines"`
	Expenses           []ExpenseInput `json:"expenses"`
	GlobalRemise       float64        `json:"global_remise"`
	GlobalRemiseType   string         `json:"global_remise_type"`
	DistributeExpenses bool           `json:"distribute_expenses"`
}

type ValidateInput struct {
	Lines []ValidateLineInput `json:"lines"`
}

type ValidateLineInput struct {
	ProductID   string  `json:"product_id"`
	VariantID   string  `json:"variant_id,omitempty"`
	ReceivedQty float64 `json:"received_qty"`
}

type PayInput struct {
	Amount float64 `json:"amount"`
	Note   string  `json:"note"`
}

type ListResult struct {
	Items []Purchase `json:"items"`
	Total int64      `json:"total"`
	Page  int        `json:"page"`
	Limit int        `json:"limit"`
	Pages int        `json:"pages"`
}

// PurchasePayment records an individual payment on a purchase.
type PurchasePayment struct {
	ID           primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	TenantID     primitive.ObjectID `bson:"tenant_id"     json:"-"`
	PurchaseID   primitive.ObjectID `bson:"purchase_id"   json:"purchase_id"`
	SupplierID   primitive.ObjectID `bson:"supplier_id"   json:"supplier_id"`
	Amount       float64            `bson:"amount"        json:"amount"`
	Note         string             `bson:"note"          json:"note"`
	CreatedBy    string             `bson:"created_by"    json:"created_by"`
	CreatedAt    time.Time          `bson:"created_at"    json:"created_at"`
}

// PricePreviewLine shows the before/after prices for a product when validating.
type PricePreviewLine struct {
	ProductID      string  `json:"product_id"`
	ProductName    string  `json:"product_name"`
	CurrentQty     float64 `json:"current_qty"`
	CurrentPrix    float64 `json:"current_prix_achat"`
	IncomingQty    float64 `json:"incoming_qty"`
	IncomingPrix   float64 `json:"incoming_prix_achat"`
	NewPrixAchat   float64 `json:"new_prix_achat"`
	NewPrixVente1  float64 `json:"new_prix_vente_1,omitempty"`
	NewPrixVente2  float64 `json:"new_prix_vente_2,omitempty"`
	NewPrixVente3  float64 `json:"new_prix_vente_3,omitempty"`
}

// LowStockProduct represents a product below its minimum stock threshold.
type LowStockProduct struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Barcodes     []string `json:"barcodes"`
	QtyAvailable float64 `json:"qty_available"`
	QtyMin       float64 `json:"qty_min"`
	PrixAchat    float64 `json:"prix_achat"`
	PrixVente1   float64 `json:"prix_vente_1"`
}

// PurchaseStats holds aggregated purchase metrics for a date range.
type PurchaseStats struct {
	Count          int64   `json:"count"`
	TotalAmount    float64 `json:"total_amount"`
	TotalHT        float64 `json:"total_ht"`
	TotalVAT       float64 `json:"total_vat"`
	TotalPaid      float64 `json:"total_paid"`
	TotalRemaining float64 `json:"total_remaining"`
	TotalExpenses  float64 `json:"total_expenses"`
	ByStatus       map[string]StatusStats `json:"by_status"`
	TopSuppliers   []SupplierStats        `json:"top_suppliers"`
}

type StatusStats struct {
	Count  int64   `json:"count"`
	Amount float64 `json:"amount"`
}

type SupplierStats struct {
	SupplierID   string  `json:"supplier_id"`
	SupplierName string  `json:"supplier_name"`
	Count        int64   `json:"count"`
	Amount       float64 `json:"amount"`
}
