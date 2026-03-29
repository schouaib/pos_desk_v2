package testutil

import (
	"testing"
	"time"

	"saas_pos/internal/adjustment"
	"saas_pos/internal/brand"
	"saas_pos/internal/caisse"
	"saas_pos/internal/category"
	"saas_pos/internal/loss"
	"saas_pos/internal/product"
	"saas_pos/internal/purchase"
	"saas_pos/internal/sale"
	"saas_pos/internal/sale_return"
	"saas_pos/internal/supplier"
	"saas_pos/internal/unit"
)

// ══════════════════════════════════════════════════════════════════════════════
// TestCoverage_ProductSearchByName
// Verifies product.List finds products by name substring.
// ══════════════════════════════════════════════════════════════════════════════

func TestCoverage_ProductSearchByName(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	_, err = product.Create(tenantID, product.CreateInput{
		Name:       "Alpha Widget",
		CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(), UnitID: un.ID.Hex(),
		PrixAchat: 10, PrixVente1: 20,
	})
	AssertNoError(t, err)

	_, err = product.Create(tenantID, product.CreateInput{
		Name:       "Beta Gadget",
		CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(), UnitID: un.ID.Hex(),
		PrixAchat: 15, PrixVente1: 25,
	})
	AssertNoError(t, err)

	// Search by partial name "Alpha"
	res, err := product.List(tenantID, "Alpha", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(1), "search 'Alpha' should find 1 product")
	AssertEqual(t, res.Items[0].Name, "Alpha Widget", "search 'Alpha' returns correct product")

	// Search by partial name "Gadget"
	res, err = product.List(tenantID, "Gadget", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(1), "search 'Gadget' should find 1 product")
	AssertEqual(t, res.Items[0].Name, "Beta Gadget", "search 'Gadget' returns correct product")

	// Search with no match
	res, err = product.List(tenantID, "Nonexistent", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(0), "search 'Nonexistent' should find 0 products")

	// Empty search returns all
	res, err = product.List(tenantID, "", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(2), "empty search returns all 2 products")
}

// ══════════════════════════════════════════════════════════════════════════════
// TestCoverage_ProductSearchByBarcode
// Verifies product.List finds products by barcode.
// ══════════════════════════════════════════════════════════════════════════════

func TestCoverage_ProductSearchByBarcode(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	_, err = product.Create(tenantID, product.CreateInput{
		Name:       "Barcode Product A",
		Barcodes:   []string{"ABC123456"},
		CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(), UnitID: un.ID.Hex(),
		PrixAchat: 10, PrixVente1: 20,
	})
	AssertNoError(t, err)

	_, err = product.Create(tenantID, product.CreateInput{
		Name:       "Barcode Product B",
		Barcodes:   []string{"XYZ789012"},
		CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(), UnitID: un.ID.Hex(),
		PrixAchat: 15, PrixVente1: 25,
	})
	AssertNoError(t, err)

	// Search by exact barcode
	res, err := product.List(tenantID, "ABC123456", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(1), "barcode search 'ABC123456' finds 1 product")
	AssertEqual(t, res.Items[0].Name, "Barcode Product A", "barcode search returns correct product")

	// Search by partial barcode
	res, err = product.List(tenantID, "XYZ789", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(1), "partial barcode search finds 1 product")
	AssertEqual(t, res.Items[0].Name, "Barcode Product B", "partial barcode search returns correct product")

	// Search by barcode that doesn't exist
	res, err = product.List(tenantID, "000000000", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(0), "non-existent barcode returns 0")
}

// ══════════════════════════════════════════════════════════════════════════════
// TestCoverage_ProductSearchByCategoryFilter
// Verifies product.List filters by category.
// ══════════════════════════════════════════════════════════════════════════════

