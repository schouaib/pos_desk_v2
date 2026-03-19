package retrait

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Retrait struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	TenantID  string             `bson:"tenant_id"    json:"-"`
	Amount    float64            `bson:"amount"       json:"amount"`
	Reason    string             `bson:"reason"       json:"reason"`
	UserID    string             `bson:"user_id"      json:"user_id"`
	UserEmail string             `bson:"user_email"   json:"user_email"`
	CreatedAt time.Time          `bson:"created_at"   json:"created_at"`
}

type CreateInput struct {
	Amount float64 `json:"amount"`
	Reason string  `json:"reason"`
}

type ListResult struct {
	Items []Retrait `json:"items"`
	Total int64     `json:"total"`
}

type SumResult struct {
	Total float64 `json:"total"`
}
