package caisse

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Session struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	TenantID      string             `bson:"tenant_id"     json:"-"`
	UserID        string             `bson:"user_id"       json:"user_id"`
	UserEmail     string             `bson:"user_email"    json:"user_email"`
	OpeningAmount float64            `bson:"opening_amount" json:"opening_amount"`
	ClosingAmount *float64           `bson:"closing_amount,omitempty" json:"closing_amount,omitempty"`
	Notes         string             `bson:"notes"         json:"notes"`
	Status        string             `bson:"status"        json:"status"` // "open" | "closed"
	OpenedAt      time.Time          `bson:"opened_at"     json:"opened_at"`
	ClosedAt      *time.Time         `bson:"closed_at,omitempty" json:"closed_at,omitempty"`
}

type OpenInput struct {
	OpeningAmount float64 `json:"opening_amount"`
	Notes         string  `json:"notes"`
}

type CloseInput struct {
	ClosingAmount float64 `json:"closing_amount"`
	Notes         string  `json:"notes"`
}