func TestCoverage_ProductSearchByCategoryFilter(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)

	cat1, err := category.Create(tenantID, category.CreateInput{Name: "Food"})
	AssertNoError(t, err)
	cat2, err := category.Create(tenantID, category.CreateInput{Name: "Drinks"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	_, err = product.Create(tenantID, product.CreateInput{
		Name: "Rice", CategoryID: cat1.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 10, PrixVente1: 20,
	})
	AssertNoError(t, err)

	_, err = product.Create(tenantID, product.CreateInput{
		Name: "Water", CategoryID: cat2.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 5, PrixVente1: 10,
	})
	AssertNoError(t, err)

	// Filter by Food category
	res, err := product.List(tenantID, "", 1, 10, cat1.ID.Hex())
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(1), "category filter finds 1 product in Food")
	AssertEqual(t, res.Items[0].Name, "Rice", "category filter returns correct product")

	// Filter by Drinks category
	res, err = product.List(tenantID, "", 1, 10, cat2.ID.Hex())
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(1), "category filter finds 1 product in Drinks")
}

// ══════════════════════════════════════════════════════════════════════════════
// TestCoverage_MovementHistory_FullLifecycle
// Verifies ListMovements returns correct entries for purchase, sale, loss,
// adjustment, and sale_return.
// ══════════════════════════════════════════════════════════════════════════════

