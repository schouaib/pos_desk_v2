package product

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"saas_pos/internal/database"
	"saas_pos/internal/price_history"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const (
	defaultLimit = 10
	maxLimit     = 10
)

func col() *mongo.Collection {
	return database.Col("products")
}

func clampLimit(limit int) int {
	if limit < 1 {
		return defaultLimit
	}
	if limit > maxLimit {
		return maxLimit
	}
	return limit
}

func clampVAT(v int) int {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

func Create(tenantID string, input CreateInput) (*Product, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if input.Name == "" {
		return nil, errors.New("name is required")
	}

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	// Enforce plan limits and features
	var tenantCaps struct {
		MaxProducts int `bson:"max_products"`
		Features    struct {
			MultiBarcodes bool `bson:"multi_barcodes"`
		} `bson:"features"`
	}
	if err := database.Col("tenants").FindOne(ctx, bson.M{"_id": tid}).Decode(&tenantCaps); err == nil {
		if tenantCaps.MaxProducts > 0 {
			count, _ := col().CountDocuments(ctx, bson.M{"tenant_id": tid})
			if count >= int64(tenantCaps.MaxProducts) {
				return nil, errors.New("product limit reached for your plan")
			}
		}
		if !tenantCaps.Features.MultiBarcodes && len(input.Barcodes) > 1 {
			return nil, errors.New("multiple barcodes require the multi_barcodes plan feature")
		}
	}

	// Ensure barcodes are unique within this tenant
	if len(input.Barcodes) > 0 {
		count, err := col().CountDocuments(ctx, bson.M{
			"tenant_id": tid,
			"barcodes":  bson.M{"$in": input.Barcodes},
		})
		if err != nil {
			return nil, err
		}
		if count > 0 {
			return nil, errors.New("one or more barcodes already exist")
		}
	}

	if input.Barcodes == nil {
		input.Barcodes = []string{}
	}

	categoryID, _ := primitive.ObjectIDFromHex(input.CategoryID)
	brandID, _ := primitive.ObjectIDFromHex(input.BrandID)
	unitID, _ := primitive.ObjectIDFromHex(input.UnitID)

	now := time.Now()
	p := Product{
		ID:           primitive.NewObjectID(),
		TenantID:     tid,
		Name:         input.Name,
		Barcodes:     input.Barcodes,
		CategoryID:   categoryID,
		BrandID:      brandID,
		UnitID:       unitID,
		Ref:          input.Ref,
		Abbreviation: input.Abbreviation,
		QtyAvailable: input.QtyAvailable,
		QtyMin:       input.QtyMin,
		PrixAchat:    input.PrixAchat,
		PrixVente1:   input.PrixVente1,
		PrixVente2:   input.PrixVente2,
		PrixVente3:   input.PrixVente3,
		PrixMinimum:  input.PrixMinimum,
		VAT:          clampVAT(input.VAT),
		IsService:        input.IsService,
		ExpiryAlertDays:  input.ExpiryAlertDays,
		ImageURL:         input.ImageURL,
		IsBundle:         input.IsBundle,
		BundleItems:      input.BundleItems,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	if p.BundleItems == nil {
		p.BundleItems = []BundleItem{}
	}

	if _, err = col().InsertOne(ctx, p); err != nil {
		return nil, err
	}
	return &p, nil
}

func List(tenantID string, query string, page, limit int, categoryID ...string) (*ListResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	limit = clampLimit(limit)
	if page < 1 {
		page = 1
	}
	skip := int64((page - 1) * limit)

	filter := bson.M{"tenant_id": tid, "archived": bson.M{"$ne": true}}

	// Optional category filter
	if len(categoryID) > 0 && categoryID[0] != "" {
		if catOID, err := primitive.ObjectIDFromHex(categoryID[0]); err == nil {
			filter["category_id"] = catOID
		}
	}

	if query != "" {
		terms := strings.Fields(query)
		andClauses := make(bson.A, len(terms))
		for i, term := range terms {
			re := bson.M{"$regex": term, "$options": "i"}
			andClauses[i] = bson.M{"$or": bson.A{
				bson.M{"name": re},
				bson.M{"barcodes": re},
				bson.M{"ref": re},
			}}
		}
		filter["$and"] = andClauses
	}

	total, err := col().CountDocuments(ctx, filter)
	if err != nil {
		return nil, err
	}

	cursor, err := col().Find(ctx, filter,
		options.Find().
			SetSort(bson.M{"created_at": -1}).
			SetSkip(skip).
			SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	items := []Product{}
	if err = cursor.All(ctx, &items); err != nil {
		return nil, err
	}

	pages := int(math.Ceil(float64(total) / float64(limit)))
	if pages == 0 {
		pages = 1
	}

	return &ListResult{
		Items: items,
		Total: total,
		Page:  page,
		Limit: limit,
		Pages: pages,
	}, nil
}

func GetByID(tenantID, id string) (*Product, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	var p Product
	if err = col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tid}).Decode(&p); err != nil {
		return nil, errors.New("product not found")
	}
	return &p, nil
}

func Update(tenantID, id string, input UpdateInput) (*Product, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if input.Name == "" {
		return nil, errors.New("name is required")
	}

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	if input.Barcodes == nil {
		input.Barcodes = []string{}
	}

	// Enforce multi_barcodes plan feature
	var tenantCaps struct {
		Features struct {
			MultiBarcodes bool `bson:"multi_barcodes"`
		} `bson:"features"`
	}
	if err2 := database.Col("tenants").FindOne(ctx, bson.M{"_id": tid}).Decode(&tenantCaps); err2 == nil {
		if !tenantCaps.Features.MultiBarcodes && len(input.Barcodes) > 1 {
			return nil, errors.New("multiple barcodes require the multi_barcodes plan feature")
		}
	}

	// Ensure barcodes are unique within tenant (exclude current product)
	if len(input.Barcodes) > 0 {
		count, err := col().CountDocuments(ctx, bson.M{
			"_id":       bson.M{"$ne": oid},
			"tenant_id": tid,
			"barcodes":  bson.M{"$in": input.Barcodes},
		})
		if err != nil {
			return nil, err
		}
		if count > 0 {
			return nil, errors.New("one or more barcodes already exist")
		}
	}

	bundleItems := input.BundleItems
	if bundleItems == nil {
		bundleItems = []BundleItem{}
	}

	set := bson.M{
		"name":        input.Name,
		"barcodes":    input.Barcodes,
		"category_id": func() primitive.ObjectID { id, _ := primitive.ObjectIDFromHex(input.CategoryID); return id }(),
		"brand_id":    func() primitive.ObjectID { id, _ := primitive.ObjectIDFromHex(input.BrandID); return id }(),
		"unit_id":     func() primitive.ObjectID { id, _ := primitive.ObjectIDFromHex(input.UnitID); return id }(),
		"ref":         input.Ref,
		"abbreviation":   input.Abbreviation,
		"qty_min":        input.QtyMin,
		"prix_achat":     input.PrixAchat,
		"prix_vente_1":   input.PrixVente1,
		"prix_vente_2":   input.PrixVente2,
		"prix_vente_3":   input.PrixVente3,
		"prix_minimum":   input.PrixMinimum,
		"vat":            clampVAT(input.VAT),
		"is_service":         input.IsService,
		"expiry_alert_days":  input.ExpiryAlertDays,
		"image_url":          input.ImageURL,
		"is_bundle":     input.IsBundle,
		"bundle_items":  bundleItems,
		"updated_at":    time.Now(),
	}

	// Capture old prices before update for price history
	var oldProduct struct {
		PrixAchat  float64 `bson:"prix_achat"`
		PrixVente1 float64 `bson:"prix_vente_1"`
		PrixVente2 float64 `bson:"prix_vente_2"`
		PrixVente3 float64 `bson:"prix_vente_3"`
	}
	col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tid}).Decode(&oldProduct)

	after := options.After
	var p Product
	err = col().FindOneAndUpdate(ctx,
		bson.M{"_id": oid, "tenant_id": tid},
		bson.M{"$set": set},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&p)
	if err != nil {
		return nil, errors.New("product not found")
	}

	// Record price history if prices changed
	if oldProduct.PrixAchat != input.PrixAchat || oldProduct.PrixVente1 != input.PrixVente1 ||
		oldProduct.PrixVente2 != input.PrixVente2 || oldProduct.PrixVente3 != input.PrixVente3 {
		price_history.Record(tenantID, oid, p.Name, "manual", "", "", input.PrixAchat, input.PrixVente1, input.PrixVente2, input.PrixVente3)
	}

	return &p, nil
}

