package counter

import (
	"context"
	"time"

	"saas_pos/internal/database"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Next atomically increments the counter identified by (tenantID, name) and
// returns the new sequence value (starting at 1). Uses upsert so the counter
// document is created on first use — no migration needed.
func Next(tenantID, name string) (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	after := options.After
	var result struct {
		Seq int64 `bson:"seq"`
	}
	err := database.Col("counters").FindOneAndUpdate(
		ctx,
		bson.M{"tenant_id": tenantID, "name": name},
		bson.M{"$inc": bson.M{"seq": int64(1)}},
		options.FindOneAndUpdate().
			SetUpsert(true).
			SetReturnDocument(after),
	).Decode(&result)
	return result.Seq, err
}
