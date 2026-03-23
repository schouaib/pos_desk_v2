package facturation

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Document types
const (
	DocBC      = "bc"      // Bon de Commande
	DocDevis   = "devis"   // Devis / Quote
	DocFacture = "facture" // Facture / Invoice
	DocAvoir   = "avoir"   // Avoir / Credit Note
)

// Document statuses
const (
	StatusDraft     = "draft"
	StatusSent      = "sent"      // devis sent to client
	StatusAccepted  = "accepted"  // devis accepted
	StatusRejected  = "rejected"  // devis rejected
	StatusUnpaid    = "unpaid"    // facture unpaid
	StatusPartial   = "partial"   // facture partially paid
	StatusPaid      = "paid"      // facture fully paid
	StatusCancelled = "cancelled" // cancelled
)

// DocLine is one product line inside a facturation document.
type DocLine struct {
	ProductID         primitive.ObjectID  `bson:"product_id"                   json:"product_id"`
	VariantID         *primitive.ObjectID `bson:"variant_id,omitempty"         json:"variant_id,omitempty"`
	VariantAttributes map[string]string   `bson:"variant_attributes,omitempty" json:"variant_attributes,omitempty"`
	ProductName       string              `bson:"product_name"                 json:"product_name"`
	Ref               string              `bson:"ref"                          json:"ref"`
	Qty               float64             `bson:"qty"                          json:"qty"`
	UnitPrice         float64             `bson:"unit_price"                   json:"unit_price"` // HT
	Discount          float64             `bson:"discount"                     json:"discount"`   // fixed HT discount
	VAT               int                 `bson:"vat"                          json:"vat"`
	TotalHT           float64             `bson:"total_ht"                     json:"total_ht"`
	TotalVAT          float64             `bson:"total_vat"                    json:"total_vat"`
	TotalTTC          float64             `bson:"total_ttc"                    json:"total_ttc"`
}

// Document is a facturation document (BC, Devis, Facture, or Avoir).
type Document struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Ref       string             `bson:"ref"           json:"ref"` // e.g. BC-000001, DV-000001, FA-000001, AV-000001
	TenantID  string             `bson:"tenant_id"     json:"-"`
	DocType   string             `bson:"doc_type"      json:"doc_type"` // bc | devis | facture | avoir
	Status    string             `bson:"status"        json:"status"`

	// Client info (required)
	ClientID   string `bson:"client_id"   json:"client_id"`
	ClientName string `bson:"client_name" json:"client_name"`

	// Lines
	Lines    []DocLine `bson:"lines"     json:"lines"`
	TotalHT  float64   `bson:"total_ht"  json:"total_ht"`
	TotalVAT float64   `bson:"total_vat" json:"total_vat"`
	Total    float64   `bson:"total"     json:"total"` // TTC

	// Payment tracking (facture only)
	PaymentMethod string        `bson:"payment_method,omitempty" json:"payment_method,omitempty"` // cash | cheque | virement
	Timbre        float64       `bson:"timbre"                   json:"timbre"`                   // total droit de timbre (sum of cash payments)
	PaidAmount    float64       `bson:"paid_amount"              json:"paid_amount"`
	Payments      []DocPayment  `bson:"payments,omitempty"       json:"payments,omitempty"`

	// Linked documents
	ParentID  string `bson:"parent_id,omitempty"  json:"parent_id,omitempty"`   // devis → facture: devis ID; avoir → facture: facture ID
	ParentRef string `bson:"parent_ref,omitempty" json:"parent_ref,omitempty"` // human-readable parent ref

	// Linked sale (when facture is created from POS sale)
	SaleID  string `bson:"sale_id,omitempty"  json:"sale_id,omitempty"`
	SaleRef string `bson:"sale_ref,omitempty" json:"sale_ref,omitempty"`

	// Validity / payment terms
	ValidUntil  *time.Time `bson:"valid_until,omitempty"  json:"valid_until,omitempty"`  // devis expiry
	DueDate     *time.Time `bson:"due_date,omitempty"     json:"due_date,omitempty"`     // facture payment due date
	PaymentTerms string    `bson:"payment_terms,omitempty" json:"payment_terms,omitempty"` // e.g. "30 days"

	Note string `bson:"note,omitempty" json:"note,omitempty"`

	// Audit
	CreatedBy      string     `bson:"created_by"       json:"created_by"`
	CreatedByEmail string     `bson:"created_by_email" json:"created_by_email"`
	CreatedAt      time.Time  `bson:"created_at"       json:"created_at"`
	UpdatedAt      time.Time  `bson:"updated_at"       json:"updated_at"`
}

// DocPayment records a single payment on a facture.
type DocPayment struct {
	Amount        float64   `bson:"amount"         json:"amount"`
	PaymentMethod string    `bson:"payment_method" json:"payment_method"` // cash | cheque | virement
	Timbre        float64   `bson:"timbre"         json:"timbre"`         // droit de timbre for this payment
	Note          string    `bson:"note,omitempty"  json:"note,omitempty"`
	CreatedAt     time.Time `bson:"created_at"     json:"created_at"`
}

// ── Input types ──────────────────────────────────────────────────────────────

type LineInput struct {
	ProductID string  `json:"product_id"`
	VariantID string  `json:"variant_id,omitempty"`
	Qty       float64 `json:"qty"`
	UnitPrice float64 `json:"unit_price"`
	Discount  float64 `json:"discount"`
}

type CreateInput struct {
	DocType       string      `json:"doc_type"` // bc | devis | facture
	ClientID      string      `json:"client_id"`
	Lines         []LineInput `json:"lines"`
	PaymentMethod string      `json:"payment_method,omitempty"` // cash | cheque | virement
	ValidUntil    string      `json:"valid_until,omitempty"`
	DueDate       string      `json:"due_date,omitempty"`
	PaymentTerms  string      `json:"payment_terms,omitempty"`
	Note          string      `json:"note,omitempty"`
	SaleID        string      `json:"sale_id,omitempty"` // when creating facture from POS sale
}

type UpdateInput struct {
	ClientID     string      `json:"client_id"`
	Lines        []LineInput `json:"lines"`
	ValidUntil   string      `json:"valid_until,omitempty"`
	DueDate      string      `json:"due_date,omitempty"`
	PaymentTerms string      `json:"payment_terms,omitempty"`
	Note         string      `json:"note,omitempty"`
}

type ConvertInput struct {
	DueDate       string  `json:"due_date,omitempty"`
	PaymentTerms  string  `json:"payment_terms,omitempty"`
	PaymentMethod string  `json:"payment_method,omitempty"` // cash | cheque | virement
	AmountPaid    float64 `json:"amount_paid"`              // 0 = credit sale
	Note          string  `json:"note,omitempty"`
}

type AvoirInput struct {
	Lines []AvoirLineInput `json:"lines"`
	Note  string           `json:"note,omitempty"`
}

type AvoirLineInput struct {
	ProductID string  `json:"product_id"`
	VariantID string  `json:"variant_id,omitempty"`
	Qty       float64 `json:"qty"` // qty to return/credit
}

type PayInput struct {
	Amount        float64 `json:"amount"`
	PaymentMethod string  `json:"payment_method"` // cash | cheque | virement
	Note          string  `json:"note"`
}

type ListResult struct {
	Items []Document `json:"items"`
	Total int64      `json:"total"`
	Page  int        `json:"page"`
	Limit int        `json:"limit"`
	Pages int        `json:"pages"`
}