// ListMovements returns stock movements for a product (purchases + losses), sorted by date desc.
func ListMovements(tenantID, productID, dateFrom, dateTo string, page, limit int) (*MovementsResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}
	pid, err := primitive.ObjectIDFromHex(productID)
	if err != nil {
		return nil, errors.New("invalid product_id")
	}

	if limit < 1 || limit > 50 {
		limit = 20
	}
	if page < 1 {
		page = 1
	}

	// Build optional date range
	dateFilter := bson.M{}
	if dateFrom != "" {
		if t, err := time.Parse("2006-01-02", dateFrom); err == nil {
			dateFilter["$gte"] = t
		}
	}
	if dateTo != "" {
		if t, err := time.Parse("2006-01-02", dateTo); err == nil {
			dateFilter["$lte"] = t.Add(24*time.Hour - time.Second)
		}
	}

	// ── 1. Purchase movements ─────────────────────────────────────────────────
	purchaseFilter := bson.M{
		"tenant_id":        tid,
		"status":           bson.M{"$in": bson.A{"validated", "paid"}},
		"lines.product_id": pid,
	}
	if len(dateFilter) > 0 {
		purchaseFilter["created_at"] = dateFilter
	}

	matchPurchase := bson.D{{Key: "$match", Value: purchaseFilter}}
	unwindLines  := bson.D{{Key: "$unwind", Value: "$lines"}}
	matchLine    := bson.D{{Key: "$match", Value: bson.M{"lines.product_id": pid}}}
	projectStage := bson.D{{Key: "$project", Value: bson.M{
		"date":          bson.M{"$ifNull": bson.A{"$validated_at", "$created_at"}},
		"type":          bson.M{"$literal": "purchase"},
		"qty":           "$lines.qty",
		"prix_achat":    "$lines.prix_achat",
		"reference":     bson.M{"$toString": "$_id"},
		"supplier_name": "$supplier_name",
	}}}

	cursor, err := database.Col("purchases").Aggregate(ctx, mongo.Pipeline{
		matchPurchase, unwindLines, matchLine, projectStage,
	})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var allItems []Movement
	if err = cursor.All(ctx, &allItems); err != nil {
		return nil, err
	}

	// ── 2. Loss movements ─────────────────────────────────────────────────────
	lossFilter := bson.M{
		"tenant_id":  tenantID, // stored as string in stock_losses
		"product_id": pid,
	}
	if len(dateFilter) > 0 {
		lossFilter["created_at"] = dateFilter
	}

	lossCur, err := database.Col("stock_losses").Find(ctx, lossFilter)
	if err != nil {
		return nil, err
	}
	defer lossCur.Close(ctx)

	type lossDoc struct {
		Type      string    `bson:"type"`
		Qty       int       `bson:"qty"`
		Remark    string    `bson:"remark"`
		CreatedAt time.Time `bson:"created_at"`
	}
	var losses []lossDoc
	lossCur.All(ctx, &losses)

	for _, l := range losses {
		allItems = append(allItems, Movement{
			Date:         l.CreatedAt,
			Type:         "loss",
			Qty:          -float64(l.Qty), // negative = stock reduction
			PrixAchat:    0,
			Reference:    l.Type,
			SupplierName: l.Remark,
		})
	}

	// ── 3. Sale movements ─────────────────────────────────────────────────────
	saleFilter := bson.M{
		"tenant_id":        tenantID,
		"lines.product_id": pid,
	}
	if len(dateFilter) > 0 {
		saleFilter["created_at"] = dateFilter
	}
	salePipeline := mongo.Pipeline{
		bson.D{{Key: "$match", Value: saleFilter}},
		bson.D{{Key: "$unwind", Value: "$lines"}},
		bson.D{{Key: "$match", Value: bson.M{"lines.product_id": pid}}},
		bson.D{{Key: "$project", Value: bson.M{
			"date":          "$created_at",
			"type":          bson.M{"$literal": "sale"},
			"qty":           bson.M{"$multiply": bson.A{"$lines.qty", -1}},
			"prix_achat":    "$lines.unit_price",
			"reference":     bson.M{"$toString": "$_id"},
			"supplier_name": bson.M{"$literal": ""},
		}}},
	}
	saleCur, err := database.Col("sales").Aggregate(ctx, salePipeline)
	if err == nil {
		defer saleCur.Close(ctx)
		var saleMovs []Movement
		saleCur.All(ctx, &saleMovs)
		allItems = append(allItems, saleMovs...)
	}

	// ── 4. Adjustment movements ─────────────────────────────────────────────
	adjFilter := bson.M{
		"tenant_id":  tenantID, // stored as string
		"product_id": pid,
	}
	if len(dateFilter) > 0 {
		adjFilter["created_at"] = dateFilter
	}
	adjCur, adjErr := database.Col("stock_adjustments").Find(ctx, adjFilter)
	if adjErr == nil {
		defer adjCur.Close(ctx)
		type adjDoc struct {
			QtyBefore float64   `bson:"qty_before"`
			QtyAfter  float64   `bson:"qty_after"`
			Reason    string    `bson:"reason"`
			CreatedAt time.Time `bson:"created_at"`
		}
		var adjs []adjDoc
		adjCur.All(ctx, &adjs)
		for _, a := range adjs {
			allItems = append(allItems, Movement{
				Date:         a.CreatedAt,
				Type:         "adjustment",
				Qty:          a.QtyAfter - a.QtyBefore,
				Reference:    a.Reason,
			})
		}
	}

	// ── 5. Sale return movements ─────────────────────────────────────────────
	retFilter := bson.M{
		"tenant_id":        tenantID,
		"lines.product_id": pid,
	}
	if len(dateFilter) > 0 {
		retFilter["created_at"] = dateFilter
	}
	retPipeline := mongo.Pipeline{
		bson.D{{Key: "$match", Value: retFilter}},
		bson.D{{Key: "$unwind", Value: "$lines"}},
		bson.D{{Key: "$match", Value: bson.M{"lines.product_id": pid}}},
		bson.D{{Key: "$project", Value: bson.M{
			"date":          "$created_at",
			"type":          bson.M{"$literal": "sale_return"},
			"qty":           "$lines.qty",
			"prix_achat":    "$lines.prix_achat",
			"reference":     "$ref",
			"supplier_name": bson.M{"$literal": ""},
		}}},
	}
	retCur, retErr := database.Col("sale_returns").Aggregate(ctx, retPipeline)
	if retErr == nil {
		defer retCur.Close(ctx)
		var retMovs []Movement
		retCur.All(ctx, &retMovs)
		allItems = append(allItems, retMovs...)
	}

	// ── 6. Sort by date desc, paginate in Go ──────────────────────────────────
	sort.Slice(allItems, func(i, j int) bool {
		return allItems[i].Date.After(allItems[j].Date)
	})

	total := int64(len(allItems))
	start := (page - 1) * limit
	if start > len(allItems) {
		start = len(allItems)
	}
	end := start + limit
	if end > len(allItems) {
		end = len(allItems)
	}

	pages := int(math.Ceil(float64(total) / float64(limit)))
	if pages == 0 {
		pages = 1
	}
	return &MovementsResult{Items: allItems[start:end], Total: total, Page: page, Limit: limit, Pages: pages}, nil
}

