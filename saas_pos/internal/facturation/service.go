package facturation

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"saas_pos/internal/client"
	"saas_pos/internal/counter"
	"saas_pos/internal/database"
	"saas_pos/internal/sale"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func col() *mongo.Collection     { return database.Col("facturation_docs") }
func productCol() *mongo.Collection { return database.Col("products") }
func clientCol() *mongo.Collection  { return database.Col("clients") }

// refPrefix returns the prefix for document references.
func refPrefix(docType string) string {
	switch docType {
	case DocBC:
		return "BC"
	case DocDevis:
		return "DV"
	case DocFacture:
		return "FA"
	case DocAvoir:
		return "AV"
	}
	return "DOC"
}

// counterName returns the counter name per document type.
func counterName(docType string) string {
	return "facturation_" + docType
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// buildLines resolves product info and computes line totals.
func buildLines(tenantID string, inputs []LineInput, applyVAT bool) ([]DocLine, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	lines := make([]DocLine, 0, len(inputs))
	for _, li := range inputs {
		if li.Qty <= 0 {
			return nil, errors.New("qty must be positive")
		}
		if li.UnitPrice < 0 {
			return nil, errors.New("unit_price must be non-negative")
		}
		pid, err := primitive.ObjectIDFromHex(li.ProductID)
		if err != nil {
			return nil, errors.New("invalid product_id: " + li.ProductID)
		}

		var p struct {
			Name string `bson:"name"`
			Ref  string `bson:"ref"`
			VAT  int    `bson:"vat"`
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

		totalHT := round2(li.Qty*li.UnitPrice - li.Discount)
		vatRate := p.VAT
		if !applyVAT {
			vatRate = 0
		}
		vatAmount := round2(totalHT * float64(vatRate) / 100)
		totalTTC := round2(totalHT + vatAmount)

		line := DocLine{
			ProductID:   pid,
			ProductName: p.Name,
			Ref:         p.Ref,
			Qty:         li.Qty,
			UnitPrice:   li.UnitPrice,
			Discount:    li.Discount,
			VAT:         p.VAT,
			TotalHT:     totalHT,
			TotalVAT:    vatAmount,
			TotalTTC:    totalTTC,
		}

		if li.VariantID != "" {
			vid, err := primitive.ObjectIDFromHex(li.VariantID)
			if err == nil {
				line.VariantID = &vid
			}
		}

		lines = append(lines, line)
	}
	return lines, nil
}

func sumTotals(lines []DocLine) (ht, vat, ttc float64) {
	for _, l := range lines {
		ht += l.TotalHT
		vat += l.TotalVAT
		ttc += l.TotalTTC
	}
	return round2(ht), round2(vat), round2(ttc)
}

// parseOptionalTime parses a date string or returns nil.
func parseOptionalTime(s string) *time.Time {
	if s == "" {
		return nil
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02"} {
		if t, err := time.Parse(layout, s); err == nil {
			return &t
		}
	}
	return nil
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

func Create(tenantID, userID, userEmail string, input CreateInput) (*Document, error) {
	if input.DocType != DocBC && input.DocType != DocDevis && input.DocType != DocFacture {
		return nil, errors.New("doc_type must be bc, devis, or facture")
	}
	if input.ClientID == "" {
		return nil, errors.New("client_id is required")
	}
	if len(input.Lines) == 0 {
		return nil, errors.New("at least one line is required")
	}

	// Resolve client name
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cid, err := primitive.ObjectIDFromHex(input.ClientID)
	if err != nil {
		return nil, errors.New("invalid client_id")
	}
	var cl struct {
		Name string `bson:"name"`
	}
	err = clientCol().FindOne(ctx, bson.M{"_id": cid, "tenant_id": bson.M{"$in": bson.A{
		tenantID,
		func() primitive.ObjectID { id, _ := primitive.ObjectIDFromHex(tenantID); return id }(),
	}}}).Decode(&cl)
	if err != nil {
		return nil, errors.New("client not found")
	}

	// Check tenant VAT settings — factures always get VAT when use_vat_sale is on
	applyVAT := false
	if tid, terr := primitive.ObjectIDFromHex(tenantID); terr == nil {
		var ts struct {
			UseVATSale bool `bson:"use_vat_sale"`
		}
		database.Col("tenants").FindOne(ctx, bson.M{"_id": tid}).Decode(&ts)
		applyVAT = ts.UseVATSale
	}

	lines, err := buildLines(tenantID, input.Lines, applyVAT)
	if err != nil {
		return nil, err
	}

	ht, vat, ttc := sumTotals(lines)

	// Generate sequential ref
	seq, err := counter.Next(tenantID, counterName(input.DocType))
	if err != nil {
		return nil, fmt.Errorf("counter error: %w", err)
	}
	ref := fmt.Sprintf("%s-%06d", refPrefix(input.DocType), seq)

	// Determine initial status
	status := StatusDraft
	if input.DocType == DocFacture {
		status = StatusUnpaid
	}

	// Payment method on facture — timbre is calculated at payment time, not creation
	payMethod := input.PaymentMethod
	if payMethod == "" && input.DocType == DocFacture {
		payMethod = "cash"
	}

	// Cash facture = paid immediately
	isCashPaid := input.DocType == DocFacture && payMethod == "cash"
	var paidAmount float64
	var timbre float64
	var payments []DocPayment
	if isCashPaid {
		status = StatusPaid
		paidAmount = ttc
		// Only calculate timbre if NOT linked to a sale (sale already records timbre)
		if input.SaleID == "" {
			timbre = sale.CalcTimbre(ttc, "cash")
		}
		payments = []DocPayment{{
			Amount:        ttc,
			PaymentMethod: "cash",
			Timbre:        timbre,
			Note:          "auto",
			CreatedAt:     time.Now(),
		}}
	}

	now := time.Now()
	doc := Document{
		ID:             primitive.NewObjectID(),
		Ref:            ref,
		TenantID:       tenantID,
		DocType:        input.DocType,
		Status:         status,
		ClientID:       input.ClientID,
		ClientName:     cl.Name,
		Lines:          lines,
		TotalHT:        ht,
		TotalVAT:       vat,
		Total:          ttc,
		PaymentMethod:  payMethod,
		PaidAmount:     paidAmount,
		Timbre:         timbre,
		Payments:       payments,
		ValidUntil:     parseOptionalTime(input.ValidUntil),
		DueDate:        parseOptionalTime(input.DueDate),
		PaymentTerms:   input.PaymentTerms,
		Note:           input.Note,
		SaleID:         input.SaleID,
		CreatedBy:      userID,
		CreatedByEmail: userEmail,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	// If created from a sale, look up sale ref
	if input.SaleID != "" {
		sid, err := primitive.ObjectIDFromHex(input.SaleID)
		if err == nil {
			var s struct {
				Ref string `bson:"ref"`
			}
			if database.Col("sales").FindOne(ctx, bson.M{"_id": sid, "tenant_id": tenantID}).Decode(&s) == nil {
				doc.SaleRef = s.Ref
			}
		}
	}

	_, err = col().InsertOne(ctx, doc)
	if err != nil {
		return nil, err
	}

	// Standalone facture (not linked to a sale):
	if input.SaleID == "" && input.ClientID != "" && input.DocType == DocFacture {
		if isCashPaid {
			// Cash facture: record payment for stats (no balance change — paid immediately)
			_ = client.RecordPayment(tenantID, input.ClientID, ttc, fmt.Sprintf("Facture %s", ref))
		} else {
			// Credit facture: increase client balance (they now owe this amount)
			_ = client.AdjustBalance(tenantID, input.ClientID, ttc)
		}
	}

	return &doc, nil
}

func Update(tenantID, id string, input UpdateInput) (*Document, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Only draft BC/devis can be edited
	var existing Document
	err = col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tenantID}).Decode(&existing)
	if err != nil {
		return nil, errors.New("document not found")
	}
	if existing.Status != StatusDraft {
		return nil, errors.New("only draft documents can be edited")
	}
	if existing.DocType == DocFacture || existing.DocType == DocAvoir {
		return nil, errors.New("factures and avoirs cannot be edited")
	}

	// Check tenant VAT settings
	applyVAT := false
	if tid, terr := primitive.ObjectIDFromHex(tenantID); terr == nil {
		var ts struct {
			UseVATSale bool `bson:"use_vat_sale"`
		}
		database.Col("tenants").FindOne(ctx, bson.M{"_id": tid}).Decode(&ts)
		applyVAT = ts.UseVATSale
	}

	lines, err := buildLines(tenantID, input.Lines, applyVAT)
	if err != nil {
		return nil, err
	}
	ht, vat, ttc := sumTotals(lines)

	// Resolve client name if changed
	clientName := existing.ClientName
	clientID := existing.ClientID
	if input.ClientID != "" && input.ClientID != existing.ClientID {
		cid, err := primitive.ObjectIDFromHex(input.ClientID)
		if err == nil {
			var cl struct {
				Name string `bson:"name"`
			}
			if clientCol().FindOne(ctx, bson.M{"_id": cid, "tenant_id": bson.M{"$in": bson.A{
				tenantID,
				func() primitive.ObjectID { id, _ := primitive.ObjectIDFromHex(tenantID); return id }(),
			}}}).Decode(&cl) == nil {
				clientName = cl.Name
				clientID = input.ClientID
			}
		}
	}

	set := bson.M{
		"client_id":     clientID,
		"client_name":   clientName,
		"lines":         lines,
		"total_ht":      ht,
		"total_vat":     vat,
		"total":         ttc,
		"valid_until":   parseOptionalTime(input.ValidUntil),
		"due_date":      parseOptionalTime(input.DueDate),
		"payment_terms": input.PaymentTerms,
		"note":          input.Note,
		"updated_at":    time.Now(),
	}

	after := options.After
	var updated Document
	err = col().FindOneAndUpdate(ctx,
		bson.M{"_id": oid, "tenant_id": tenantID},
		bson.M{"$set": set},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&updated)
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

func GetByID(tenantID, id string) (*Document, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var doc Document
	err = col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tenantID}).Decode(&doc)
	if err != nil {
		return nil, errors.New("document not found")
	}
	return &doc, nil
}

func List(tenantID, docType, status, clientID, q, dateFrom, dateTo string, page, limit int) (*ListResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{"tenant_id": tenantID}
	if docType != "" {
		filter["doc_type"] = docType
	}
	if status != "" {
		filter["status"] = status
	}
	if clientID != "" {
		filter["client_id"] = clientID
	}
	if q != "" {
		filter["$or"] = bson.A{
			bson.M{"ref": bson.M{"$regex": q, "$options": "i"}},
			bson.M{"client_name": bson.M{"$regex": q, "$options": "i"}},
		}
	}
	if dateFrom != "" || dateTo != "" {
		dateFilter := bson.M{}
		if dateFrom != "" {
			if t := parseOptionalTime(dateFrom); t != nil {
				dateFilter["$gte"] = *t
			}
		}
		if dateTo != "" {
			if t := parseOptionalTime(dateTo); t != nil {
				end := t.Add(24 * time.Hour)
				dateFilter["$lt"] = end
			}
		}
		if len(dateFilter) > 0 {
			filter["created_at"] = dateFilter
		}
	}

	total, err := col().CountDocuments(ctx, filter)
	if err != nil {
		return nil, err
	}

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	skip := int64((page - 1) * limit)
	pages := int((total + int64(limit) - 1) / int64(limit))

	opts := options.Find().
		SetSort(bson.M{"created_at": -1}).
		SetSkip(skip).
		SetLimit(int64(limit))

	cursor, err := col().Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var items []Document
	if err := cursor.All(ctx, &items); err != nil {
		return nil, err
	}
	if items == nil {
		items = []Document{}
	}

	return &ListResult{
		Items: items,
		Total: total,
		Page:  page,
		Limit: limit,
		Pages: pages,
	}, nil
}

func Delete(tenantID, id string) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return errors.New("invalid id")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Only drafts can be deleted
	res, err := col().DeleteOne(ctx, bson.M{
		"_id":       oid,
		"tenant_id": tenantID,
		"status":    StatusDraft,
	})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return errors.New("document not found or not in draft status")
	}
	return nil
}

