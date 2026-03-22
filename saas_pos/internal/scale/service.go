package scale

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sync"
	"time"

	"saas_pos/internal/database"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// ─── In-memory connection state per tenant ──────────────────────────────────

type connState struct {
	ConnID int
	IP     string
	Name   string
}

var (
	connMu  sync.RWMutex
	connMap = map[string]*connState{} // tenantID → state
)

func col() *mongo.Collection {
	return database.Col("scale_connections")
}

// ─── Service functions ──────────────────────────────────────────────────────

// Connect establishes a connection to the scale and saves settings.
func Connect(tenantID string, input ConnectInput) (*ScaleStatus, error) {
	if input.IP == "" {
		return nil, errors.New("ip is required")
	}

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	connID, err := dllConnect(input.IP)
	if err != nil {
		return nil, err
	}

	// Store in memory
	connMu.Lock()
	connMap[tenantID] = &connState{ConnID: connID, IP: input.IP, Name: input.Name}
	connMu.Unlock()

	// Persist settings
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	now := time.Now()
	filter := bson.M{"tenant_id": tid}
	update := bson.M{"$set": bson.M{
		"ip":         input.IP,
		"name":       input.Name,
		"updated_at": now,
	}, "$setOnInsert": bson.M{
		"_id":        primitive.NewObjectID(),
		"tenant_id":  tid,
		"created_at": now,
	}}
	col().UpdateOne(ctx, filter, update, options.Update().SetUpsert(true))

	return &ScaleStatus{
		Connected: true,
		IP:        input.IP,
		Name:      input.Name,
		ConnID:    connID,
	}, nil
}

// Disconnect closes the scale connection.
func Disconnect(tenantID string) error {
	connMu.Lock()
	state, ok := connMap[tenantID]
	if ok {
		delete(connMap, tenantID)
	}
	connMu.Unlock()

	if !ok {
		return errors.New("not connected")
	}
	return dllDisconnect(state.ConnID)
}

// GetStatus returns the current connection status.
func GetStatus(tenantID string) *ScaleStatus {
	connMu.RLock()
	state, ok := connMap[tenantID]
	connMu.RUnlock()

	if !ok {
		// Try to load saved settings
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		tid, _ := primitive.ObjectIDFromHex(tenantID)
		var sc ScaleConnection
		if err := col().FindOne(ctx, bson.M{"tenant_id": tid}).Decode(&sc); err == nil {
			return &ScaleStatus{Connected: false, IP: sc.IP, Name: sc.Name}
		}
		return &ScaleStatus{Connected: false}
	}

	return &ScaleStatus{
		Connected: true,
		IP:        state.IP,
		Name:      state.Name,
		ConnID:    state.ConnID,
	}
}

// GetWeight reads the current weight from the connected scale.
func GetWeight(tenantID string) (float64, error) {
	connMu.RLock()
	state, ok := connMap[tenantID]
	connMu.RUnlock()

	if !ok {
		return 0, errors.New("not connected")
	}
	return dllGetWeight(state.ConnID)
}

// getConnID returns the active connection ID or an error.
func getConnID(tenantID string) (int, error) {
	connMu.RLock()
	state, ok := connMap[tenantID]
	connMu.RUnlock()
	if !ok {
		return 0, errors.New("not connected")
	}
	return state.ConnID, nil
}

// SyncPLU reads all weighable products for the tenant and downloads them to the scale.
func SyncPLU(tenantID string) (*SyncResult, error) {
	connID, err := getConnID(tenantID)
	if err != nil {
		return nil, err
	}

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Fetch all weighable, non-archived products with a valid lfcode
	cursor, err := database.Col("products").Find(ctx, bson.M{
		"tenant_id":    tid,
		"is_weighable": true,
		"archived":     bson.M{"$ne": true},
		"lfcode":       bson.M{"$gt": 0},
	})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	type prodDoc struct {
		Name          string   `bson:"name"`
		LFCode        int      `bson:"lfcode"`
		Barcodes      []string `bson:"barcodes"`
		PrixVente1    float64  `bson:"prix_vente_1"`
		WeightUnit    int      `bson:"weight_unit"`
		ScaleDeptment int      `bson:"scale_deptment"`
		Tare          float64  `bson:"tare"`
		ShelfLife     int      `bson:"shelf_life"`
		PackageType   int      `bson:"package_type"`
		PackageWeight float64  `bson:"package_weight"`
	}
	var products []prodDoc
	if err := cursor.All(ctx, &products); err != nil {
		return nil, err
	}

	if len(products) == 0 {
		return &SyncResult{Total: 0, Synced: 0, Batches: 0}, nil
	}

	// Clear existing PLU data on scale
	if err := dllClearPLU(connID); err != nil {
		return nil, fmt.Errorf("clear PLU failed: %w", err)
	}

	// Convert to PLU structs and send in batches of 4 (Rongta limit)
	batchSize := 4
	totalBatches := int(math.Ceil(float64(len(products)) / float64(batchSize)))

	for batch := 0; batch < totalBatches; batch++ {
		start := batch * batchSize
		end := start + batchSize
		if end > len(products) {
			end = len(products)
		}

		var plus []PLU
		for _, p := range products[start:end] {
			code := ""
			if len(p.Barcodes) > 0 {
				code = p.Barcodes[0]
			}
			// UnitPrice is integer without decimals (e.g., 1000 = 10.00)
			unitPrice := int(p.PrixVente1 * 100)
			weightUnit := p.WeightUnit
			if weightUnit == 0 {
				weightUnit = 4 // Default to Kg
			}

			plus = append(plus, PLU{
				PluName:       p.Name,
				LFCode:        p.LFCode,
				Code:          code,
				BarCode:       40,
				UnitPrice:     unitPrice,
				WeightUnit:    weightUnit,
				Deptment:      p.ScaleDeptment,
				Tare:          p.Tare,
				ShlefTime:     p.ShelfLife,
				PackageType:   p.PackageType,
				PackageWeight: p.PackageWeight,
			})
		}

		jsonBytes, err := json.Marshal(plus)
		if err != nil {
			return nil, err
		}

		if err := dllDownloadPLU(connID, string(jsonBytes), batch); err != nil {
			return nil, err
		}
	}

	return &SyncResult{
		Total:   len(products),
		Synced:  len(products),
		Batches: totalBatches,
	}, nil
}

// ClearPLU removes all PLU data from the connected scale.
func ClearPLU(tenantID string) error {
	connID, err := getConnID(tenantID)
	if err != nil {
		return err
	}
	return dllClearPLU(connID)
}

// SaveConnection persists scale connection settings without connecting.
func SaveConnection(tenantID string, input ConnectInput) error {
	if input.IP == "" {
		return errors.New("ip is required")
	}
	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return errors.New("invalid tenant_id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	now := time.Now()
	filter := bson.M{"tenant_id": tid}
	update := bson.M{"$set": bson.M{
		"ip":         input.IP,
		"name":       input.Name,
		"updated_at": now,
	}, "$setOnInsert": bson.M{
		"_id":        primitive.NewObjectID(),
		"tenant_id":  tid,
		"created_at": now,
	}}
	_, err = col().UpdateOne(ctx, filter, update, options.Update().SetUpsert(true))
	return err
}

// GetConnection returns the saved scale connection settings.
func GetConnection(tenantID string) (*ScaleConnection, error) {
	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	var sc ScaleConnection
	if err := col().FindOne(ctx, bson.M{"tenant_id": tid}).Decode(&sc); err != nil {
		return nil, errors.New("no scale configured")
	}
	return &sc, nil
}
