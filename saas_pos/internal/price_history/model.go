package price_history

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type PriceRecord struct {
	ID             primitive.ObjectID `bson:"_id,omitempty"    json:"id"`
	TenantID       string             `bson:"tenant_id"        json:"-"`
	ProductID      primitive.ObjectID `bson:"product_id"       json:"product_id"`
	ProductName    string             `bson:"product_name"     json:"product_name"`
	PrixAchat      float64            `bson:"prix_achat"       json:"prix_achat"`
	PrixVente1     float64            `bson:"prix_vente_1"     json:"prix_vente_1"`
	PrixVente2     float64            `bson:"prix_vente_2"     json:"prix_vente_2"`
	PrixVente3     float64            `bson:"prix_vente_3"     json:"prix_vente_3"`
	Source         string             `bson:"source"           json:"source"` // "manual" | "purchase_validation"
	ChangedBy      string             `bson:"changed_by"       json:"changed_by"`
	ChangedByEmail string             `bson:"changed_by_email" json:"changed_by_email"`
	CreatedAt      time.Time          `bson:"created_at"       json:"created_at"`
}

type ListResult struct {
	Items []PriceRecord `json:"items"`
	Total int64         `json:"total"`
}