// ── Convert: BC/Devis → Facture ──────────────────────────────────────────────

func Convert(tenantID, id, userID, userEmail string, input ConvertInput) (*Document, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	var parent Document
	err = col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tenantID}).Decode(&parent)
	if err != nil {
		return nil, errors.New("document not found")
	}

	// Validate parent type and status
	if parent.DocType == DocFacture || parent.DocType == DocAvoir {
		return nil, errors.New("cannot convert a facture or avoir")
	}
	if parent.DocType == DocDevis && parent.Status != StatusAccepted && parent.Status != StatusDraft {
		return nil, errors.New("devis must be in draft or accepted status to convert")
	}

	// 1. Create a sale from the document lines
	saleLines := make([]sale.SaleLineInput, 0, len(parent.Lines))
	for _, l := range parent.Lines {
		sl := sale.SaleLineInput{
			ProductID: l.ProductID.Hex(),
			Qty:       l.Qty,
			UnitPrice: l.UnitPrice,
			Discount:  l.Discount,
		}
		if l.VariantID != nil {
			sl.VariantID = l.VariantID.Hex()
		}
		saleLines = append(saleLines, sl)
	}

	saleType := "credit"
	if input.AmountPaid >= parent.Total {
		saleType = "cash"
	}
	payMethod := input.PaymentMethod
	if payMethod == "" {
		payMethod = "cash"
	}

	saleResult, err := sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines:         saleLines,
		PaymentMethod: payMethod,
		AmountPaid:    input.AmountPaid,
		ClientID:      parent.ClientID,
		SaleType:      saleType,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create sale: %w", err)
	}

	// 2. Generate facture ref
	seq, err := counter.Next(tenantID, counterName(DocFacture))
	if err != nil {
		return nil, fmt.Errorf("counter error: %w", err)
	}
	ref := fmt.Sprintf("%s-%06d", refPrefix(DocFacture), seq)

	// 3. Determine facture payment status
	factureStatus := StatusUnpaid
	paidAmount := 0.0
	if input.AmountPaid >= parent.Total {
		factureStatus = StatusPaid
		paidAmount = parent.Total
	} else if input.AmountPaid > 0 {
		factureStatus = StatusPartial
		paidAmount = input.AmountPaid
	}

	// Build initial payment record if paid
	var payments []DocPayment
	timbre := 0.0
	if paidAmount > 0 {
		payTimbre := sale.CalcTimbre(paidAmount, payMethod)
		timbre = payTimbre
		payments = append(payments, DocPayment{
			Amount:        paidAmount,
			PaymentMethod: payMethod,
			Timbre:        payTimbre,
			Note:          input.Note,
			CreatedAt:     time.Now(),
		})
	}

	now := time.Now()
	facture := Document{
		ID:             primitive.NewObjectID(),
		Ref:            ref,
		TenantID:       tenantID,
		DocType:        DocFacture,
		Status:         factureStatus,
		ClientID:       parent.ClientID,
		ClientName:     parent.ClientName,
		Lines:          parent.Lines,
		TotalHT:        parent.TotalHT,
		TotalVAT:       parent.TotalVAT,
		Total:          parent.Total,
		PaymentMethod:  payMethod,
		Timbre:         timbre,
		PaidAmount:     paidAmount,
		Payments:       payments,
		ParentID:       id,
		ParentRef:      parent.Ref,
		SaleID:         saleResult.ID.Hex(),
		SaleRef:        saleResult.Ref,
		DueDate:        parseOptionalTime(input.DueDate),
		PaymentTerms:   input.PaymentTerms,
		Note:           input.Note,
		CreatedBy:      userID,
		CreatedByEmail: userEmail,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	_, err = col().InsertOne(ctx, facture)
	if err != nil {
		return nil, err
	}

	// 4. Mark parent as accepted/converted
	col().UpdateOne(ctx,
		bson.M{"_id": oid},
		bson.M{"$set": bson.M{"status": StatusAccepted, "updated_at": now}},
	)

	return &facture, nil
}