// LowStockResult holds paginated low-stock products.
type LowStockResult = ListResult

// ListLowStock returns paginated products where qty_available <= qty_min.
func ListLowStock(tenantID, query string, page, limit int) (*ListResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	limit = clampLimit(limit)
	if page < 1 {
		page = 1
	}

	filter := bson.M{
		"tenant_id":  tid,
		"is_service": bson.M{"$ne": true},
		"qty_min":    bson.M{"$gt": 0},
		"archived":   bson.M{"$ne": true},
		"$expr":      bson.M{"$lte": bson.A{"$qty_available", "$qty_min"}},
	}

	if query != "" {
		terms := strings.Fields(query)
		andClauses := make(bson.A, len(terms))
		for i, term := range terms {
			re := bson.M{"$regex": term, "$options": "i"}
			andClauses[i] = bson.M{"$or": bson.A{
				bson.M{"name": re},
				bson.M{"barcodes": re},
				bson.M{"ref": re},
			}}
		}
		filter["$and"] = andClauses
	}

	total, _ := col().CountDocuments(ctx, filter)
	skip := int64((page - 1) * limit)

	cursor, err := col().Find(ctx, filter,
		options.Find().
			SetSort(bson.M{"qty_available": 1}).
			SetSkip(skip).
			SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	items := []Product{}
	cursor.All(ctx, &items)

	pages := int(math.Ceil(float64(total) / float64(limit)))
	if pages == 0 {
		pages = 1
	}
	return &ListResult{Items: items, Total: total, Page: page, Limit: limit, Pages: pages}, nil
}

// ExportCSV generates a CSV export of all products for a tenant.
func ExportCSV(tenantID string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	tid, _ := primitive.ObjectIDFromHex(tenantID)

	cur, err := col().Find(ctx, bson.M{"tenant_id": tid, "archived": bson.M{"$ne": true}},
		options.Find().SetSort(bson.M{"name": 1}),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var products []Product
	cur.All(ctx, &products)

	var buf strings.Builder
	buf.WriteString("Name,Barcode,Ref,QtyAvailable,QtyMin,PrixAchat,PrixVente1,PrixVente2,PrixVente3,VAT,IsService\n")
	for _, p := range products {
		barcode := ""
		if len(p.Barcodes) > 0 {
			barcode = p.Barcodes[0]
		}
		line := strings.Join([]string{
			p.Name, barcode, p.Ref,
			formatFloat(p.QtyAvailable), formatFloat(p.QtyMin),
			formatFloat(p.PrixAchat), formatFloat(p.PrixVente1),
			formatFloat(p.PrixVente2), formatFloat(p.PrixVente3),
			formatInt(p.VAT), formatBool(p.IsService),
		}, ",")
		buf.WriteString(line + "\n")
	}
	return []byte(buf.String()), nil
}

func formatFloat(f float64) string {
	return strings.TrimRight(strings.TrimRight(
		strings.Replace(
			strings.Replace(
				strings.Replace(
					fmt.Sprintf("%.2f", f), ",", "", -1,
				), ".", ",", 1,
			), ",00", "", 1,
		), "0",
	), ",")
}

func formatInt(i int) string  { return fmt.Sprintf("%d", i) }
func formatBool(b bool) string {
	if b { return "true" }
	return "false"
}

// GetValuation returns total stock value for a tenant.
func GetValuation(tenantID string) (*ValuationResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	tid, _ := primitive.ObjectIDFromHex(tenantID)

	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"tenant_id":  tid,
			"is_service": bson.M{"$ne": true},
			"archived":   bson.M{"$ne": true},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id":       nil,
			"total_value": bson.M{"$sum": bson.M{"$multiply": bson.A{"$qty_available", "$prix_achat"}}},
			"total_qty":   bson.M{"$sum": "$qty_available"},
			"count":       bson.M{"$sum": 1},
		}}},
	}

	cur, err := col().Aggregate(ctx, pipeline)
	if err != nil {
		return &ValuationResult{}, nil
	}
	defer cur.Close(ctx)

	var agg []struct {
		TotalValue float64 `bson:"total_value"`
		TotalQty   float64 `bson:"total_qty"`
		Count      int64   `bson:"count"`
	}
	cur.All(ctx, &agg)

	result := &ValuationResult{}
	if len(agg) > 0 {
		result.TotalValue = math.Round(agg[0].TotalValue*100) / 100
		result.TotalQty = agg[0].TotalQty
		result.ProductCount = agg[0].Count
	}
	return result, nil
}

