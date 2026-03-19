package metrics

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type RequestLog struct {
	ID         primitive.ObjectID `bson:"_id"`
	Method     string             `bson:"method"`
	Path       string             `bson:"path"`
	StatusCode int                `bson:"status_code"`
	DurationMs int64              `bson:"duration_ms"`
	Timestamp  time.Time          `bson:"timestamp"` // TTL index on this field
}

type EndpointStats struct {
	Method      string  `json:"method"`
	Path        string  `json:"path"`
	Count       int64   `json:"count"`
	ErrorCount  int64   `json:"error_count"`
	SuccessRate float64 `json:"success_rate"`
	MinMs       int64   `json:"min_ms"`
	MaxMs       int64   `json:"max_ms"`
	AvgMs       float64 `json:"avg_ms"`
	P50Ms       float64 `json:"p50_ms"`
	P90Ms       float64 `json:"p90_ms"`
	P95Ms       float64 `json:"p95_ms"`
	P99Ms       float64 `json:"p99_ms"`
}

type Result struct {
	Endpoints     []EndpointStats `json:"endpoints"`
	TotalRequests int64           `json:"total_requests"`
	SuccessRate   float64         `json:"success_rate"`
	Period        string          `json:"period"`
}