// ── Update Status (send devis, accept/reject) ───────────────────────────────

func UpdateStatus(tenantID, id, newStatus string) (*Document, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var doc Document
	err = col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tenantID}).Decode(&doc)
	if err != nil {
		return nil, errors.New("document not found")
	}

	// Validate transitions
	switch doc.DocType {
	case DocDevis:
		if doc.Status == StatusDraft && (newStatus == StatusSent || newStatus == StatusAccepted || newStatus == StatusRejected) {
			// OK
		} else if doc.Status == StatusSent && (newStatus == StatusAccepted || newStatus == StatusRejected) {
			// OK
		} else {
			return nil, fmt.Errorf("invalid status transition: %s → %s", doc.Status, newStatus)
		}
	case DocBC:
		if doc.Status == StatusDraft && newStatus == StatusAccepted {
			// OK
		} else {
			return nil, fmt.Errorf("invalid status transition: %s → %s", doc.Status, newStatus)
		}
	default:
		return nil, errors.New("status updates only allowed on BC and Devis")
	}

	after := options.After
	var updated Document
	err = col().FindOneAndUpdate(ctx,
		bson.M{"_id": oid, "tenant_id": tenantID},
		bson.M{"$set": bson.M{"status": newStatus, "updated_at": time.Now()}},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&updated)
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

