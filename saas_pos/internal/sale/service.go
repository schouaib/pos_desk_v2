package sale

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"saas_pos/internal/batch"
	"saas_pos/internal/caisse"
	"saas_pos/internal/client"
	"saas_pos/internal/counter"
	"saas_pos/internal/database"
	"saas_pos/internal/retrait"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func col() *mongo.Collection     { return database.Col("sales") }
func productCol() *mongo.Collection { return database.Col("products") }

// Create records a completed sale. Lines with negative qty represent returns
// (e.g. qty=-1 means the customer returned 1 unit). Negative qty lines produce
// negative totals and increment stock back.
func Create(tenantID, cashierID, cashierEmail string, input CreateInput) (*Sale, error) {
	if len(input.Lines) == 0 {
		return nil, errors.New("sale must have at least one line")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Enforce monthly sales limit
	if tid, err := primitive.ObjectIDFromHex(tenantID); err == nil {
		var tenantLimits struct {
			MaxSalesMonth int `bson:"max_sales_month"`
		}
		if err2 := database.Col("tenants").FindOne(ctx, bson.M{"_id": tid}).Decode(&tenantLimits); err2 == nil {
			if tenantLimits.MaxSalesMonth > 0 {
				now := time.Now()
				startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
				count, _ := col().CountDocuments(ctx, bson.M{
					"tenant_id":  tenantID,
					"created_at": bson.M{"$gte": startOfMonth},
				})
				if count >= int64(tenantLimits.MaxSalesMonth) {
					return nil, errors.New("monthly sales limit reached for your plan")
				}
			}
		}
	}

	var lines []SaleLine
	var totalHT, totalVAT, totalEarning float64

	for _, li := range input.Lines {
		if li.Qty == 0 {
			return nil, errors.New("qty must not be zero")
		}
		if li.UnitPrice < 0 {
			return nil, errors.New("unit_price must be non-negative")
		}

		pid, err := primitive.ObjectIDFromHex(li.ProductID)
		if err != nil {
			return nil, errors.New("invalid product_id: " + li.ProductID)
		}

		// Verify product belongs to this tenant and get denormalized fields.
		type bundleItemDoc struct {
			ProductID primitive.ObjectID `bson:"product_id"`
			Qty       float64            `bson:"qty"`
		}
		var p struct {
			Name        string          `bson:"name"`
			Barcodes    []string        `bson:"barcodes"`
			Ref         string          `bson:"ref"`
			VAT         int             `bson:"vat"`
			IsService   bool            `bson:"is_service"`
			PrixAchat   float64         `bson:"prix_achat"`
			IsBundle    bool            `bson:"is_bundle"`
			BundleItems []bundleItemDoc `bson:"bundle_items"`
		}
		err = productCol().FindOne(ctx, bson.M{
			"_id":       pid,
			"tenant_id": bson.M{"$in": bson.A{
				tenantID,
				func() primitive.ObjectID { id, _ := primitive.ObjectIDFromHex(tenantID); return id }(),
			}},
		}).Decode(&p)
		if err != nil {
			return nil, errors.New("product not found: " + li.ProductID)
		}

		barcode := ""
		if len(p.Barcodes) > 0 {
			barcode = p.Barcodes[0]
		}

		discount := li.Discount
		if discount < 0 {
			discount = 0
		}

		// qty can be negative (return). Negative qty → negative lineHT/TTC.
		lineHT := li.Qty*li.UnitPrice - discount
		vatAmt := lineHT * float64(p.VAT) / 100
		lineTTC := lineHT + vatAmt
		lineEarning := lineHT - li.Qty*p.PrixAchat

		totalHT += lineHT
		totalVAT += vatAmt
		totalEarning += lineEarning

		lines = append(lines, SaleLine{
			ProductID:   pid,
			ProductName: p.Name,
			Barcode:     barcode,
			Ref:         p.Ref,
			Qty:         li.Qty,
			UnitPrice:   li.UnitPrice,
			PrixAchat:   p.PrixAchat,
			Discount:    discount,
			VAT:         p.VAT,
			TotalHT:     math.Round(lineHT*100) / 100,
			TotalTTC:    math.Round(lineTTC*100) / 100,
			LineEarning: math.Round(lineEarning*100) / 100,
		})

		// Adjust stock for physical products: decrement for sales, increment for returns.
		if !p.IsService {
			if p.IsBundle && len(p.BundleItems) > 0 {
				// Bundle: decrement each component product's stock
				for _, bi := range p.BundleItems {
					productCol().UpdateOne(ctx,
						bson.M{"_id": bi.ProductID},
						bson.M{"$inc": bson.M{"qty_available": -(li.Qty * bi.Qty)}},
					)
					// FIFO batch decrement for components
					if li.Qty > 0 {
						batch.DecrementFIFO(tenantID, bi.ProductID, li.Qty*bi.Qty)
					}
				}
			} else {
				productCol().UpdateOne(ctx,
					bson.M{"_id": pid},
					bson.M{"$inc": bson.M{"qty_available": -li.Qty}},
				)
				// FIFO batch decrement
				if li.Qty > 0 {
					batch.DecrementFIFO(tenantID, pid, li.Qty)
				}
			}
		}
	}

	totalHT = math.Round(totalHT*100) / 100
	totalVAT = math.Round(totalVAT*100) / 100
	totalTTC := math.Round((totalHT+totalVAT)*100) / 100
	totalEarning = math.Round(totalEarning*100) / 100

	change := math.Round((input.AmountPaid-totalTTC)*100) / 100

	seq, _ := counter.Next(tenantID, "sale")
	ref := fmt.Sprintf("VTE-%06d", seq)

	saleType := input.SaleType
	if saleType != "credit" {
		saleType = "cash"
	}

	// Resolve client if provided
	var clientID, clientName string
	if input.ClientID != "" {
		cl, err := client.GetByID(tenantID, input.ClientID)
		if err != nil {
			return nil, errors.New("client not found: " + input.ClientID)
		}
		clientID = cl.ID.Hex()
		clientName = cl.Name
	} else {
		// credit sale requires a client
		if saleType == "credit" {
			return nil, errors.New("credit sale requires a client")
		}
	}

	sale := &Sale{
		ID:            primitive.NewObjectID(),
		Ref:           ref,
		TenantID:      tenantID,
		Lines:         lines,
		TotalHT:       totalHT,
		TotalVAT:      totalVAT,
		Total:         totalTTC,
		TotalEarning:  totalEarning,
		PaymentMethod: input.PaymentMethod,
		AmountPaid:    input.AmountPaid,
		Change:        change,
		ClientID:      clientID,
		ClientName:    clientName,
		SaleType:      saleType,
		CashierID:     cashierID,
		CashierEmail:  cashierEmail,
		CreatedAt:     time.Now(),
	}

	_, err := col().InsertOne(ctx, sale)
	if err != nil {
		return nil, err
	}

	// For credit sales, increase the client's outstanding balance by the total amount
	if saleType == "credit" && clientID != "" {
		_ = client.AdjustBalance(tenantID, clientID, totalTTC)
	}

	return sale, nil
}

// List returns paginated sales for a tenant, filtered by date range.
func List(tenantID string, from, to time.Time, page, limit int) (*ListResult, error) {
	if limit <= 0 || limit > 10 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"tenant_id":  tenantID,
		"created_at": bson.M{"$gte": from, "$lte": to},
	}

	total, _ := col().CountDocuments(ctx, filter)
	skip := int64((page - 1) * limit)
	opts := options.Find().
		SetSort(bson.M{"created_at": -1}).
		SetSkip(skip).
		SetLimit(int64(limit))

	cur, err := col().Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var items []Sale
	cur.All(ctx, &items)
	if items == nil {
		items = []Sale{}
	}
	return &ListResult{Items: items, Total: total}, nil
}