// Archive soft-deletes a product.
func Archive(tenantID, id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid id")
	}
	now := time.Now()
	res, err := col().UpdateOne(ctx, bson.M{"_id": oid, "tenant_id": tid},
		bson.M{"$set": bson.M{"archived": true, "archived_at": now, "updated_at": now}},
	)
	if err != nil { return err }
	if res.MatchedCount == 0 { return errors.New("product not found") }
	return nil
}

// Unarchive restores a soft-deleted product.
func Unarchive(tenantID, id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid id")
	}
	res, err := col().UpdateOne(ctx, bson.M{"_id": oid, "tenant_id": tid},
		bson.M{"$set": bson.M{"archived": false, "updated_at": time.Now()}, "$unset": bson.M{"archived_at": ""}},
	)
	if err != nil { return err }
	if res.MatchedCount == 0 { return errors.New("product not found") }
	return nil
}

// ListArchived returns only archived products.
func ListArchived(tenantID string, query string, page, limit int) (*ListResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	limit = clampLimit(limit)
	if page < 1 { page = 1 }
	skip := int64((page - 1) * limit)

	filter := bson.M{"tenant_id": tid, "archived": true}
	if query != "" {
		re := bson.M{"$regex": query, "$options": "i"}
		filter["$or"] = bson.A{bson.M{"name": re}, bson.M{"barcodes": re}}
	}

	total, _ := col().CountDocuments(ctx, filter)
	cursor, err := col().Find(ctx, filter,
		options.Find().SetSort(bson.M{"created_at": -1}).SetSkip(skip).SetLimit(int64(limit)),
	)
	if err != nil { return nil, err }
	defer cursor.Close(ctx)

	items := []Product{}
	cursor.All(ctx, &items)
	pages := int(math.Ceil(float64(total) / float64(limit)))
	if pages == 0 { pages = 1 }
	return &ListResult{Items: items, Total: total, Page: page, Limit: limit, Pages: pages}, nil
}

