package product

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Product struct {
	ID           primitive.ObjectID `bson:"_id" json:"id"`
	TenantID     primitive.ObjectID `bson:"tenant_id" json:"tenant_id"`
	Name         string             `bson:"name" json:"name"`
	Barcodes     []string           `bson:"barcodes" json:"barcodes"`
	CategoryID   primitive.ObjectID `bson:"category_id" json:"category_id"`
	BrandID      primitive.ObjectID `bson:"brand_id" json:"brand_id"`
	UnitID       primitive.ObjectID `bson:"unit_id" json:"unit_id"`
	Ref          string             `bson:"ref" json:"ref"`
	Abbreviation string             `bson:"abbreviation" json:"abbreviation"`
	QtyAvailable float64            `bson:"qty_available" json:"qty_available"`
	QtyMin       float64            `bson:"qty_min" json:"qty_min"`
	PrixAchat    float64            `bson:"prix_achat" json:"prix_achat"`
	PrixVente1   float64            `bson:"prix_vente_1" json:"prix_vente_1"`
	PrixVente2   float64            `bson:"prix_vente_2" json:"prix_vente_2"`
	PrixVente3   float64            `bson:"prix_vente_3" json:"prix_vente_3"`
	PrixMinimum  float64            `bson:"prix_minimum" json:"prix_minimum"`
	VAT          int                `bson:"vat" json:"vat"`
	IsService        bool               `bson:"is_service" json:"is_service"`
	ExpiryAlertDays  int                `bson:"expiry_alert_days" json:"expiry_alert_days"`
	ImageURL     string             `bson:"image_url" json:"image_url"`
	Archived     bool               `bson:"archived" json:"archived"`
	ArchivedAt   *time.Time         `bson:"archived_at" json:"archived_at,omitempty"`
	IsBundle     bool               `bson:"is_bundle" json:"is_bundle"`
	BundleItems  []BundleItem       `bson:"bundle_items" json:"bundle_items"`
	// Scale (Rongta RL1000) fields
	IsWeighable   bool    `bson:"is_weighable" json:"is_weighable"`
	LFCode        int     `bson:"lfcode" json:"lfcode"`                 // Fresh code 1-999999, unique per scale PLU
	WeightUnit    int     `bson:"weight_unit" json:"weight_unit"`       // 0:50g,1:g,2:10g,3:100g,4:Kg,5:oz,6:Lb,7:500g,8:600g,9:PCS(g),10:PCS(Kg),11:PCS(oz),12:PCS(Lb)
	Tare          float64 `bson:"tare" json:"tare"`                     // Tare weight (max 15Kg)
	ShelfLife     int     `bson:"shelf_life" json:"shelf_life"`         // Shelf life in days 0-365
	PackageType   int     `bson:"package_type" json:"package_type"`     // 0:Normal,1:FixedWeight,2:Pricing,3:FixedPrice,4:QRCode
	PackageWeight float64 `bson:"package_weight" json:"package_weight"` // Package/limit weight (max 15Kg)
	ScaleDeptment int     `bson:"scale_deptment" json:"scale_deptment"` // Department 2 digits for barcode
	CreatedAt    time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt    time.Time          `bson:"updated_at" json:"updated_at"`
	// Computed field (not stored in DB) — true when product has at least one variant
	HasVariants  bool               `bson:"-" json:"has_variants"`
}

type BundleItem struct {
	ProductID   primitive.ObjectID `bson:"product_id" json:"product_id"`
	ProductName string             `bson:"product_name" json:"product_name"`
	Qty         float64            `bson:"qty" json:"qty"`
}

type LowStockItem struct {
	ID           primitive.ObjectID `bson:"_id" json:"id"`
	Name         string             `bson:"name" json:"name"`
	Barcodes     []string           `bson:"barcodes" json:"barcodes"`
	QtyAvailable float64            `bson:"qty_available" json:"qty_available"`
	QtyMin       float64            `bson:"qty_min" json:"qty_min"`
}

type ValuationResult struct {
	TotalValue   float64 `json:"total_value"`
	TotalQty     float64 `json:"total_qty"`
	ProductCount int64   `json:"product_count"`
}