// ListByClient returns paginated sales for a specific client, filtered by date range.
func ListByClient(tenantID, clientID string, from, to time.Time, page, limit int) (*ListResult, error) {
	if limit <= 0 || limit > 10 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"tenant_id":  tenantID,
		"client_id":  clientID,
		"created_at": bson.M{"$gte": from, "$lte": to},
	}
	total, _ := col().CountDocuments(ctx, filter)
	skip := int64((page - 1) * limit)
	opts := options.Find().
		SetSort(bson.M{"created_at": -1}).
		SetSkip(skip).
		SetLimit(int64(limit))

	cur, err := col().Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var items []Sale
	cur.All(ctx, &items)
	if items == nil {
		items = []Sale{}
	}
	return &ListResult{Items: items, Total: total}, nil
}

// Stats returns aggregated revenue and earning metrics for a tenant over a date range.
func Stats(tenantID string, from, to time.Time) (*StatsResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"tenant_id":  tenantID,
		"created_at": bson.M{"$gte": from, "$lte": to},
	}
	count, _ := col().CountDocuments(ctx, filter)

	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: filter}},
		{{Key: "$group", Value: bson.M{
			"_id":           nil,
			"total_revenue": bson.M{"$sum": "$total"},
			"total_earning": bson.M{"$sum": "$total_earning"},
		}}},
	}

	cur, err := col().Aggregate(ctx, pipeline)
	if err != nil {
		return &StatsResult{Count: count}, nil
	}
	defer cur.Close(ctx)

	var agg []struct {
		TotalRevenue float64 `bson:"total_revenue"`
		TotalEarning float64 `bson:"total_earning"`
	}
	cur.All(ctx, &agg)

	result := &StatsResult{Count: count}
	if len(agg) > 0 {
		result.TotalRevenue = math.Round(agg[0].TotalRevenue*100) / 100
		result.TotalEarning = math.Round(agg[0].TotalEarning*100) / 100
	}
	return result, nil
}