// Duplicate copies a product with a new name and empty barcodes.
func Duplicate(tenantID, id string) (*Product, error) {
	p, err := GetByID(tenantID, id)
	if err != nil { return nil, err }

	input := CreateInput{
		Name:         p.Name + " (copy)",
		Barcodes:     []string{},
		CategoryID:   p.CategoryID.Hex(),
		BrandID:      p.BrandID.Hex(),
		UnitID:       p.UnitID.Hex(),
		Ref:          p.Ref,
		Abbreviation: p.Abbreviation,
		QtyAvailable: 0,
		QtyMin:       p.QtyMin,
		PrixAchat:    p.PrixAchat,
		PrixVente1:   p.PrixVente1,
		PrixVente2:   p.PrixVente2,
		PrixVente3:   p.PrixVente3,
		PrixMinimum:  p.PrixMinimum,
		VAT:          p.VAT,
		IsService:    p.IsService,
		ImageURL:     p.ImageURL,
	}
	return Create(tenantID, input)
}

// BulkImport creates or updates products in bulk for a tenant.
// conflictMode: "skip" = ignore existing barcodes, "update" = overwrite fields.
func BulkImport(tenantID string, rows []BulkImportRow, conflictMode string) (*BulkImportResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	if len(rows) == 0 {
		return &BulkImportResult{}, nil
	}

	// Collect all barcodes from input and deduplicate rows (last wins).
	seen := map[string]int{}
	for i, r := range rows {
		seen[r.Barcode] = i
	}

	allBarcodes := make([]string, 0, len(seen))
	for bc := range seen {
		allBarcodes = append(allBarcodes, bc)
	}

	// Fetch existing products by barcode for this tenant in one query.
	existingMap := map[string]primitive.ObjectID{} // barcode → product _id
	cursor, err := col().Find(ctx, bson.M{
		"tenant_id": tid,
		"barcodes":  bson.M{"$in": allBarcodes},
	})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var existing []Product
	cursor.All(ctx, &existing)
	for _, p := range existing {
		for _, bc := range p.Barcodes {
			existingMap[bc] = p.ID
		}
	}

	// Build bulk write operations.
	var ops []mongo.WriteModel
	result := &BulkImportResult{}
	now := time.Now()

	processed := map[string]bool{}
	for _, idx := range seen {
		r := rows[idx]
		if processed[r.Barcode] {
			continue
		}
		processed[r.Barcode] = true

		if pid, exists := existingMap[r.Barcode]; exists {
			if conflictMode == "skip" {
				result.Skipped++
				continue
			}
			// Update existing product.
			ops = append(ops, mongo.NewUpdateOneModel().
				SetFilter(bson.M{"_id": pid, "tenant_id": tid}).
				SetUpdate(bson.M{"$set": bson.M{
					"name":          r.Name,
					"qty_available": r.Qty,
					"prix_achat":    r.PrixAchat,
					"prix_vente_1":  r.PrixVente1,
					"prix_vente_2":  r.PrixVente2,
					"prix_vente_3":  r.PrixVente3,
					"updated_at":    now,
				}}),
			)
			result.Updated++
		} else {
			// Insert new product.
			ops = append(ops, mongo.NewInsertOneModel().SetDocument(Product{
				ID:           primitive.NewObjectID(),
				TenantID:     tid,
				Name:         r.Name,
				Barcodes:     []string{r.Barcode},
				QtyAvailable: r.Qty,
				PrixAchat:    r.PrixAchat,
				PrixVente1:   r.PrixVente1,
				PrixVente2:   r.PrixVente2,
				PrixVente3:   r.PrixVente3,
				CreatedAt:    now,
				UpdatedAt:    now,
			}))
			result.Imported++
		}
	}

	if len(ops) > 0 {
		_, err = col().BulkWrite(ctx, ops, options.BulkWrite().SetOrdered(false))
		if err != nil {
			return nil, err
		}
	}

	return result, nil
}

// GetByIDs fetches multiple products by their IDs for a tenant.
func GetByIDs(tenantID string, ids []primitive.ObjectID) ([]Product, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	if len(ids) == 0 {
		return []Product{}, nil
	}

	cursor, err := col().Find(ctx, bson.M{
		"_id":       bson.M{"$in": ids},
		"tenant_id": tid,
	})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var products []Product
	if err = cursor.All(ctx, &products); err != nil {
		return nil, err
	}
	return products, nil
}

func Delete(tenantID, id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, _ := primitive.ObjectIDFromHex(tenantID)
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid id")
	}

	res, err := col().DeleteOne(ctx, bson.M{"_id": oid, "tenant_id": tid})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return errors.New("product not found")
	}
	return nil
}
