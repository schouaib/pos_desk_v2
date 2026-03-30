package docimport

import (
	"context"
	"errors"
	"log"
	"strings"
	"time"

	"saas_pos/internal/database"
	"saas_pos/internal/product"
	"saas_pos/internal/purchase"
	"saas_pos/internal/supplier"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// MatchProducts matches extracted lines against existing products in the database.
func MatchProducts(tenantID string, doc ExtractedDocument) (*ParseResult, error) {
	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Fetch all products for this tenant (name + barcodes)
	// Check both string and ObjectID formats for tenant_id
	col := database.Col("products")
	cursor, err := col.Find(ctx, bson.M{
		"tenant_id": bson.M{"$in": bson.A{tenantID, tid}},
		"archived":  bson.M{"$ne": true},
	}, options.Find().SetProjection(bson.M{
		"_id":      1,
		"name":     1,
		"barcodes": 1,
	}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	type productRef struct {
		ID       primitive.ObjectID `bson:"_id"`
		Name     string             `bson:"name"`
		Barcodes []string           `bson:"barcodes"`
	}

	var products []productRef
	if err := cursor.All(ctx, &products); err != nil {
		return nil, err
	}

	log.Printf("[docimport] MatchProducts: tenantID=%s tid=%s, found %d products in DB", tenantID, tid.Hex(), len(products))
	for i, p := range products {
		if i < 10 {
			log.Printf("[docimport]   product[%d]: id=%s name=%q barcodes=%v", i, p.ID.Hex(), p.Name, p.Barcodes)
		}
	}

	result := &ParseResult{
		Document: doc,
	}

	for _, el := range doc.Lines {
		ml := MatchedLine{
			ExtractedLine: el,
			IsNew:         true,
			Confidence:    0,
		}

		// Collect all candidates with score > 0
		type scored struct {
			ref   *productRef
			score int
		}
		var candidates []scored

		for i := range products {
			p := &products[i]

			// Check barcode match (highest confidence)
			if el.Barcode != "" {
				for _, bc := range p.Barcodes {
					if bc == el.Barcode {
						candidates = append(candidates, scored{p, 100})
						break
					}
				}
			}

			// Fuzzy name match
			score := fuzzyMatch(el.Name, p.Name)
			if score >= 30 {
				// Don't add duplicate if already matched by barcode
				alreadyAdded := false
				for _, c := range candidates {
					if c.ref.ID == p.ID {
						alreadyAdded = true
						break
					}
				}
				if !alreadyAdded {
					candidates = append(candidates, scored{p, score})
				}
			}
		}

		// Sort by score descending
		for i := 0; i < len(candidates); i++ {
			for j := i + 1; j < len(candidates); j++ {
				if candidates[j].score > candidates[i].score {
					candidates[i], candidates[j] = candidates[j], candidates[i]
				}
			}
		}

		// Keep top 5 candidates
		if len(candidates) > 5 {
			candidates = candidates[:5]
		}

		// Build candidate list for response
		for _, c := range candidates {
			ml.Candidates = append(ml.Candidates, ProductCandidate{
				ProductID:   c.ref.ID.Hex(),
				ProductName: c.ref.Name,
				Confidence:  c.score,
			})
		}

		// Auto-select the best match only if confidence >= 50
		if len(candidates) > 0 && candidates[0].score >= 50 {
			ml.ProductID = candidates[0].ref.ID.Hex()
			ml.ProductName = candidates[0].ref.Name
			ml.IsNew = false
			ml.Confidence = candidates[0].score
		}

		result.Lines = append(result.Lines, ml)
	}

	// Calculate stats
	for _, ml := range result.Lines {
		result.Stats.Total++
		if ml.IsNew {
			result.Stats.New++
		} else {
			result.Stats.Matched++
		}
	}

	return result, nil
}

// getOrCreateAnonymousSupplier finds or creates a "Fournisseur Anonyme" supplier for the tenant.
func getOrCreateAnonymousSupplier(tenantID string) (string, error) {
	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return "", err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Look for existing anonymous supplier
	col := database.Col("suppliers")
	var existing struct {
		ID primitive.ObjectID `bson:"_id"`
	}
	err = col.FindOne(ctx, bson.M{
		"tenant_id": tid,
		"name":      "Fournisseur Anonyme",
	}).Decode(&existing)
	if err == nil {
		return existing.ID.Hex(), nil
	}

	// Create one
	s, err := supplier.Create(tenantID, supplier.CreateInput{
		Name: "Fournisseur Anonyme",
	})
	if err != nil {
		return "", err
	}
	return s.ID.Hex(), nil
}

// ConfirmImport creates missing products and then creates a purchase.
func ConfirmImport(tenantID, userID, userEmail string, input ConfirmInput) (*ConfirmResult, error) {
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	result := &ConfirmResult{}

	// If no supplier selected, use anonymous supplier
	if input.SupplierID == "" {
		anonID, err := getOrCreateAnonymousSupplier(tenantID)
		if err != nil {
			return nil, errors.New("failed to create anonymous supplier: " + err.Error())
		}
		input.SupplierID = anonID
	}

	var purchaseLines []purchase.LineInput

	for _, line := range input.Lines {
		if line.Skip {
			continue
		}

		productID := line.ProductID

		// If no product_id, try to find existing product by name before creating
		if productID == "" {
			ctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
			var existing struct {
				ID primitive.ObjectID `bson:"_id"`
			}
			err := database.Col("products").FindOne(ctx2, bson.M{
				"tenant_id": bson.M{"$in": bson.A{tenantID, tid}},
				"name":      line.Name,
				"archived":  bson.M{"$ne": true},
			}).Decode(&existing)
			cancel2()

			if err == nil {
				// Product already exists — use it
				productID = existing.ID.Hex()
			} else {
				newProduct, err := product.Create(tenantID, product.CreateInput{
					Name:       line.Name,
					Barcodes:   makeBarcodes(line.Barcode),
					PrixAchat:  line.PrixAchat,
					PrixVente1: line.PrixVente1,
					VAT:        line.VAT,
				})
				if err != nil {
					return nil, errors.New("failed to create product '" + line.Name + "': " + err.Error())
				}
				productID = newProduct.ID.Hex()
				result.ProductsCreated++
			}
		}

		purchaseLines = append(purchaseLines, purchase.LineInput{
			ProductID:  productID,
			Qty:        line.Qty,
			PrixAchat:  line.PrixAchat,
			PrixVente1: line.PrixVente1,
		})
	}

	if len(purchaseLines) == 0 {
		return nil, errors.New("no lines to import")
	}

	// Create the purchase
	p, err := purchase.Create(tenantID, userID, userEmail, purchase.CreateInput{
		SupplierID:      input.SupplierID,
		SupplierInvoice: input.SupplierInvoice,
		Note:            input.Note,
		Lines:           purchaseLines,
	})
	if err != nil {
		return nil, errors.New("failed to create purchase: " + err.Error())
	}

	result.PurchaseID = p.ID.Hex()
	result.PurchaseRef = p.Ref
	result.LinesImported = len(purchaseLines)

	return result, nil
}

func makeBarcodes(barcode string) []string {
	if barcode == "" {
		return nil
	}
	return []string{barcode}
}

// fuzzyMatch returns a 0-100 score for how well two strings match.
func fuzzyMatch(a, b string) int {
	a = normalize(a)
	b = normalize(b)

	if a == "" || b == "" {
		return 0
	}

	// Exact match
	if a == b {
		return 100
	}

	// One contains the other
	if strings.Contains(a, b) || strings.Contains(b, a) {
		shorter := len(a)
		if len(b) < shorter {
			shorter = len(b)
		}
		longer := len(a)
		if len(b) > longer {
			longer = len(b)
		}
		return 60 + (40 * shorter / longer)
	}

	// Word-based overlap
	wordsA := strings.Fields(a)
	wordsB := strings.Fields(b)

	if len(wordsA) == 0 || len(wordsB) == 0 {
		return 0
	}

	matches := 0
	for _, wa := range wordsA {
		for _, wb := range wordsB {
			if wa == wb || strings.Contains(wa, wb) || strings.Contains(wb, wa) {
				matches++
				break
			}
		}
	}

	// Score based on how many words matched vs total
	totalWords := len(wordsA)
	if len(wordsB) > totalWords {
		totalWords = len(wordsB)
	}

	return matches * 100 / totalWords
}

// normalize lowercases and removes accents/special chars for comparison.
func normalize(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	// Remove common OCR artifacts
	s = strings.ReplaceAll(s, "|", "l")
	return s
}