func TestCoverage_MovementHistory_FullLifecycle(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "mov@test.local"

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name:       "MovTest Product",
		Barcodes:   []string{"MOV001"},
		CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(), UnitID: un.ID.Hex(),
		PrixAchat: 10, PrixVente1: 20, VAT: 0,
	})
	AssertNoError(t, err)
	productID := p.ID.Hex()

	today := time.Now().Format("2006-01-02")

	// 1. Initially no movements
	mov, err := product.ListMovements(tenantID, productID, "", "", 1, 50)
	AssertNoError(t, err)
	AssertEqual(t, mov.Total, int64(0), "no movements initially")

	// 2. Purchase 10 units
	sup, err := supplier.Create(tenantID, supplier.CreateInput{Name: "Supplier", Phone: "0500000"})
	AssertNoError(t, err)

	purch, err := purchase.Create(tenantID, userID, userEmail, purchase.CreateInput{
		SupplierID: sup.ID.Hex(),
		Lines:      []purchase.LineInput{{ProductID: productID, Qty: 10, PrixAchat: 10}},
	})
	AssertNoError(t, err)

	_, err = purchase.Validate(tenantID, purch.ID.Hex(), userID, userEmail, &purchase.ValidateInput{
		Lines: []purchase.ValidateLineInput{{ProductID: productID, ReceivedQty: 10}},
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 10, "stock after purchase")

	// Check movement: 1 purchase entry
	mov, err = product.ListMovements(tenantID, productID, "", "", 1, 50)
	AssertNoError(t, err)
	AssertTrue(t, mov.Total >= 1, "at least 1 movement after purchase")

	foundPurchase := false
	for _, m := range mov.Items {
		if m.Type == "purchase" && m.Qty == 10 {
			foundPurchase = true
		}
	}
	AssertTrue(t, foundPurchase, "movement history contains purchase +10")

	// 3. Sell 3 units
	s1, err := sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: productID, Qty: 3, UnitPrice: 20}},
		PaymentMethod: "cash", AmountPaid: 60, SaleType: "cash",
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 7, "stock after sale")

	// Check movement: purchase + sale
	mov, err = product.ListMovements(tenantID, productID, "", "", 1, 50)
	AssertNoError(t, err)
	AssertTrue(t, mov.Total >= 2, "at least 2 movements after sale")

	foundSale := false
	for _, m := range mov.Items {
		if m.Type == "sale" && m.Qty == -3 {
			foundSale = true
		}
	}
	AssertTrue(t, foundSale, "movement history contains sale -3")

	// 4. Return 1 from sale
	_, err = sale_return.Create(tenantID, userID, userEmail, s1.ID.Hex(), sale_return.CreateInput{
		Lines: []sale_return.ReturnLineInput{{ProductID: productID, Qty: 1, Reason: "defective"}},
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 8, "stock after return")

	mov, err = product.ListMovements(tenantID, productID, "", "", 1, 50)
	AssertNoError(t, err)

	foundReturn := false
	for _, m := range mov.Items {
		if m.Type == "sale_return" && m.Qty == 1 {
			foundReturn = true
		}
	}
	AssertTrue(t, foundReturn, "movement history contains sale_return +1")

	// 5. Loss of 2
	_, err = loss.Create(tenantID, loss.CreateInput{
		ProductID: productID, Type: "casse", Qty: 2, Remark: "broken",
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 6, "stock after loss")

	mov, err = product.ListMovements(tenantID, productID, "", "", 1, 50)
	AssertNoError(t, err)

	foundLoss := false
	for _, m := range mov.Items {
		if m.Type == "loss" && m.Qty == -2 {
			foundLoss = true
		}
	}
	AssertTrue(t, foundLoss, "movement history contains loss -2")

	// 6. Adjustment to 10
	_, err = adjustment.Create(tenantID, userID, userEmail, adjustment.CreateInput{
		ProductID: productID, QtyAfter: 10, Reason: "count correction",
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 10, "stock after adjustment")

	mov, err = product.ListMovements(tenantID, productID, "", "", 1, 50)
	AssertNoError(t, err)

	foundAdjustment := false
	for _, m := range mov.Items {
		if m.Type == "adjustment" && m.Qty == 4 { // 10-6=4
			foundAdjustment = true
		}
	}
	AssertTrue(t, foundAdjustment, "movement history contains adjustment +4")

	// 7. Verify all 5 types present
	types := map[string]bool{}
	for _, m := range mov.Items {
		types[m.Type] = true
	}
	AssertTrue(t, types["purchase"], "movements include purchase type")
	AssertTrue(t, types["sale"], "movements include sale type")
	AssertTrue(t, types["sale_return"], "movements include sale_return type")
	AssertTrue(t, types["loss"], "movements include loss type")
	AssertTrue(t, types["adjustment"], "movements include adjustment type")

	// 8. Verify date filter works
	mov, err = product.ListMovements(tenantID, productID, today, today, 1, 50)
	AssertNoError(t, err)
	AssertTrue(t, mov.Total >= 5, "date-filtered movements contain all today's entries")

	// Future date should return nothing
	mov, err = product.ListMovements(tenantID, productID, "2099-01-01", "2099-12-31", 1, 50)
	AssertNoError(t, err)
	AssertEqual(t, mov.Total, int64(0), "future date filter returns 0 movements")
}

// ══════════════════════════════════════════════════════════════════════════════
// TestCoverage_MovementHistory_LossTypes
// Verifies all loss types (vol, perte, casse) appear in movement history.
// ══════════════════════════════════════════════════════════════════════════════

func TestCoverage_MovementHistory_LossTypes(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name: "LossMovTest", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 100, PrixAchat: 50, PrixVente1: 80,
	})
	AssertNoError(t, err)
	productID := p.ID.Hex()

	// Create all 3 loss types
	_, err = loss.Create(tenantID, loss.CreateInput{ProductID: productID, Type: "vol", Qty: 3, Remark: "theft"})
	AssertNoError(t, err)
	_, err = loss.Create(tenantID, loss.CreateInput{ProductID: productID, Type: "perte", Qty: 2, Remark: "expired"})
	AssertNoError(t, err)
	_, err = loss.Create(tenantID, loss.CreateInput{ProductID: productID, Type: "casse", Qty: 1, Remark: "broken"})
	AssertNoError(t, err)

	AssertStock(t, tenantID, productID, 94, "stock after 3 losses (100-3-2-1)")

	// Verify all losses appear in movements
	mov, err := product.ListMovements(tenantID, productID, "", "", 1, 50)
	AssertNoError(t, err)

	lossCount := 0
	totalLossQty := 0.0
	for _, m := range mov.Items {
		if m.Type == "loss" {
			lossCount++
			totalLossQty += m.Qty
		}
	}
	AssertEqual(t, lossCount, 3, "3 loss movements")
	AssertFloatEqual(t, totalLossQty, -6, "total loss qty = -6 (negative in movements)")
}

// ══════════════════════════════════════════════════════════════════════════════
// TestCoverage_DeleteProductWithSales_Archives
// Verifies that deleting a product with sales auto-archives instead of deleting.
// ══════════════════════════════════════════════════════════════════════════════

