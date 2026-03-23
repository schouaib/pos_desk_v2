package tenant

import (
	"time"

	"saas_pos/pkg/features"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type PosFavGroup struct {
	Name       string               `bson:"name"        json:"name"`
	Color      string               `bson:"color"       json:"color"`
	ProductIDs []primitive.ObjectID `bson:"product_ids" json:"product_ids"`
}

type Tenant struct {
	ID               primitive.ObjectID    `bson:"_id,omitempty"      json:"id"`
	Name             string                `bson:"name"               json:"name"`
	Email            string                `bson:"email"              json:"email"`
	Phone            string                `bson:"phone"              json:"phone"`
	Address          string                `bson:"address"            json:"address"`
	LogoURL          string                `bson:"logo_url"           json:"logo_url"`
	BrandColor       string                `bson:"brand_color"        json:"brand_color"`
	Currency         string                `bson:"currency"           json:"currency"`
	DefaultSalePrice int                   `bson:"default_sale_price" json:"default_sale_price"`
	RC               string                `bson:"rc"                 json:"rc"`
	NIF              string                `bson:"nif"                json:"nif"`
	NIS              string                `bson:"nis"                json:"nis"`
	NART             string                `bson:"nart"               json:"nart"`
	CompteRIB        string                `bson:"compte_rib"         json:"compte_rib"`
	UseVAT           bool                  `bson:"use_vat"            json:"use_vat"`
	PosExpiryWarning bool                 `bson:"pos_expiry_warning" json:"pos_expiry_warning"`
	MaxCashAmount    float64              `bson:"max_cash_amount"    json:"max_cash_amount"`
	TapRate          float64              `bson:"tap_rate"           json:"tap_rate"`
	IbsRate          float64              `bson:"ibs_rate"           json:"ibs_rate"`
	PosFavorites     []primitive.ObjectID  `bson:"pos_favorites"      json:"pos_favorites"`
	PosFavGroups     []PosFavGroup         `bson:"pos_fav_groups"     json:"pos_fav_groups"`
	PosFavColors     map[string]string     `bson:"pos_fav_colors"     json:"pos_fav_colors"`
	PlanID           primitive.ObjectID    `bson:"plan_id"            json:"plan_id"`
	Features         features.PlanFeatures `bson:"features"           json:"features"`
	MaxUsers         int                   `bson:"max_users"          json:"max_users"`
	MaxProducts      int                   `bson:"max_products"       json:"max_products"`
	MaxSalesMonth    int                   `bson:"max_sales_month"    json:"max_sales_month"`
	ParentID         primitive.ObjectID    `bson:"parent_id,omitempty" json:"parent_id,omitempty"`
	FolderName       string                `bson:"folder_name,omitempty" json:"folder_name,omitempty"`
	Active           bool                  `bson:"active"             json:"active"`
	SubscribedAt     time.Time             `bson:"subscribed_at"      json:"subscribed_at"`
	PlanExpiresAt    time.Time             `bson:"plan_expires_at"    json:"plan_expires_at"`
	CreatedAt        time.Time             `bson:"created_at"         json:"created_at"`
	UpdatedAt        time.Time             `bson:"updated_at"         json:"updated_at"`
}

// SettingsInput — used by the tenant-panel settings endpoint.
type SettingsInput struct {
	Name      string `json:"name"`
	Phone     string `json:"phone"`
	Address   string `json:"address"`
	LogoURL   string `json:"logo_url"`
	Currency         string `json:"currency"`
	DefaultSalePrice int    `json:"default_sale_price"`
	RC        string `json:"rc"`
	NIF       string `json:"nif"`
	NIS       string `json:"nis"`
	NART      string `json:"nart"`
	CompteRIB string `json:"compte_rib"`
	UseVAT           bool    `json:"use_vat"`
	PosExpiryWarning bool    `json:"pos_expiry_warning"`
	MaxCashAmount    float64 `json:"max_cash_amount"`
	TapRate          float64 `json:"tap_rate"`
	IbsRate          float64 `json:"ibs_rate"`
}

type ListResult struct {
	Items []Tenant `json:"items"`
	Total int64    `json:"total"`
	Page  int      `json:"page"`
	Limit int      `json:"limit"`
	Pages int      `json:"pages"`
}

type CreateInput struct {
	Name          string `json:"name"`
	Email         string `json:"email"`
	Phone         string `json:"phone"`
	BrandColor    string `json:"brand_color"`
	PlanID        string `json:"plan_id"`
	PlanExpiresAt string `json:"plan_expires_at"` // RFC3339
}

type UpdateInput struct {
	Name          string `json:"name"`
	Phone         string `json:"phone"`
	BrandColor    string `json:"brand_color"`
	PlanID        string `json:"plan_id"`
	PlanExpiresAt string `json:"plan_expires_at"`
}
