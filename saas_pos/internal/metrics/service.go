package metrics

import (
	"context"
	"math"
	"sort"
	"time"

	"saas_pos/internal/database"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

var svc *Service

type Service struct {
	col   *mongo.Collection
	logCh chan RequestLog
	done  <-chan struct{}
}

// Init starts the background metrics worker. Call once at startup.
// The done channel signals the worker to flush remaining logs and exit.
func Init(done <-chan struct{}) {
	s := &Service{
		col:   database.Col("request_logs"),
		logCh: make(chan RequestLog, 50000),
		done:  done,
	}
	svc = s
	go s.worker()
}

// Record enqueues a log entry — non-blocking, fire-and-forget.
func Record(log RequestLog) {
	if svc == nil {
		return
	}
	select {
	case svc.logCh <- log:
	default: // drop when buffer full — zero latency impact
	}
}

// GetStats aggregates stored logs for the given period ("1h", "6h", "24h").
func GetStats(period string) (*Result, error) {
	if svc == nil {
		return &Result{Period: period}, nil
	}
	return svc.getStats(period)
}

// worker batches inserts to MongoDB every second or when the batch reaches 200.
// On shutdown (done channel closed), it flushes any remaining logs before exiting.
func (s *Service) worker() {
	batch := make([]interface{}, 0, 200)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-s.done:
			// Drain remaining logs from channel
			for {
				select {
				case log := <-s.logCh:
					batch = append(batch, log)
				default:
					if len(batch) > 0 {
						s.flush(batch)
					}
					return
				}
			}
		case log := <-s.logCh:
			batch = append(batch, log)
			if len(batch) >= 200 {
				s.flush(batch)
				batch = batch[:0]
			}
		case <-ticker.C:
			if len(batch) > 0 {
				s.flush(batch)
				batch = batch[:0]
			}
		}
	}
}

func (s *Service) flush(batch []interface{}) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	s.col.InsertMany(ctx, batch) //nolint:errcheck
}

func (s *Service) getStats(period string) (*Result, error) {
	var since time.Time
	switch period {
	case "6h":
		since = time.Now().Add(-6 * time.Hour)
	case "24h":
		since = time.Now().Add(-24 * time.Hour)
	default:
		since = time.Now().Add(-1 * time.Hour)
		period = "1h"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"timestamp": bson.M{"$gte": since}}}},
		{{Key: "$group", Value: bson.D{
			{Key: "_id", Value: bson.D{
				{Key: "method", Value: "$method"},
				{Key: "path", Value: "$path"},
			}},
			{Key: "count", Value: bson.D{{Key: "$sum", Value: 1}}},
			{Key: "durations", Value: bson.D{{Key: "$push", Value: "$duration_ms"}}},
			{Key: "min_ms", Value: bson.D{{Key: "$min", Value: "$duration_ms"}}},
			{Key: "max_ms", Value: bson.D{{Key: "$max", Value: "$duration_ms"}}},
			{Key: "errors", Value: bson.D{{Key: "$sum", Value: bson.D{
				{Key: "$cond", Value: bson.A{
					bson.D{{Key: "$gte", Value: bson.A{"$status_code", 400}}},
					1, 0,
				}},
			}}}},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}}}},
	}

	cursor, err := s.col.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	type aggDoc struct {
		ID struct {
			Method string `bson:"method"`
			Path   string `bson:"path"`
		} `bson:"_id"`
		Count     int64   `bson:"count"`
		Durations []int64 `bson:"durations"`
		MinMs     int64   `bson:"min_ms"`
		MaxMs     int64   `bson:"max_ms"`
		Errors    int64   `bson:"errors"`
	}

	var endpoints []EndpointStats
	var totalRequests, totalErrors int64

	for cursor.Next(ctx) {
		var r aggDoc
		if err := cursor.Decode(&r); err != nil {
			continue
		}
		totalRequests += r.Count
		totalErrors += r.Errors

		sorted := make([]float64, len(r.Durations))
		var sum float64
		for i, d := range r.Durations {
			sorted[i] = float64(d)
			sum += float64(d)
		}
		sort.Float64s(sorted)

		var avg float64
		if len(sorted) > 0 {
			avg = sum / float64(len(sorted))
		}
		sr := 100.0
		if r.Count > 0 {
			sr = float64(r.Count-r.Errors) / float64(r.Count) * 100
		}

		endpoints = append(endpoints, EndpointStats{
			Method:      r.ID.Method,
			Path:        r.ID.Path,
			Count:       r.Count,
			ErrorCount:  r.Errors,
			SuccessRate: round2(sr),
			MinMs:       r.MinMs,
			MaxMs:       r.MaxMs,
			AvgMs:       round2(avg),
			P50Ms:       pct(sorted, 50),
			P90Ms:       pct(sorted, 90),
			P95Ms:       pct(sorted, 95),
			P99Ms:       pct(sorted, 99),
		})
	}

	overallSR := 100.0
	if totalRequests > 0 {
		overallSR = round2(float64(totalRequests-totalErrors) / float64(totalRequests) * 100)
	}
	return &Result{
		Endpoints:     endpoints,
		TotalRequests: totalRequests,
		SuccessRate:   overallSR,
		Period:        period,
	}, nil
}

func pct(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := int(math.Ceil(p/100*float64(len(sorted)))) - 1
	if idx < 0 {
		idx = 0
	}
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	return round2(sorted[idx])
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