// ── Avoir (Credit Note) ─────────────────────────────────────────────────────

func CreateAvoir(tenantID, factureID, userID, userEmail string, input AvoirInput) (*Document, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	fid, err := primitive.ObjectIDFromHex(factureID)
	if err != nil {
		return nil, errors.New("invalid facture_id")
	}

	var facture Document
	err = col().FindOne(ctx, bson.M{"_id": fid, "tenant_id": tenantID, "doc_type": DocFacture}).Decode(&facture)
	if err != nil {
		return nil, errors.New("facture not found")
	}

	if len(input.Lines) == 0 {
		return nil, errors.New("at least one line is required")
	}

	// Build avoir lines from facture lines
	var avoirLines []DocLine
	for _, al := range input.Lines {
		if al.Qty <= 0 {
			return nil, errors.New("avoir qty must be positive")
		}
		// Find matching line in facture
		found := false
		pid, _ := primitive.ObjectIDFromHex(al.ProductID)
		for _, fl := range facture.Lines {
			if fl.ProductID == pid {
				if al.Qty > fl.Qty {
					return nil, fmt.Errorf("avoir qty (%v) exceeds facture qty (%v) for %s", al.Qty, fl.Qty, fl.ProductName)
				}
				line := fl
				line.Qty = al.Qty
				line.TotalHT = round2(al.Qty*fl.UnitPrice - fl.Discount*al.Qty/fl.Qty)
				line.TotalVAT = round2(line.TotalHT * float64(fl.VAT) / 100)
				line.TotalTTC = round2(line.TotalHT + line.TotalVAT)
				avoirLines = append(avoirLines, line)
				found = true
				break
			}
		}
		if !found {
			return nil, errors.New("product not found in facture: " + al.ProductID)
		}
	}

	ht, vat, ttc := sumTotals(avoirLines)

	seq, err := counter.Next(tenantID, counterName(DocAvoir))
	if err != nil {
		return nil, fmt.Errorf("counter error: %w", err)
	}
	ref := fmt.Sprintf("%s-%06d", refPrefix(DocAvoir), seq)

	now := time.Now()
	avoir := Document{
		ID:             primitive.NewObjectID(),
		Ref:            ref,
		TenantID:       tenantID,
		DocType:        DocAvoir,
		Status:         StatusPaid, // avoirs are immediately effective
		ClientID:       facture.ClientID,
		ClientName:     facture.ClientName,
		Lines:          avoirLines,
		TotalHT:        ht,
		TotalVAT:       vat,
		Total:          ttc,
		ParentID:       factureID,
		ParentRef:      facture.Ref,
		Note:           input.Note,
		CreatedBy:      userID,
		CreatedByEmail: userEmail,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	_, err = col().InsertOne(ctx, avoir)
	if err != nil {
		return nil, err
	}

	// 1. Credit client balance (reduce what they owe by avoir amount)
	if facture.ClientID != "" {
		_ = client.AdjustBalance(tenantID, facture.ClientID, -ttc)
	}

	// 1b. Create a return sale (negative qty) so the avoir appears in sales stats
	// The return sale also handles stock restoration via negative qty
	if facture.SaleID != "" {
		// Look up original sale type
		origSaleType := "cash"
		if sid, serr := primitive.ObjectIDFromHex(facture.SaleID); serr == nil {
			var origSale struct {
				SaleType string `bson:"sale_type"`
			}
			if database.Col("sales").FindOne(ctx, bson.M{"_id": sid}).Decode(&origSale) == nil && origSale.SaleType != "" {
				origSaleType = origSale.SaleType
			}
		}
		var returnLines []sale.SaleLineInput
		for _, al := range avoirLines {
			returnLines = append(returnLines, sale.SaleLineInput{
				ProductID: al.ProductID.Hex(),
				VariantID: func() string { if al.VariantID != nil { return al.VariantID.Hex() }; return "" }(),
				Qty:       -al.Qty,
				UnitPrice: al.UnitPrice,
				Discount:  al.Discount,
			})
		}
		_, _ = sale.Create(tenantID, userID, userEmail, sale.CreateInput{
			Lines:         returnLines,
			PaymentMethod: facture.PaymentMethod,
			AmountPaid:    0,
			ClientID:      facture.ClientID,
			SaleType:      origSaleType,
		})
	} else {
		// No linked sale — return stock manually
		for _, line := range avoirLines {
			if line.VariantID != nil {
				database.Col("product_variants").UpdateOne(ctx,
					bson.M{"_id": *line.VariantID},
					bson.M{"$inc": bson.M{"qty_available": line.Qty}},
				)
			}
			database.Col("products").UpdateOne(ctx,
				bson.M{"_id": line.ProductID},
				bson.M{"$inc": bson.M{"qty_available": line.Qty}},
			)
		}
	}

	return &avoir, nil
}

// ── Pay Facture ──────────────────────────────────────────────────────────────

func Pay(tenantID, id string, input PayInput) (*Document, error) {
	if input.Amount <= 0 {
		return nil, errors.New("amount must be positive")
	}

	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var doc Document
	err = col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tenantID, "doc_type": DocFacture}).Decode(&doc)
	if err != nil {
		return nil, errors.New("facture not found")
	}
	if doc.Status == StatusPaid {
		return nil, errors.New("facture is already fully paid")
	}

	// Enforce same payment method as the facture — no split payment methods
	payMethod := doc.PaymentMethod
	if payMethod == "" {
		payMethod = "cash"
	}

	newPaid := round2(doc.PaidAmount + input.Amount)
	newStatus := StatusPartial
	if newPaid >= doc.Total {
		newStatus = StatusPaid
		newPaid = doc.Total
	}

	// Calculate timbre for this payment (cash only)
	payTimbre := sale.CalcTimbre(input.Amount, payMethod)
	newTotalTimbre := round2(doc.Timbre + payTimbre)

	payment := DocPayment{
		Amount:        input.Amount,
		PaymentMethod: payMethod,
		Timbre:        payTimbre,
		Note:          input.Note,
		CreatedAt:     time.Now(),
	}

	after := options.After
	var updated Document
	err = col().FindOneAndUpdate(ctx,
		bson.M{"_id": oid, "tenant_id": tenantID},
		bson.M{
			"$set": bson.M{
				"paid_amount": newPaid,
				"status":      newStatus,
				"timbre":      newTotalTimbre,
				"updated_at":  time.Now(),
			},
			"$push": bson.M{
				"payments": payment,
			},
		},
		options.FindOneAndUpdate().SetReturnDocument(after),
	).Decode(&updated)
	if err != nil {
		return nil, err
	}

	// Reduce client balance and record payment for stats
	if doc.ClientID != "" {
		_ = client.AdjustBalance(tenantID, doc.ClientID, -input.Amount)
		_ = client.RecordPayment(tenantID, doc.ClientID, input.Amount, fmt.Sprintf("Facture %s", doc.Ref))
	}

	// Update linked sale's amount_paid if facture was created from a sale
	if doc.SaleID != "" {
		sid, serr := primitive.ObjectIDFromHex(doc.SaleID)
		if serr == nil {
			database.Col("sales").UpdateOne(ctx,
				bson.M{"_id": sid, "tenant_id": tenantID},
				bson.M{"$inc": bson.M{"amount_paid": input.Amount}},
			)
		}
	}

	return &updated, nil
}