func TestCoverage_DeleteProductWithSales_Archives(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "del@test.local"

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name: "ToDelete Sold", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 10, PrixAchat: 10, PrixVente1: 20,
	})
	AssertNoError(t, err)
	productID := p.ID.Hex()

	// Make a sale so product has history
	_, err = sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: productID, Qty: 1, UnitPrice: 20}},
		PaymentMethod: "cash", AmountPaid: 20, SaleType: "cash",
	})
	AssertNoError(t, err)

	// Delete should auto-archive
	archived, err := product.Delete(tenantID, productID)
	AssertNoError(t, err)
	AssertTrue(t, archived, "Delete returns archived=true for product with sales")

	// Product should be archived, not deleted
	got, err := product.GetByID(tenantID, productID)
	AssertNoError(t, err)
	AssertTrue(t, got.Archived, "product is archived after delete attempt")

	// Should not appear in active list
	list, err := product.List(tenantID, "", 1, 10)
	AssertNoError(t, err)
	for _, item := range list.Items {
		AssertTrue(t, item.ID.Hex() != productID, "archived product not in active list")
	}

	// Should appear in archived list
	archivedList, err := product.ListArchived(tenantID, "", 1, 10)
	AssertNoError(t, err)
	found := false
	for _, item := range archivedList.Items {
		if item.ID.Hex() == productID {
			found = true
		}
	}
	AssertTrue(t, found, "archived product appears in archived list")
}

// ══════════════════════════════════════════════════════════════════════════════
// TestCoverage_DeleteProductWithPurchases_Archives
// Verifies that deleting a product with purchases auto-archives.
// ══════════════════════════════════════════════════════════════════════════════

func TestCoverage_DeleteProductWithPurchases_Archives(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "del@test.local"

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	sup, err := supplier.Create(tenantID, supplier.CreateInput{Name: "Sup", Phone: "0500000"})
	AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name: "ToDelete Purchased", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 10, PrixVente1: 20,
	})
	AssertNoError(t, err)
	productID := p.ID.Hex()

	// Make a purchase so product has history
	_, err = purchase.Create(tenantID, userID, userEmail, purchase.CreateInput{
		SupplierID: sup.ID.Hex(),
		Lines:      []purchase.LineInput{{ProductID: productID, Qty: 5, PrixAchat: 10}},
	})
	AssertNoError(t, err)

	// Delete should auto-archive
	archived, err := product.Delete(tenantID, productID)
	AssertNoError(t, err)
	AssertTrue(t, archived, "Delete returns archived=true for product with purchases")

	got, err := product.GetByID(tenantID, productID)
	AssertNoError(t, err)
	AssertTrue(t, got.Archived, "product is archived after delete attempt")
}

// ══════════════════════════════════════════════════════════════════════════════
// TestCoverage_DeleteProductNoHistory_Deletes
// Verifies that deleting a product with no sales/purchases hard deletes it.
// ══════════════════════════════════════════════════════════════════════════════

func TestCoverage_DeleteProductNoHistory_Deletes(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name: "ToDelete Clean", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 10, PrixVente1: 20,
	})
	AssertNoError(t, err)
	productID := p.ID.Hex()

	// Delete should hard delete
	archived, err := product.Delete(tenantID, productID)
	AssertNoError(t, err)
	AssertFalse(t, archived, "Delete returns archived=false for clean product")

	// Product should not exist at all
	_, err = product.GetByID(tenantID, productID)
	AssertError(t, err)
}

// ══════════════════════════════════════════════════════════════════════════════
// TestCoverage_CaisseEcart_WrongAmount
// Verifies ecart (discrepancy) calculation when closing with wrong amount.
// ══════════════════════════════════════════════════════════════════════════════