// SalesStatistics returns full profitability metrics for a tenant over a date range.
// When includeLosses is true, the purchase cost of stock losses in the same period is
// looked up from the stock_losses + products collections and subtracted for net_earning.
func SalesStatistics(tenantID string, from, to time.Time, includeLosses bool) (*SalesStatisticsResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	filter := bson.M{
		"tenant_id":  tenantID,
		"created_at": bson.M{"$gte": from, "$lte": to},
	}

	count, _ := col().CountDocuments(ctx, filter)

	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: filter}},
		{{Key: "$group", Value: bson.M{
			"_id":           nil,
			"revenue_ttc":   bson.M{"$sum": "$total"},
			"revenue_ht":    bson.M{"$sum": "$total_ht"},
			"total_vat":     bson.M{"$sum": "$total_vat"},
			"gross_earning": bson.M{"$sum": "$total_earning"},
			"cash_revenue_ttc": bson.M{"$sum": bson.M{
				"$cond": bson.A{bson.M{"$eq": bson.A{"$sale_type", "cash"}}, "$total", 0},
			}},
			"credit_revenue_ttc": bson.M{"$sum": bson.M{
				"$cond": bson.A{bson.M{"$eq": bson.A{"$sale_type", "credit"}}, "$total", 0},
			}},
		}}},
	}

	cur, err := col().Aggregate(ctx, pipeline)
	if err != nil {
		return &SalesStatisticsResult{SalesCount: count}, nil
	}
	defer cur.Close(ctx)

	var agg []struct {
		RevenueTTC       float64 `bson:"revenue_ttc"`
		RevenueHT        float64 `bson:"revenue_ht"`
		TotalVAT         float64 `bson:"total_vat"`
		GrossEarning     float64 `bson:"gross_earning"`
		CashRevenueTTC   float64 `bson:"cash_revenue_ttc"`
		CreditRevenueTTC float64 `bson:"credit_revenue_ttc"`
	}
	cur.All(ctx, &agg)

	res := &SalesStatisticsResult{SalesCount: count}
	if len(agg) > 0 {
		res.RevenueTTC        = math.Round(agg[0].RevenueTTC*100) / 100
		res.RevenueHT         = math.Round(agg[0].RevenueHT*100) / 100
		res.TotalVAT          = math.Round(agg[0].TotalVAT*100) / 100
		res.GrossEarning      = math.Round(agg[0].GrossEarning*100) / 100
		res.TotalCost         = math.Round((agg[0].RevenueHT-agg[0].GrossEarning)*100) / 100
		res.CashRevenueTTC    = math.Round(agg[0].CashRevenueTTC*100) / 100
		res.CreditRevenueTTC  = math.Round(agg[0].CreditRevenueTTC*100) / 100
	}

	if includeLosses {
		lossPipeline := mongo.Pipeline{
			{{Key: "$match", Value: bson.M{
				"tenant_id":  tenantID,
				"created_at": bson.M{"$gte": from, "$lte": to},
			}}},
			{{Key: "$lookup", Value: bson.M{
				"from":         "products",
				"localField":   "product_id",
				"foreignField": "_id",
				"as":           "product",
			}}},
			{{Key: "$unwind", Value: bson.M{"path": "$product", "preserveNullAndEmptyArrays": true}}},
			{{Key: "$group", Value: bson.M{
				"_id": nil,
				"loss_cost": bson.M{"$sum": bson.M{"$multiply": bson.A{
					bson.M{"$toDouble": "$qty"},
					bson.M{"$ifNull": bson.A{"$product.prix_achat", 0}},
				}}},
			}}},
		}
		lossCur, lerr := database.Col("stock_losses").Aggregate(ctx, lossPipeline)
		if lerr == nil {
			defer lossCur.Close(ctx)
			var lossAgg []struct{ LossCost float64 `bson:"loss_cost"` }
			lossCur.All(ctx, &lossAgg)
			if len(lossAgg) > 0 {
				res.LossCost = math.Round(lossAgg[0].LossCost*100) / 100
			}
		}
	}

	res.NetEarning = math.Round((res.GrossEarning-res.LossCost)*100) / 100
	return res, nil
}

