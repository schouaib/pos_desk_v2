package scale

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ScaleConnection stores the scale connection settings per tenant.
type ScaleConnection struct {
	ID        primitive.ObjectID `bson:"_id" json:"id"`
	TenantID  primitive.ObjectID `bson:"tenant_id" json:"tenant_id"`
	IP        string             `bson:"ip" json:"ip"`
	Name      string             `bson:"name" json:"name"`
	CreatedAt time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time          `bson:"updated_at" json:"updated_at"`
}

// ConnectInput is the request body for connecting to a scale.
type ConnectInput struct {
	IP   string `json:"ip"`
	Name string `json:"name"`
}

// PLU represents a Price Look-Up item synced to the scale.
// Mirrors the Rongta Pludata structure.
type PLU struct {
	PluName       string  `json:"PluName"`
	LFCode        int     `json:"LFCode"`
	Code          string  `json:"Code"`
	BarCode       int     `json:"BarCode"`
	UnitPrice     int     `json:"UnitPrice"`
	WeightUnit    int     `json:"WeightUnit"`
	Deptment      int     `json:"Deptment"`
	Tare          float64 `json:"Tare"`
	ShlefTime     int     `json:"ShlefTime"`
	PackageType   int     `json:"PackageType"`
	PackageWeight float64 `json:"PackageWeight"`
	Tolerance     int     `json:"Tolerance"`
	Message1      int     `json:"Message1"`
	Message2      int     `json:"Message2"`
	MultiLabel    int     `json:"MultiLabel"`
	Rebate        int     `json:"Rebate"`
	Account       int     `json:"Account"`
	QtyUnit       int     `json:"QtyUnit"`
}

// SyncResult holds the outcome of a PLU sync operation.
type SyncResult struct {
	Total   int `json:"total"`
	Synced  int `json:"synced"`
	Batches int `json:"batches"`
}

// ScaleStatus represents the current connection state.
type ScaleStatus struct {
	Connected bool    `json:"connected"`
	IP        string  `json:"ip"`
	Name      string  `json:"name"`
	ConnID    int     `json:"conn_id"`
	Weight    float64 `json:"weight"`
}
