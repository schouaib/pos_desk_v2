package features

// PlanFeatures lists which modules are enabled for a subscription plan.
// All fields default to false; super-admin enables them per plan.
type PlanFeatures struct {
	Products       bool `bson:"products"        json:"products"`
	Purchases      bool `bson:"purchases"       json:"purchases"`
	Suppliers      bool `bson:"suppliers"       json:"suppliers"`
	Sales          bool `bson:"sales"           json:"sales"`
	POS            bool `bson:"pos"             json:"pos"`
	Losses         bool `bson:"losses"          json:"losses"`
	Expenses       bool `bson:"expenses"        json:"expenses"`
	Retraits       bool `bson:"retraits"        json:"retraits"`
	Stats          bool `bson:"stats"           json:"stats"`
	MultiBarcodes  bool `bson:"multi_barcodes"   json:"multi_barcodes"`
	ProductHistory bool `bson:"product_history"  json:"product_history"`
	Clients        bool `bson:"clients"          json:"clients"`
	ClientPayments bool `bson:"client_payments"  json:"client_payments"`
	UserSummary    bool `bson:"user_summary"     json:"user_summary"`
	MultiFolders   bool `bson:"multi_folders"    json:"multi_folders"`
	AccessManagement bool `bson:"access_management" json:"access_management"`
	Favorites        bool `bson:"favorites"         json:"favorites"`
	ProductVariants  bool `bson:"product_variants"  json:"product_variants"`
	StockTransfers   bool `bson:"stock_transfers"   json:"stock_transfers"`
	ProductDiscounts bool `bson:"product_discounts" json:"product_discounts"`
	ProductBundles   bool `bson:"product_bundles"   json:"product_bundles"`
	BatchTracking    bool `bson:"batch_tracking"    json:"batch_tracking"`
	Scale            bool `bson:"scale"             json:"scale"`
	Facturation      bool `bson:"facturation"       json:"facturation"`
}
