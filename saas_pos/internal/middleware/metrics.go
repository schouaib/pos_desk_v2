package middleware

import (
	"saas_pos/internal/metrics"
	"time"

	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// MetricsRecorder records request latency and status for every API call.
// Fire-and-forget — adds zero latency to the request path.
func MetricsRecorder() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()
		err := c.Next()
		metrics.Record(metrics.RequestLog{
			ID:         primitive.NewObjectID(),
			Method:     c.Method(),
			Path:       c.Route().Path,
			StatusCode: c.Response().StatusCode(),
			DurationMs: time.Since(start).Milliseconds(),
			Timestamp:  start,
		})
		return err
	}
}
