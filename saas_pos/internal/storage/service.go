package storage

import (
	"context"
	"os"
	"path/filepath"
	"time"

	"saas_pos/internal/database"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// tenant-scoped collections to measure
var tenantCollections = []string{
	"users", "products", "categories", "brands", "units",
	"suppliers", "supplier_payments", "purchases",
	"clients", "client_payments", "sales",
	"expenses", "retraits", "stock_losses", "counters",
}

type FolderUsage struct {
	FolderID   primitive.ObjectID `json:"folder_id"`
	FolderName string             `json:"folder_name"`
	DbBytes    int64              `json:"db_bytes"`
	DiskBytes  int64              `json:"disk_bytes"`
	TotalBytes int64              `json:"total_bytes"`
	DocCounts  map[string]int64   `json:"doc_counts"`
}

type TenantUsage struct {
	TenantID   primitive.ObjectID `json:"tenant_id"`
	TenantName string             `json:"tenant_name"`
	DbBytes    int64              `json:"db_bytes"`
	DiskBytes  int64              `json:"disk_bytes"`
	TotalBytes int64              `json:"total_bytes"`
	DocCounts  map[string]int64   `json:"doc_counts"`
	Folders    []FolderUsage      `json:"folders,omitempty"`
}

type UsageResult struct {
	Tenants    []TenantUsage `json:"tenants"`
	TotalDb    int64         `json:"total_db_bytes"`
	TotalDisk  int64         `json:"total_disk_bytes"`
	TotalBytes int64         `json:"total_bytes"`
}

// measureTenant calculates DB + disk usage for a single tenant_id.
func measureTenant(ctx context.Context, id primitive.ObjectID) (dbBytes, diskBytes int64, docCounts map[string]int64) {
	docCounts = make(map[string]int64)
	for _, colName := range tenantCollections {
		col := database.Col(colName)
		filter := bson.M{"tenant_id": id}

		count, _ := col.CountDocuments(ctx, filter)
		docCounts[colName] = count

		pipeline := bson.A{
			bson.M{"$match": filter},
			bson.M{"$group": bson.M{
				"_id":  nil,
				"size": bson.M{"$sum": bson.M{"$bsonSize": "$$ROOT"}},
			}},
		}
		cur, err := col.Aggregate(ctx, pipeline)
		if err == nil {
			defer cur.Close(ctx)
			var agg []bson.M
			if cur.All(ctx, &agg) == nil && len(agg) > 0 {
				if s, ok := agg[0]["size"]; ok {
					switch v := s.(type) {
					case int32:
						dbBytes += int64(v)
					case int64:
						dbBytes += v
					}
				}
			}
		}
	}
	diskBytes = dirSize(filepath.Join("uploads", id.Hex()))
	return
}

func GetUsage() (*UsageResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// fetch all tenants
	cursor, err := database.Col("tenants").Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	type tenantDoc struct {
		ID         primitive.ObjectID `bson:"_id"`
		Name       string             `bson:"name"`
		ParentID   primitive.ObjectID `bson:"parent_id"`
		FolderName string             `bson:"folder_name"`
	}
	var allTenants []tenantDoc
	if err := cursor.All(ctx, &allTenants); err != nil {
		return nil, err
	}

	// Separate root tenants from child folders
	roots := make([]tenantDoc, 0)
	childrenByParent := make(map[primitive.ObjectID][]tenantDoc)
	for _, t := range allTenants {
		if t.ParentID.IsZero() {
			roots = append(roots, t)
		} else {
			childrenByParent[t.ParentID] = append(childrenByParent[t.ParentID], t)
		}
	}

	result := &UsageResult{}

	for _, root := range roots {
		db, disk, counts := measureTenant(ctx, root.ID)
		usage := TenantUsage{
			TenantID:   root.ID,
			TenantName: root.Name,
			DbBytes:    db,
			DiskBytes:  disk,
			DocCounts:  counts,
		}

		// Aggregate child folders
		children := childrenByParent[root.ID]
		for _, child := range children {
			cdb, cdisk, ccounts := measureTenant(ctx, child.ID)
			folderName := child.FolderName
			if folderName == "" {
				folderName = child.Name
			}
			usage.Folders = append(usage.Folders, FolderUsage{
				FolderID:   child.ID,
				FolderName: folderName,
				DbBytes:    cdb,
				DiskBytes:  cdisk,
				TotalBytes: cdb + cdisk,
				DocCounts:  ccounts,
			})
			// Add folder usage to parent totals
			usage.DbBytes += cdb
			usage.DiskBytes += cdisk
			for k, v := range ccounts {
				usage.DocCounts[k] += v
			}
		}

		usage.TotalBytes = usage.DbBytes + usage.DiskBytes
		result.TotalDb += usage.DbBytes
		result.TotalDisk += usage.DiskBytes
		result.Tenants = append(result.Tenants, usage)
	}

	result.TotalBytes = result.TotalDb + result.TotalDisk
	return result, nil
}

func dirSize(path string) int64 {
	var size int64
	filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		size += info.Size()
		return nil
	})
	return size
}
