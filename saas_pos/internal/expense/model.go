package expense

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Expense struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	TenantID    string             `bson:"tenant_id"    json:"-"`
	Label       string             `bson:"label"        json:"label"`
	Amount      float64            `bson:"amount"       json:"amount"`
	DateFrom    time.Time          `bson:"date_from"    json:"date_from"`
	DateTo      time.Time          `bson:"date_to"      json:"date_to"`
	Days        int                `bson:"days"         json:"days"`
	DailyAmount float64            `bson:"daily_amount" json:"daily_amount"`
	Note        string             `bson:"note"         json:"note"`
	CreatedAt   time.Time          `bson:"created_at"   json:"created_at"`
}

type CreateInput struct {
	Label    string  `json:"label"`
	Amount   float64 `json:"amount"`
	DateFrom string  `json:"date_from"`
	DateTo   string  `json:"date_to"`
	Note     string  `json:"note"`
}

type UpdateInput struct {
	Label    string  `json:"label"`
	Amount   float64 `json:"amount"`
	DateFrom string  `json:"date_from"`
	DateTo   string  `json:"date_to"`
	Note     string  `json:"note"`
}

type ListResult struct {
	Items []Expense `json:"items"`
	Total int64     `json:"total"`
}

type SumResult struct {
	Total float64 `json:"total"`
}