func TestCoverage_CaisseEcart_WrongAmount(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "caisse@test.local"

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name: "CaisseTest", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 100, PrixAchat: 10, PrixVente1: 20, VAT: 0,
	})
	AssertNoError(t, err)
	productID := p.ID.Hex()

	// Open caisse with 100
	session, err := caisse.Open(tenantID, userID, userEmail, caisse.OpenInput{
		OpeningAmount: 100,
	})
	AssertNoError(t, err)
	AssertFloatEqual(t, session.OpeningAmount, 100, "opening amount = 100")

	// Make a cash sale of 5 units @20 = 100
	_, err = sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: productID, Qty: 5, UnitPrice: 20}},
		PaymentMethod: "cash", AmountPaid: 100, SaleType: "cash",
		CaisseID: session.ID.Hex(),
	})
	AssertNoError(t, err)

	// Close with wrong amount (150 instead of expected 200)
	closed, err := caisse.Close(tenantID, userID, caisse.CloseInput{
		ClosingAmount: 150,
		Notes:         "wrong amount",
	})
	AssertNoError(t, err)
	AssertEqual(t, closed.Status, "closed", "caisse closed")
	AssertFloatEqual(t, closed.OpeningAmount, 100, "opening amount preserved")
	AssertTrue(t, closed.ClosingAmount != nil, "closing amount set")
	AssertFloatEqual(t, *closed.ClosingAmount, 150, "closing amount recorded")

	// Verify ecart via UserSummary
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	endOfDay := startOfDay.Add(24 * time.Hour)

	summary, err := sale.UserSummary(tenantID, startOfDay, endOfDay, "", "")
	AssertNoError(t, err)
	AssertTrue(t, len(summary.Users) > 0, "user summary has entries")

	var userLine *sale.UserSummaryLine
	for i := range summary.Users {
		if summary.Users[i].UserID == userID {
			userLine = &summary.Users[i]
			break
		}
	}
	AssertTrue(t, userLine != nil, "found user in summary")
	// Ecart = closing - (opening + cash_sales - returns - retraits)
	// = 150 - (100 + 100 - 0 - 0) = 150 - 200 = -50
	AssertFloatEqual(t, userLine.Ecart, -50, "ecart = -50 (short by 50)")
}

// ══════════════════════════════════════════════════════════════════════════════
// TestCoverage_CaisseEcart_CorrectAmount
// Verifies ecart = 0 when closing with the correct amount.
// ══════════════════════════════════════════════════════════════════════════════

func TestCoverage_CaisseEcart_CorrectAmount(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "caisse@test.local"

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name: "CaisseCorrect", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 100, PrixAchat: 10, PrixVente1: 20, VAT: 0,
	})
	AssertNoError(t, err)
	productID := p.ID.Hex()

	// Open caisse with 100
	session, err := caisse.Open(tenantID, userID, userEmail, caisse.OpenInput{
		OpeningAmount: 100,
	})
	AssertNoError(t, err)

	// Sale: 5 units @20 = 100
	_, err = sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: productID, Qty: 5, UnitPrice: 20}},
		PaymentMethod: "cash", AmountPaid: 100, SaleType: "cash",
		CaisseID: session.ID.Hex(),
	})
	AssertNoError(t, err)

	// Close with correct amount: opening(100) + sales(100) = 200
	closed, err := caisse.Close(tenantID, userID, caisse.CloseInput{
		ClosingAmount: 200,
	})
	AssertNoError(t, err)
	AssertEqual(t, closed.Status, "closed", "caisse closed")

	// Verify ecart = 0
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	endOfDay := startOfDay.Add(24 * time.Hour)

	summary, err := sale.UserSummary(tenantID, startOfDay, endOfDay, "", "")
	AssertNoError(t, err)

	var userLine *sale.UserSummaryLine
	for i := range summary.Users {
		if summary.Users[i].UserID == userID {
			userLine = &summary.Users[i]
			break
		}
	}
	AssertTrue(t, userLine != nil, "found user in summary")
	AssertFloatEqual(t, userLine.Ecart, 0, "ecart = 0 (correct amount)")
}

// ══════════════════════════════════════════════════════════════════════════════
// TestCoverage_ProductValuation
// Verifies GetValuation returns correct total value.
// ══════════════════════════════════════════════════════════════════════════════

func TestCoverage_ProductValuation(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	// Product A: qty=10, PA=100 → value=1000
	_, err = product.Create(tenantID, product.CreateInput{
		Name: "Val A", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 10, PrixAchat: 100, PrixVente1: 150,
	})
	AssertNoError(t, err)

	// Product B: qty=5, PA=200 → value=1000
	_, err = product.Create(tenantID, product.CreateInput{
		Name: "Val B", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 5, PrixAchat: 200, PrixVente1: 300,
	})
	AssertNoError(t, err)

	val, err := product.GetValuation(tenantID)
	AssertNoError(t, err)
	AssertFloatEqual(t, val.TotalValue, 2000, "total valuation = 10*100 + 5*200 = 2000")
	AssertFloatEqual(t, val.TotalQty, 15, "total qty = 15")
	AssertEqual(t, val.ProductCount, int64(2), "product count = 2")
}

