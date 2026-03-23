package client

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Client represents a customer of a tenant store.
type Client struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	TenantID  string             `bson:"tenant_id"     json:"-"`
	Code      string             `bson:"code"          json:"code"`
	Name      string             `bson:"name"          json:"name"`
	Phone     string             `bson:"phone"         json:"phone"`
	Email     string             `bson:"email"         json:"email"`
	Address   string             `bson:"address"       json:"address"`
	RC        string             `bson:"rc"            json:"rc"`
	NIF       string             `bson:"nif"           json:"nif"`
	NIS       string             `bson:"nis"           json:"nis"`
	NART      string             `bson:"nart"          json:"nart"`
	CompteRIB string             `bson:"compte_rib"    json:"compte_rib"`
	Balance    float64            `bson:"balance"        json:"balance"` // outstanding credit (positive = owes money)
	Archived   bool               `bson:"archived"       json:"archived"`
	ArchivedAt *time.Time         `bson:"archived_at,omitempty" json:"archived_at,omitempty"`
	CreatedAt  time.Time          `bson:"created_at"     json:"created_at"`
	UpdatedAt  time.Time          `bson:"updated_at"     json:"updated_at"`
}

// ClientInput is used for create and update requests.
type ClientInput struct {
	Name      string `json:"name"`
	Phone     string `json:"phone"`
	Email     string `json:"email"`
	Address   string `json:"address"`
	RC        string `json:"rc"`
	NIF       string `json:"nif"`
	NIS       string `json:"nis"`
	NART      string `json:"nart"`
	CompteRIB string `json:"compte_rib"`
}

// ListResult holds a paginated list of clients.
type ListResult struct {
	Items []Client `json:"items"`
	Total int64    `json:"total"`
}

// Payment represents a credit payment made by a client toward their balance.
type Payment struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	TenantID  string             `bson:"tenant_id"     json:"-"`
	ClientID  string             `bson:"client_id"     json:"client_id"`
	SaleID    string             `bson:"sale_id"       json:"sale_id,omitempty"`
	Amount    float64            `bson:"amount"        json:"amount"`
	Note      string             `bson:"note"          json:"note"`
	CreatedAt time.Time          `bson:"created_at"    json:"created_at"`
}

// PaymentInput is the payload for recording a payment.
type PaymentInput struct {
	Amount float64 `json:"amount"`
	Note   string  `json:"note"`
}

// PaymentListResult holds a paginated list of payments.
type PaymentListResult struct {
	Items []Payment `json:"items"`
	Total int64     `json:"total"`
}

// StatementSaleLine is one product line within a sale entry in the statement.
type StatementSaleLine struct {
	ProductName string  `json:"product_name"`
	Qty         float64 `json:"qty"`
	UnitPrice   float64 `json:"unit_price"`
	TotalTTC    float64 `json:"total_ttc"`
}

// StatementEntry is one line in the client account statement (sale or payment).
type StatementEntry struct {
	ID      string              `json:"id"`
	Type    string              `json:"type"`    // "sale" | "payment"
	Date    time.Time           `json:"date"`
	Amount  float64             `json:"amount"`  // always positive
	Ref     string              `json:"ref"`     // sale ref for sales, note for payments
	Balance float64             `json:"balance"` // running balance after this entry
	Lines   []StatementSaleLine `json:"lines,omitempty"` // populated for sale entries
}