// UserSummary aggregates sales, returns and retraits per user for a date range.
// If userID is non-empty, only that user's data is included.
func UserSummary(tenantID string, from, to time.Time, userID string) (*UserSummaryResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	filter := bson.M{
		"tenant_id":  tenantID,
		"created_at": bson.M{"$gte": from, "$lte": to},
	}
	if userID != "" {
		filter["cashier_id"] = userID
	}

	// Aggregate sales per cashier, splitting positive (sales) and negative (returns).
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: filter}},
		{{Key: "$group", Value: bson.M{
			"_id":           "$cashier_id",
			"user_email":    bson.M{"$first": "$cashier_email"},
			"sales_count":   bson.M{"$sum": bson.M{"$cond": bson.A{bson.M{"$gte": bson.A{"$total", 0}}, 1, 0}}},
			"sales_total":   bson.M{"$sum": bson.M{"$cond": bson.A{bson.M{"$gte": bson.A{"$total", 0}}, "$total", 0}}},
			"returns_count": bson.M{"$sum": bson.M{"$cond": bson.A{bson.M{"$lt": bson.A{"$total", 0}}, 1, 0}}},
			"returns_total": bson.M{"$sum": bson.M{"$cond": bson.A{bson.M{"$lt": bson.A{"$total", 0}}, "$total", 0}}},
		}}},
		{{Key: "$sort", Value: bson.M{"sales_total": -1}}},
	}

	cur, err := col().Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	type saleAgg struct {
		UserID       string  `bson:"_id"`
		UserEmail    string  `bson:"user_email"`
		SalesCount   int64   `bson:"sales_count"`
		SalesTotal   float64 `bson:"sales_total"`
		ReturnsCount int64   `bson:"returns_count"`
		ReturnsTotal float64 `bson:"returns_total"`
	}
	var rows []saleAgg
	cur.All(ctx, &rows)

	// Build a map of user_id → retraits total
	retraitsByUser, _ := retrait.SumByUser(tenantID, from, to, userID)

	// Build a map of user_id → caisse opening amounts
	caisseByUser, _ := caisse.SumByUser(tenantID, from, to)

	// Collect all user IDs (from sales + retraits) to ensure users with only retraits appear.
	userMap := make(map[string]*UserSummaryLine)
	for _, r := range rows {
		rt := math.Abs(math.Round(r.ReturnsTotal*100) / 100)
		st := math.Round(r.SalesTotal*100) / 100
		userMap[r.UserID] = &UserSummaryLine{
			UserID:       r.UserID,
			UserEmail:    r.UserEmail,
			SalesCount:   r.SalesCount,
			SalesTotal:   st,
			ReturnsCount: r.ReturnsCount,
			ReturnsTotal: rt,
		}
	}

	for uid, rSum := range retraitsByUser {
		if u, ok := userMap[uid]; ok {
			u.RetraitsTotal = rSum.Total
			u.UserEmail = rSum.Email // ensure email is set
		} else {
			userMap[uid] = &UserSummaryLine{
				UserID:        uid,
				UserEmail:     rSum.Email,
				RetraitsTotal: rSum.Total,
			}
		}
	}

	// Merge caisse opening/closing amounts
	for uid, cs := range caisseByUser {
		if u, ok := userMap[uid]; ok {
			u.OpeningAmount = cs.OpeningAmount
			u.ClosingAmount = cs.ClosingAmount
		} else {
			userMap[uid] = &UserSummaryLine{
				UserID:        uid,
				UserEmail:     cs.Email,
				OpeningAmount: cs.OpeningAmount,
				ClosingAmount: cs.ClosingAmount,
			}
		}
	}

	// Compute net, ecart and grand totals
	var users []UserSummaryLine
	var grandSales, grandReturns, grandRetraits, grandOpening, grandClosing, grandEcart float64
	for _, u := range userMap {
		u.Net = math.Round((u.SalesTotal-u.ReturnsTotal-u.RetraitsTotal)*100) / 100
		// ecart = closing_amount - expected (opening + cash_sales - returns - retraits)
		expected := u.OpeningAmount + u.SalesTotal - u.ReturnsTotal - u.RetraitsTotal
		u.Ecart = math.Round((u.ClosingAmount-expected)*100) / 100
		grandSales += u.SalesTotal
		grandReturns += u.ReturnsTotal
		grandRetraits += u.RetraitsTotal
		grandOpening += u.OpeningAmount
		grandClosing += u.ClosingAmount
		grandEcart += u.Ecart
		users = append(users, *u)
	}
	if users == nil {
		users = []UserSummaryLine{}
	}

	return &UserSummaryResult{
		Users:         users,
		GrandSales:    math.Round(grandSales*100) / 100,
		GrandReturns:  math.Round(grandReturns*100) / 100,
		GrandRetraits: math.Round(grandRetraits*100) / 100,
		GrandOpening:  math.Round(grandOpening*100) / 100,
		GrandClosing:  math.Round(grandClosing*100) / 100,
		GrandEcart:    math.Round(grandEcart*100) / 100,
		GrandNet:      math.Round((grandSales-grandReturns-grandRetraits)*100) / 100,
	}, nil
}