// ══════════════════════════════════════════════════════════════════════════════
// TestCoverage_LossList
// Verifies loss.List returns losses filtered by search and date.
// ══════════════════════════════════════════════════════════════════════════════

func TestCoverage_LossList(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name: "LossListProd", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 100, PrixAchat: 50, PrixVente1: 80,
	})
	AssertNoError(t, err)

	_, err = loss.Create(tenantID, loss.CreateInput{ProductID: p.ID.Hex(), Type: "vol", Qty: 5, Remark: "theft"})
	AssertNoError(t, err)
	_, err = loss.Create(tenantID, loss.CreateInput{ProductID: p.ID.Hex(), Type: "casse", Qty: 2, Remark: "broken"})
	AssertNoError(t, err)

	now := time.Now()
	from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	to := from.Add(24 * time.Hour)

	// List all losses
	result, err := loss.List(tenantID, "", from, to, 1, 10)
	AssertNoError(t, err)
	AssertTrue(t, result.Total >= 2, "at least 2 losses listed")

	// Search by product name
	result, err = loss.List(tenantID, "LossListProd", from, to, 1, 10)
	AssertNoError(t, err)
	AssertTrue(t, result.Total >= 2, "search by product name finds losses")
}

// ══════════════════════════════════════════════════════════════════════════════
// TestCoverage_PurchaseReturnUpdatesSupplierBalance
// Verifies that returning items to supplier updates the supplier balance.
// ══════════════════════════════════════════════════════════════════════════════

func TestCoverage_PurchaseReturnUpdatesSupplierBalance(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "ret@test.local"

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	sup, err := supplier.Create(tenantID, supplier.CreateInput{Name: "ReturnSup", Phone: "0500000"})
	AssertNoError(t, err)
	supplierID := sup.ID.Hex()

	p, err := product.Create(tenantID, product.CreateInput{
		Name: "ReturnProd", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 100, PrixVente1: 150,
	})
	AssertNoError(t, err)
	productID := p.ID.Hex()

	// Create and validate purchase (10 units @100 = 1000 total)
	purch, err := purchase.Create(tenantID, userID, userEmail, purchase.CreateInput{
		SupplierID: supplierID,
		Lines:      []purchase.LineInput{{ProductID: productID, Qty: 10, PrixAchat: 100}},
	})
	AssertNoError(t, err)

	_, err = purchase.Validate(tenantID, purch.ID.Hex(), userID, userEmail, &purchase.ValidateInput{
		Lines: []purchase.ValidateLineInput{{ProductID: productID, ReceivedQty: 10}},
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 10, "stock after purchase")

	balanceBefore := GetSupplierBalance(t, tenantID, supplierID)

	// Return 3 units
	_, err = purchase.Return(tenantID, purch.ID.Hex(), userID, userEmail, []purchase.ValidateLineInput{
		{ProductID: productID, ReceivedQty: 3},
	})
	AssertNoError(t, err)

	// Stock should decrease by 3
	AssertStock(t, tenantID, productID, 7, "stock after return to supplier")

	// Supplier balance should decrease (we owe less)
	balanceAfter := GetSupplierBalance(t, tenantID, supplierID)
	AssertTrue(t, balanceAfter < balanceBefore, "supplier balance decreased after return")
	AssertFloatEqual(t, balanceBefore-balanceAfter, 300, "balance decreased by 3*100=300")
}

// ══════════════════════════════════════════════════════════════════════════════
// TestCoverage_SaleMultiplePaymentMethods
// Verifies statistics track payment methods correctly.
// ══════════════════════════════════════════════════════════════════════════════

func TestCoverage_SaleMultiplePaymentMethods(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "pay@test.local"

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name: "PayMethodProd", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 100, PrixAchat: 10, PrixVente1: 20, VAT: 0,
	})
	AssertNoError(t, err)
	productID := p.ID.Hex()

	// Sale 1: cash
	_, err = sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: productID, Qty: 2, UnitPrice: 20}},
		PaymentMethod: "cash", AmountPaid: 40, SaleType: "cash",
	})
	AssertNoError(t, err)

	// Sale 2: cheque
	_, err = sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: productID, Qty: 3, UnitPrice: 20}},
		PaymentMethod: "cheque", AmountPaid: 60, SaleType: "cash",
	})
	AssertNoError(t, err)

	// Sale 3: virement
	_, err = sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: productID, Qty: 1, UnitPrice: 20}},
		PaymentMethod: "virement", AmountPaid: 20, SaleType: "cash",
	})
	AssertNoError(t, err)

	AssertStock(t, tenantID, productID, 94, "stock after 3 sales (100-2-3-1)")

	// Verify statistics
	now := time.Now()
	from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	to := from.Add(24 * time.Hour)

	stats, err := sale.SalesStatistics(tenantID, from, to, false)
	AssertNoError(t, err)
	AssertEqual(t, stats.SalesCount, int64(3), "3 sales in stats")
	AssertFloatEqual(t, stats.CashPaymentTTC, 40, "cash payment = 40")
	AssertFloatEqual(t, stats.ChequePaymentTTC, 60, "cheque payment = 60")
	AssertFloatEqual(t, stats.VirementPaymentTTC, 20, "virement payment = 20")
	AssertFloatEqual(t, stats.RevenueTTC, 120, "total revenue = 120")
}

