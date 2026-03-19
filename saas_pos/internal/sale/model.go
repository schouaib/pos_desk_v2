package sale

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// SaleLine is one product line inside a sale.
type SaleLine struct {
	ProductID   primitive.ObjectID `bson:"product_id"   json:"product_id"`
	ProductName string             `bson:"product_name" json:"product_name"`
	Barcode     string             `bson:"barcode"      json:"barcode"`
	Ref         string             `bson:"ref"          json:"ref"`
	Qty         float64            `bson:"qty"          json:"qty"`
	UnitPrice   float64            `bson:"unit_price"   json:"unit_price"` // HT
	PrixAchat   float64            `bson:"prix_achat"   json:"prix_achat"` // purchase cost at time of sale
	Discount    float64            `bson:"discount"     json:"discount"`   // fixed HT discount on the line
	VAT         int                `bson:"vat"          json:"vat"`
	TotalHT     float64            `bson:"total_ht"     json:"total_ht"`     // qty*unit_price - discount
	TotalTTC    float64            `bson:"total_ttc"    json:"total_ttc"`    // total_ht * (1 + vat/100)
	LineEarning float64            `bson:"line_earning" json:"line_earning"` // total_ht - qty*prix_achat
}

// Sale is a completed point-of-sale transaction.
type Sale struct {
	ID            primitive.ObjectID `bson:"_id,omitempty"  json:"id"`
	Ref           string             `bson:"ref"            json:"ref"`
	TenantID      string             `bson:"tenant_id"      json:"-"`
	Lines         []SaleLine         `bson:"lines"          json:"lines"`
	TotalHT       float64            `bson:"total_ht"       json:"total_ht"`
	TotalVAT      float64            `bson:"total_vat"      json:"total_vat"`
	Total         float64            `bson:"total"          json:"total"` // TTC
	TotalEarning  float64            `bson:"total_earning"  json:"total_earning"` // sum of line earnings
	PaymentMethod string             `bson:"payment_method" json:"payment_method"`
	AmountPaid    float64            `bson:"amount_paid"    json:"amount_paid"`
	Change        float64            `bson:"change"         json:"change"`
	// Client fields (optional)
	ClientID      string             `bson:"client_id,omitempty"   json:"client_id,omitempty"`
	ClientName    string             `bson:"client_name,omitempty" json:"client_name,omitempty"`
	SaleType      string             `bson:"sale_type"             json:"sale_type"` // "cash" | "credit"
	CashierID     string             `bson:"cashier_id"     json:"cashier_id"`
	CashierEmail  string             `bson:"cashier_email"  json:"cashier_email"`
	CreatedAt     time.Time          `bson:"created_at"     json:"created_at"`
}

// SaleLineInput is the per-line payload sent by the client.
type SaleLineInput struct {
	ProductID string  `json:"product_id"`
	Qty       float64 `json:"qty"`
	UnitPrice float64 `json:"unit_price"`
	Discount  float64 `json:"discount"`
}

// CreateInput is the full sale creation payload.
type CreateInput struct {
	Lines         []SaleLineInput `json:"lines"`
	PaymentMethod string          `json:"payment_method"`
	AmountPaid    float64         `json:"amount_paid"`
	ClientID      string          `json:"client_id"`
	SaleType      string          `json:"sale_type"` // "cash" | "credit"
}

// ListResult holds a paginated list of sales.
type ListResult struct {
	Items []Sale `json:"items"`
	Total int64  `json:"total"`
}

// StatsResult holds aggregated sale metrics for a date range.
type StatsResult struct {
	Count        int64   `json:"count"`
	TotalRevenue float64 `json:"total_revenue"` // sum of total (TTC)
	TotalEarning float64 `json:"total_earning"` // sum of total_earning
}

// UserSummaryLine holds per-user aggregated totals for a date range.
type UserSummaryLine struct {
	UserID         string  `json:"user_id"`
	UserEmail      string  `json:"user_email"`
	SalesCount     int64   `json:"sales_count"`
	SalesTotal     float64 `json:"sales_total"`     // sum of positive sales (TTC)
	ReturnsCount   int64   `json:"returns_count"`
	ReturnsTotal   float64 `json:"returns_total"`   // sum of negative sales (TTC), stored as positive
	RetraitsTotal  float64 `json:"retraits_total"`  // sum of cash withdrawals
	OpeningAmount  float64 `json:"opening_amount"`  // caisse opening amount
	ClosingAmount  float64 `json:"closing_amount"`  // caisse closing amount (actual counted)
	Ecart          float64 `json:"ecart"`           // closing - expected (opening + cash_sales + payments - retraits)
	Net            float64 `json:"net"`             // sales_total - returns_total - retraits_total
}

// UserSummaryResult holds the full per-user daily summary.
type UserSummaryResult struct {
	Users          []UserSummaryLine `json:"users"`
	GrandSales     float64           `json:"grand_sales"`
	GrandReturns   float64           `json:"grand_returns"`
	GrandRetraits  float64           `json:"grand_retraits"`
	GrandOpening   float64           `json:"grand_opening"`
	GrandClosing   float64           `json:"grand_closing"`
	GrandEcart     float64           `json:"grand_ecart"`
	GrandNet       float64           `json:"grand_net"`
}

// SalesStatisticsResult holds full profitability metrics for a date range.
type SalesStatisticsResult struct {
	SalesCount      int64   `json:"sales_count"`
	RevenueTTC      float64 `json:"revenue_ttc"`       // sum of total (TTC) — all sales
	RevenueHT       float64 `json:"revenue_ht"`        // sum of total_ht
	TotalVAT        float64 `json:"total_vat"`         // sum of total_vat
	TotalCost       float64 `json:"total_cost"`        // revenue_ht - gross_earning (purchase cost of sold goods)
	GrossEarning    float64 `json:"gross_earning"`     // sum of total_earning
	LossCost        float64 `json:"loss_cost"`         // purchase cost of stock losses in the period
	NetEarning      float64 `json:"net_earning"`       // gross_earning - loss_cost
	CashRevenueTTC  float64 `json:"cash_revenue_ttc"`  // sum of total for cash sales only
	CreditRevenueTTC float64 `json:"credit_revenue_ttc"` // sum of total for credit sales only
}