type CreateInput struct {
	Name         string   `json:"name"`
	Barcodes     []string `json:"barcodes"`
	CategoryID   string   `json:"category_id"`
	BrandID      string   `json:"brand_id"`
	UnitID       string   `json:"unit_id"`
	Ref          string   `json:"ref"`
	Abbreviation string   `json:"abbreviation"`
	QtyAvailable float64  `json:"qty_available"`
	QtyMin       float64  `json:"qty_min"`
	PrixAchat    float64  `json:"prix_achat"`
	PrixVente1   float64  `json:"prix_vente_1"`
	PrixVente2   float64  `json:"prix_vente_2"`
	PrixVente3   float64  `json:"prix_vente_3"`
	PrixMinimum  float64  `json:"prix_minimum"`
	VAT          int      `json:"vat"`
	IsService        bool         `json:"is_service"`
	ExpiryAlertDays  int          `json:"expiry_alert_days"`
	ImageURL         string       `json:"image_url"`
	IsBundle         bool         `json:"is_bundle"`
	BundleItems      []BundleItem `json:"bundle_items"`
	// Scale fields
	IsWeighable   bool    `json:"is_weighable"`
	LFCode        int     `json:"lfcode"`
	WeightUnit    int     `json:"weight_unit"`
	Tare          float64 `json:"tare"`
	ShelfLife     int     `json:"shelf_life"`
	PackageType   int     `json:"package_type"`
	PackageWeight float64 `json:"package_weight"`
	ScaleDeptment int     `json:"scale_deptment"`
}

// UpdateInput is identical to CreateInput but qty_available is excluded —
// stock quantity is managed separately (e.g. via stock movements).
type UpdateInput struct {
	Name            string       `json:"name"`
	Barcodes        []string     `json:"barcodes"`
	CategoryID      string       `json:"category_id"`
	BrandID         string       `json:"brand_id"`
	UnitID          string       `json:"unit_id"`
	Ref             string       `json:"ref"`
	Abbreviation    string       `json:"abbreviation"`
	QtyMin          float64      `json:"qty_min"`
	PrixAchat       float64      `json:"prix_achat"`
	PrixVente1      float64      `json:"prix_vente_1"`
	PrixVente2      float64      `json:"prix_vente_2"`
	PrixVente3      float64      `json:"prix_vente_3"`
	PrixMinimum     float64      `json:"prix_minimum"`
	VAT             int          `json:"vat"`
	IsService       bool         `json:"is_service"`
	ExpiryAlertDays int          `json:"expiry_alert_days"`
	ImageURL        string       `json:"image_url"`
	IsBundle        bool         `json:"is_bundle"`
	BundleItems     []BundleItem `json:"bundle_items"`
	// Scale fields
	IsWeighable   bool    `json:"is_weighable"`
	LFCode        int     `json:"lfcode"`
	WeightUnit    int     `json:"weight_unit"`
	Tare          float64 `json:"tare"`
	ShelfLife     int     `json:"shelf_life"`
	PackageType   int     `json:"package_type"`
	PackageWeight float64 `json:"package_weight"`
	ScaleDeptment int     `json:"scale_deptment"`
}

type ListResult struct {
	Items []Product `json:"items"`
	Total int64     `json:"total"`
	Page  int       `json:"page"`
	Limit int       `json:"limit"`
	Pages int       `json:"pages"`
}

// Movement represents a single stock movement event for a product.
type Movement struct {
	Date         time.Time `bson:"date"          json:"date"`
	Type         string    `bson:"type"          json:"type"`
	Qty          float64   `bson:"qty"           json:"qty"`
	PrixAchat    float64   `bson:"prix_achat"    json:"prix_achat"`
	Reference    string    `bson:"reference"     json:"reference"`
	SupplierName string    `bson:"supplier_name" json:"supplier_name"`
	VariantLabel string    `bson:"-"             json:"variant_label,omitempty"`
}

// BulkImportRow is one parsed row from a TSV product import.
type BulkImportRow struct {
	Barcode    string
	Name       string
	Qty        float64
	PrixAchat  float64
	PrixVente1 float64
	PrixVente2 float64
	PrixVente3 float64
}

// BulkImportResult holds the outcome of a bulk import operation.
type BulkImportResult struct {
	Imported  int      `json:"imported"`
	Updated   int      `json:"updated"`
	Skipped   int      `json:"skipped"`
	TotalRows int      `json:"total_rows"`
	Errors    []string `json:"errors"`
}

type MovementsResult struct {
	Items       []Movement `json:"items"`
	Total       int64      `json:"total"`
	SumQty      float64    `json:"sum_qty"`
	SumPurchase float64    `json:"sum_purchase"`
	SumSale     float64    `json:"sum_sale"`
	SumLoss     float64    `json:"sum_loss"`
	SumReturn   float64    `json:"sum_return"`
	Page        int        `json:"page"`
	Limit       int        `json:"limit"`
	Pages       int        `json:"pages"`
}