// ══════════════════════════════════════════════════════════════════════════════
// TestCoverage_ProductLowStock
// Verifies ListLowStock returns products below their qty_min.
// ══════════════════════════════════════════════════════════════════════════════

func TestCoverage_ProductLowStock(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	// Product below min: qty=3, min=10
	_, err = product.Create(tenantID, product.CreateInput{
		Name: "Low Stock Item", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 3, QtyMin: 10, PrixAchat: 10, PrixVente1: 20,
	})
	AssertNoError(t, err)

	// Product above min: qty=50, min=5
	_, err = product.Create(tenantID, product.CreateInput{
		Name: "Well Stocked Item", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 50, QtyMin: 5, PrixAchat: 10, PrixVente1: 20,
	})
	AssertNoError(t, err)

	res, err := product.ListLowStock(tenantID, "", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(1), "only 1 product with low stock")
	AssertEqual(t, res.Items[0].Name, "Low Stock Item", "correct low stock product")
}

// ══════════════════════════════════════════════════════════════════════════════
// TestCoverage_PriceHistoryOnUpdate
// Verifies price_history records are created when product prices change.
// ══════════════════════════════════════════════════════════════════════════════

func TestCoverage_PriceHistoryOnUpdate(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name: "PriceHistProd", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 10, PrixVente1: 20, PrixVente2: 18, PrixVente3: 15,
	})
	AssertNoError(t, err)

	// Update prix_achat: 10→15
	_, err = product.Update(tenantID, p.ID.Hex(), product.UpdateInput{
		Name: "PriceHistProd", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 15, PrixVente1: 25, PrixVente2: 22, PrixVente3: 18,
	})
	AssertNoError(t, err)

	// Verify updated product has new prices
	updated, err := product.GetByID(tenantID, p.ID.Hex())
	AssertNoError(t, err)
	AssertFloatEqual(t, updated.PrixAchat, 15, "prix_achat updated to 15")
	AssertFloatEqual(t, updated.PrixVente1, 25, "prix_vente_1 updated to 25")
	AssertFloatEqual(t, updated.PrixVente2, 22, "prix_vente_2 updated to 22")
	AssertFloatEqual(t, updated.PrixVente3, 18, "prix_vente_3 updated to 18")

	// Second update
	_, err = product.Update(tenantID, p.ID.Hex(), product.UpdateInput{
		Name: "PriceHistProd", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 20, PrixVente1: 30, PrixVente2: 28, PrixVente3: 25,
	})
	AssertNoError(t, err)

	updated, err = product.GetByID(tenantID, p.ID.Hex())
	AssertNoError(t, err)
	AssertFloatEqual(t, updated.PrixAchat, 20, "prix_achat updated to 20")
	AssertFloatEqual(t, updated.PrixVente1, 30, "prix_vente_1 updated to 30")
}
