package variant

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type ProductVariant struct {
	ID              primitive.ObjectID `bson:"_id,omitempty"     json:"id"`
	TenantID        primitive.ObjectID `bson:"tenant_id"         json:"tenant_id"`
	ParentProductID primitive.ObjectID `bson:"parent_product_id" json:"parent_product_id"`
	Attributes      map[string]string  `bson:"attributes"        json:"attributes"` // e.g. {"size":"L","color":"Red"}
	Barcodes        []string           `bson:"barcodes"          json:"barcodes"`
	QtyAvailable    float64            `bson:"qty_available"     json:"qty_available"`
	PrixAchat       float64            `bson:"prix_achat"        json:"prix_achat"`
	PrixVente1      float64            `bson:"prix_vente_1"      json:"prix_vente_1"`
	PrixVente2      float64            `bson:"prix_vente_2"      json:"prix_vente_2"`
	PrixVente3      float64            `bson:"prix_vente_3"      json:"prix_vente_3"`
	IsActive        bool               `bson:"is_active"         json:"is_active"`
	CreatedAt       time.Time          `bson:"created_at"        json:"created_at"`
	UpdatedAt       time.Time          `bson:"updated_at"        json:"updated_at"`
}

type CreateInput struct {
	Attributes map[string]string `json:"attributes"`
	Barcodes   []string          `json:"barcodes"`
	QtyAvailable float64         `json:"qty_available"`
	PrixAchat  float64           `json:"prix_achat"`
	PrixVente1 float64           `json:"prix_vente_1"`
	PrixVente2 float64           `json:"prix_vente_2"`
	PrixVente3 float64           `json:"prix_vente_3"`
}

type UpdateInput struct {
	Attributes   map[string]string `json:"attributes"`
	Barcodes     []string          `json:"barcodes"`
	QtyAvailable float64           `json:"qty_available"`
	PrixAchat    float64           `json:"prix_achat"`
	PrixVente1   float64           `json:"prix_vente_1"`
	PrixVente2   float64           `json:"prix_vente_2"`
	PrixVente3   float64           `json:"prix_vente_3"`
	IsActive     bool              `json:"is_active"`
}
