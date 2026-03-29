package testutil

import (
	"testing"
	"time"

	"saas_pos/internal/adjustment"
	"saas_pos/internal/brand"
	"saas_pos/internal/caisse"
	"saas_pos/internal/category"
	"saas_pos/internal/client"
	"saas_pos/internal/discount"
	"saas_pos/internal/expense"
	"saas_pos/internal/loss"
	"saas_pos/internal/product"
	"saas_pos/internal/purchase"
	"saas_pos/internal/retrait"
	"saas_pos/internal/sale"
	"saas_pos/internal/sale_return"
	"saas_pos/internal/supplier"
	"saas_pos/internal/unit"

)

// ══════════════════════════════════════════════════════════════════════════════
//
//	PRODUCT BUSINESS SCENARIOS
//
// ══════════════════════════════════════════════════════════════════════════════

// Scenario: update product barcodes (add more, change existing)
func TestBiz_Product_UpdateBarcodes(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	cat, _ := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})

	p, err := product.Create(tenantID, product.CreateInput{
		Name: "Single Barcode", Barcodes: []string{"BAR001"},
		CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(), UnitID: un.ID.Hex(),
		PrixAchat: 10, PrixVente1: 20,
	})
	AssertNoError(t, err)
	AssertEqual(t, len(p.Barcodes), 1, "starts with 1 barcode")

	// Update to have 3 barcodes
	updated, err := product.Update(tenantID, p.ID.Hex(), product.UpdateInput{
		Name: "Multi Barcode", Barcodes: []string{"BAR001", "BAR002", "BAR003"},
		CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(), UnitID: un.ID.Hex(),
		PrixAchat: 10, PrixVente1: 20,
	})
	AssertNoError(t, err)
	AssertEqual(t, len(updated.Barcodes), 3, "updated to 3 barcodes")

	// All 3 barcodes should be searchable
	for _, bc := range []string{"BAR001", "BAR002", "BAR003"} {
		res, err := product.List(tenantID, bc, 1, 10)
		AssertNoError(t, err)
		AssertEqual(t, res.Total, int64(1), "barcode "+bc+" searchable")
	}
}

// Scenario: update product changes category and brand simultaneously
func TestBiz_Product_ChangeCategoryAndBrand(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	cat1, _ := category.Create(tenantID, category.CreateInput{Name: "Food"})
	cat2, _ := category.Create(tenantID, category.CreateInput{Name: "Drinks"})
	br1, _ := brand.Create(tenantID, brand.CreateInput{Name: "BrandA"})
	br2, _ := brand.Create(tenantID, brand.CreateInput{Name: "BrandB"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})

	p, err := product.Create(tenantID, product.CreateInput{
		Name: "Movable Product", CategoryID: cat1.ID.Hex(), BrandID: br1.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 10, PrixVente1: 20,
	})
	AssertNoError(t, err)

	// Change both category and brand
	updated, err := product.Update(tenantID, p.ID.Hex(), product.UpdateInput{
		Name: "Movable Product", CategoryID: cat2.ID.Hex(), BrandID: br2.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 10, PrixVente1: 20,
	})
	AssertNoError(t, err)
	AssertEqual(t, updated.CategoryID, cat2.ID, "category changed")
	AssertEqual(t, updated.BrandID, br2.ID, "brand changed")

	// Should appear in new category filter, not old
	res, err := product.List(tenantID, "", 1, 10, cat2.ID.Hex())
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(1), "found in new category")

	res, err = product.List(tenantID, "", 1, 10, cat1.ID.Hex())
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(0), "not found in old category")
}

// ══════════════════════════════════════════════════════════════════════════════
//
//	SALE BUSINESS SCENARIOS
//
// ══════════════════════════════════════════════════════════════════════════════

// Scenario: sale with VAT=0 product — no tax should be added
func TestBiz_Sale_ZeroVAT(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	cat, _ := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})

	p, err := product.Create(tenantID, product.CreateInput{
		Name: "NoVAT Product", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 50, PrixAchat: 10, PrixVente1: 20, VAT: 0,
	})
	AssertNoError(t, err)

	s, err := sale.Create(tenantID, userID, "u@test.local", sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: p.ID.Hex(), Qty: 5, UnitPrice: 20}},
		PaymentMethod: "cash", AmountPaid: 100, SaleType: "cash",
	})
	AssertNoError(t, err)

	// total = 5*20 = 100, no VAT
	AssertFloatEqual(t, s.Total, 100, "total = 100 (no VAT)")
	AssertFloatEqual(t, s.TotalHT, 100, "HT = TTC when VAT=0")
	AssertFloatEqual(t, s.TotalVAT, 0, "VAT = 0")
}

// Scenario: sale list filtered by reference
func TestBiz_Sale_ListFilterByRef(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	cat, _ := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})

	p, _ := product.Create(tenantID, product.CreateInput{
		Name: "RefSearch", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 100, PrixAchat: 10, PrixVente1: 20,
	})

	// Create 3 sales
	s1, err := sale.Create(tenantID, userID, "u@test.local", sale.CreateInput{
		Lines: []sale.SaleLineInput{{ProductID: p.ID.Hex(), Qty: 1, UnitPrice: 20}},
		PaymentMethod: "cash", AmountPaid: 20, SaleType: "cash",
	})
	AssertNoError(t, err)

	_, err = sale.Create(tenantID, userID, "u@test.local", sale.CreateInput{
		Lines: []sale.SaleLineInput{{ProductID: p.ID.Hex(), Qty: 1, UnitPrice: 20}},
		PaymentMethod: "cash", AmountPaid: 20, SaleType: "cash",
	})
	AssertNoError(t, err)

	now := time.Now()
	from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	to := from.Add(24 * time.Hour)

	// Search by specific ref
	result, err := sale.List(tenantID, from, to, 1, 10, s1.Ref)
	AssertNoError(t, err)
	AssertEqual(t, result.Total, int64(1), "search by ref finds exactly 1")

	// Empty ref returns all
	result, err = sale.List(tenantID, from, to, 1, 10, "")
	AssertNoError(t, err)
	AssertTrue(t, result.Total >= 2, "empty ref returns all sales")
}

// Scenario: multi-product sale with mixed VAT rates
func TestBiz_Sale_MixedVATProducts(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	cat, _ := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})

	// Product A: VAT=19
	pA, _ := product.Create(tenantID, product.CreateInput{
		Name: "VAT19", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 50, PrixAchat: 10, PrixVente1: 100, VAT: 19,
	})

	// Product B: VAT=0
	pB, _ := product.Create(tenantID, product.CreateInput{
		Name: "VAT0", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 50, PrixAchat: 5, PrixVente1: 50, VAT: 0,
	})

	s, err := sale.Create(tenantID, userID, "u@test.local", sale.CreateInput{
		Lines: []sale.SaleLineInput{
			{ProductID: pA.ID.Hex(), Qty: 2, UnitPrice: 100}, // 200 HT + 38 VAT = 238 TTC
			{ProductID: pB.ID.Hex(), Qty: 3, UnitPrice: 50},  // 150 HT + 0 VAT = 150 TTC
		},
		PaymentMethod: "cash", AmountPaid: 400, SaleType: "cash",
	})
	AssertNoError(t, err)

	// Total TTC = 238 + 150 = 388
	AssertFloatEqual(t, s.TotalHT, 350, "HT = 200+150 = 350")
	AssertFloatEqual(t, s.TotalVAT, 38, "VAT = 38 (only product A)")
	AssertFloatEqual(t, s.Total, 388, "TTC = 388")
}

// ══════════════════════════════════════════════════════════════════════════════
//
//	PURCHASE BUSINESS SCENARIOS
//
// ══════════════════════════════════════════════════════════════════════════════

// Scenario: delete draft purchase allowed, delete validated purchase rejected
func TestBiz_Purchase_DeleteDraftOnly(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "p@test.local"
	cat, _ := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})

	sup, _ := supplier.Create(tenantID, supplier.CreateInput{Name: "Sup", Phone: "050"})
	p, _ := product.Create(tenantID, product.CreateInput{
		Name: "DelProd", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 10, PrixVente1: 20,
	})

	// Draft purchase — should be deletable
	draft, err := purchase.Create(tenantID, userID, userEmail, purchase.CreateInput{
		SupplierID: sup.ID.Hex(),
		Lines:      []purchase.LineInput{{ProductID: p.ID.Hex(), Qty: 5, PrixAchat: 10}},
	})
	AssertNoError(t, err)
	err = purchase.Delete(tenantID, draft.ID.Hex())
	AssertNoError(t, err)

	// Validated purchase — should NOT be deletable
	validated, err := purchase.Create(tenantID, userID, userEmail, purchase.CreateInput{
		SupplierID: sup.ID.Hex(),
		Lines:      []purchase.LineInput{{ProductID: p.ID.Hex(), Qty: 5, PrixAchat: 10}},
	})
	AssertNoError(t, err)
	_, err = purchase.Validate(tenantID, validated.ID.Hex(), userID, userEmail, &purchase.ValidateInput{
		Lines: []purchase.ValidateLineInput{{ProductID: p.ID.Hex(), ReceivedQty: 5}},
	})
	AssertNoError(t, err)

	err = purchase.Delete(tenantID, validated.ID.Hex())
	AssertError(t, err)
	AssertErrorContains(t, err, "only draft")
}

// Scenario: purchase list filtered by status and supplier
func TestBiz_Purchase_ListFilters(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "p@test.local"
	cat, _ := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})

	sup1, _ := supplier.Create(tenantID, supplier.CreateInput{Name: "Supplier Alpha", Phone: "050"})
	sup2, _ := supplier.Create(tenantID, supplier.CreateInput{Name: "Supplier Beta", Phone: "051"})
	p, _ := product.Create(tenantID, product.CreateInput{
		Name: "FilterProd", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 10, PrixVente1: 20,
	})

	// Create draft for sup1
	_, err := purchase.Create(tenantID, userID, userEmail, purchase.CreateInput{
		SupplierID: sup1.ID.Hex(),
		Lines:      []purchase.LineInput{{ProductID: p.ID.Hex(), Qty: 5, PrixAchat: 10}},
	})
	AssertNoError(t, err)

	// Create and validate for sup2
	purch2, err := purchase.Create(tenantID, userID, userEmail, purchase.CreateInput{
		SupplierID: sup2.ID.Hex(),
		Lines:      []purchase.LineInput{{ProductID: p.ID.Hex(), Qty: 3, PrixAchat: 10}},
	})
	AssertNoError(t, err)
	_, err = purchase.Validate(tenantID, purch2.ID.Hex(), userID, userEmail, &purchase.ValidateInput{
		Lines: []purchase.ValidateLineInput{{ProductID: p.ID.Hex(), ReceivedQty: 3}},
	})
	AssertNoError(t, err)

	// Filter by supplier1 only
	res, err := purchase.List(tenantID, sup1.ID.Hex(), "", "", "", "", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(1), "1 purchase for supplier1")

	// Filter by status=draft
	res, err = purchase.List(tenantID, "", "draft", "", "", "", 1, 10)
	AssertNoError(t, err)
	AssertTrue(t, res.Total >= 1, "at least 1 draft purchase")

	// Filter by status=validated
	res, err = purchase.List(tenantID, "", "validated", "", "", "", 1, 10)
	AssertNoError(t, err)
	AssertTrue(t, res.Total >= 1, "at least 1 validated purchase")
}

// Scenario: partial validation then second validation for remaining
func TestBiz_Purchase_TwoPartialValidations(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "p@test.local"
	cat, _ := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})

	sup, _ := supplier.Create(tenantID, supplier.CreateInput{Name: "Sup", Phone: "050"})
	p, _ := product.Create(tenantID, product.CreateInput{
		Name: "PartialProd", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 10, PrixVente1: 20,
	})
	productID := p.ID.Hex()

	purch, err := purchase.Create(tenantID, userID, userEmail, purchase.CreateInput{
		SupplierID: sup.ID.Hex(),
		Lines:      []purchase.LineInput{{ProductID: productID, Qty: 10, PrixAchat: 10}},
	})
	AssertNoError(t, err)

	// First validation: receive 6 of 10
	_, err = purchase.Validate(tenantID, purch.ID.Hex(), userID, userEmail, &purchase.ValidateInput{
		Lines: []purchase.ValidateLineInput{{ProductID: productID, ReceivedQty: 6}},
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 6, "stock after 1st partial validation")

	// Second validation: receive remaining 4
	_, err = purchase.Validate(tenantID, purch.ID.Hex(), userID, userEmail, &purchase.ValidateInput{
		Lines: []purchase.ValidateLineInput{{ProductID: productID, ReceivedQty: 4}},
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 10, "stock after 2nd validation = 6+4=10")
}

// ══════════════════════════════════════════════════════════════════════════════
//
//	DISCOUNT BUSINESS SCENARIOS
//
// ══════════════════════════════════════════════════════════════════════════════

// Scenario: fixed-amount discount (not percentage)
func TestBiz_Discount_FixedAmount(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	cat, _ := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})

	p, _ := product.Create(tenantID, product.CreateInput{
		Name: "FixedDisc", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 50, PrixAchat: 10, PrixVente1: 100,
	})

	_, err := discount.Create(tenantID, discount.CreateInput{
		ProductID: p.ID.Hex(),
		Type:      "fixed",
		Value:     25, // 25 DA flat discount
		MinQty:    3,
	})
	AssertNoError(t, err)

	rule := discount.GetApplicable(tenantID, p.ID, 5, time.Now())
	AssertTrue(t, rule != nil, "fixed discount applicable at qty=5")
	AssertEqual(t, rule.Type, "fixed", "discount type is fixed")
	AssertFloatEqual(t, rule.Value, 25, "fixed discount = 25 DA")
}

// Scenario: update discount rule (change type, deactivate)
func TestBiz_Discount_UpdateAndDeactivate(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	cat, _ := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})

	p, _ := product.Create(tenantID, product.CreateInput{
		Name: "UpdDisc", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 50, PrixAchat: 10, PrixVente1: 100,
	})

	r, err := discount.Create(tenantID, discount.CreateInput{
		ProductID: p.ID.Hex(), Type: "percentage", Value: 10, MinQty: 1,
	})
	AssertNoError(t, err)

	// Update: change type to fixed, value to 50
	updated, err := discount.Update(tenantID, r.ID.Hex(), discount.UpdateInput{
		Type: "fixed", Value: 50, MinQty: 1, Active: true,
	})
	AssertNoError(t, err)
	AssertEqual(t, updated.Type, "fixed", "type changed to fixed")
	AssertFloatEqual(t, updated.Value, 50, "value changed to 50")

	// Deactivate
	deactivated, err := discount.Update(tenantID, r.ID.Hex(), discount.UpdateInput{
		Type: "fixed", Value: 50, MinQty: 1, Active: false,
	})
	AssertNoError(t, err)
	AssertFalse(t, deactivated.Active, "discount deactivated")

	// Deactivated discount should NOT be applicable
	rule := discount.GetApplicable(tenantID, p.ID, 5, time.Now())
	AssertTrue(t, rule == nil, "deactivated discount not applicable")
}

// Scenario: delete discount rule
func TestBiz_Discount_Delete(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	cat, _ := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})

	p, _ := product.Create(tenantID, product.CreateInput{
		Name: "DelDisc", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 10, PrixVente1: 100,
	})

	r, err := discount.Create(tenantID, discount.CreateInput{
		ProductID: p.ID.Hex(), Type: "percentage", Value: 10, MinQty: 1,
	})
	AssertNoError(t, err)

	err = discount.Delete(tenantID, r.ID.Hex())
	AssertNoError(t, err)

	// Should have 0 rules now
	rules, err := discount.ListByProduct(tenantID, p.ID.Hex())
	AssertNoError(t, err)
	AssertEqual(t, len(rules), 0, "no rules after delete")
}

// Scenario: discount with future start date should NOT apply today
func TestBiz_Discount_FutureStartDate(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	cat, _ := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})

	p, _ := product.Create(tenantID, product.CreateInput{
		Name: "FutureDisc", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 10, PrixVente1: 100,
	})

	futureStart := "2099-01-01"
	_, err := discount.Create(tenantID, discount.CreateInput{
		ProductID: p.ID.Hex(), Type: "percentage", Value: 50, MinQty: 1,
		StartDate: &futureStart,
	})
	AssertNoError(t, err)

	// Should NOT be applicable today
	rule := discount.GetApplicable(tenantID, p.ID, 5, time.Now())
	AssertTrue(t, rule == nil, "future start date discount not applicable today")
}

// Scenario: invalid discount type rejected
func TestBiz_Discount_InvalidType(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	cat, _ := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})

	p, _ := product.Create(tenantID, product.CreateInput{
		Name: "BadDisc", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 10, PrixVente1: 100,
	})

	_, err := discount.Create(tenantID, discount.CreateInput{
		ProductID: p.ID.Hex(), Type: "invalid_type", Value: 10, MinQty: 1,
	})
	AssertError(t, err)
	AssertErrorContains(t, err, "type must be percentage or fixed")
}

// ══════════════════════════════════════════════════════════════════════════════
//
//	CLIENT BUSINESS SCENARIOS
//
// ══════════════════════════════════════════════════════════════════════════════

// Scenario: client list search by name and phone
func TestBiz_Client_ListSearch(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)

	_, err := client.Create(tenantID, client.ClientInput{Name: "Ahmed Benali", Phone: "0555111222"})
	AssertNoError(t, err)
	_, err = client.Create(tenantID, client.ClientInput{Name: "Mohamed Khaled", Phone: "0666333444"})
	AssertNoError(t, err)

	// Search by name
	res, err := client.List(tenantID, "Ahmed", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(1), "search 'Ahmed' finds 1")

	// Search by phone
	res, err = client.List(tenantID, "0666", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(1), "search by phone finds 1")

	// Empty search returns all
	res, err = client.List(tenantID, "", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(2), "empty search returns all 2")
}

// Scenario: client delete with no history = hard delete, with history = archive
func TestBiz_Client_DeleteBehavior(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)

	// Client with no history — hard delete
	cl1, err := client.Create(tenantID, client.ClientInput{Name: "No History", Phone: "050"})
	AssertNoError(t, err)
	_, err = client.Delete(tenantID, cl1.ID.Hex())
	AssertNoError(t, err)

	// Client with balance — cannot delete
	cl2, err := client.Create(tenantID, client.ClientInput{Name: "Has Balance", Phone: "051"})
	AssertNoError(t, err)
	_ = client.AdjustBalance(tenantID, cl2.ID.Hex(), 100)

	_, err = client.Delete(tenantID, cl2.ID.Hex())
	AssertError(t, err)
}

// Scenario: client statement shows all transactions with running balance
func TestBiz_Client_StatementRunningBalance(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	cat, _ := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})

	p, _ := product.Create(tenantID, product.CreateInput{
		Name: "StmtProd", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 100, PrixAchat: 10, PrixVente1: 100, VAT: 0,
	})

	cl, err := client.Create(tenantID, client.ClientInput{Name: "Statement Client", Phone: "050"})
	AssertNoError(t, err)

	// Credit sale: 500
	_, err = sale.Create(tenantID, userID, "u@test.local", sale.CreateInput{
		Lines: []sale.SaleLineInput{{ProductID: p.ID.Hex(), Qty: 5, UnitPrice: 100}},
		PaymentMethod: "cash", AmountPaid: 0, ClientID: cl.ID.Hex(),
		SaleType: "credit",
	})
	AssertNoError(t, err)

	// Payment: 200
	_, err = client.AddPayment(tenantID, cl.ID.Hex(), client.PaymentInput{Amount: 200})
	AssertNoError(t, err)

	// Check statement
	entries, err := client.GetStatement(tenantID, cl.ID.Hex())
	AssertNoError(t, err)
	AssertTrue(t, len(entries) >= 2, "at least 2 entries in statement")
	// Final balance should be 300 (500-200)
	AssertFloatEqual(t, GetClientBalance(t, tenantID, cl.ID.Hex()), 300, "balance = 300")
}

// ══════════════════════════════════════════════════════════════════════════════
//
//	CAISSE BUSINESS SCENARIOS
//
// ══════════════════════════════════════════════════════════════════════════════

// Scenario: caisse history lists all closed sessions
func TestBiz_Caisse_History(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "c@test.local"

	// Session 1
	_, err := caisse.Open(tenantID, userID, userEmail, caisse.OpenInput{OpeningAmount: 100})
	AssertNoError(t, err)
	_, err = caisse.Close(tenantID, userID, caisse.CloseInput{ClosingAmount: 150})
	AssertNoError(t, err)

	// Session 2
	_, err = caisse.Open(tenantID, userID, userEmail, caisse.OpenInput{OpeningAmount: 200})
	AssertNoError(t, err)
	_, err = caisse.Close(tenantID, userID, caisse.CloseInput{ClosingAmount: 300})
	AssertNoError(t, err)

	history, _, err := caisse.ListHistory(tenantID, 1, 10)
	AssertNoError(t, err)
	AssertTrue(t, len(history) >= 2, "at least 2 sessions in history")
}

// ══════════════════════════════════════════════════════════════════════════════
//
//	EXPENSE & RETRAIT BUSINESS SCENARIOS
//
// ══════════════════════════════════════════════════════════════════════════════

// Scenario: expense pro-rata calculation for partial overlap
func TestBiz_Expense_ProRata(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)

	// Monthly rent: 3100 DA for March (31 days) → 100 DA/day
	_, err := expense.Create(tenantID, expense.CreateInput{
		Label: "Rent", Amount: 3100, DateFrom: "2026-03-01", DateTo: "2026-03-31",
	})
	AssertNoError(t, err)

	// Query for first 10 days of March → should be ~1000 DA
	from, _ := time.Parse("2006-01-02", "2026-03-01")
	to, _ := time.Parse("2006-01-02", "2026-03-10")
	to = to.Add(24*time.Hour - time.Second)

	sum, err := expense.SumForPeriod(tenantID, from, to)
	AssertNoError(t, err)
	AssertFloatEqual(t, sum, 1000, "10 days of 3100/31 = 1000")
}

// Scenario: retrait list and sum
func TestBiz_Retrait_ListAndSum(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "r@test.local"

	_, err := retrait.Create(tenantID, userID, userEmail, retrait.CreateInput{Amount: 300, Reason: "cash out 1"})
	AssertNoError(t, err)
	_, err = retrait.Create(tenantID, userID, userEmail, retrait.CreateInput{Amount: 200, Reason: "cash out 2"})
	AssertNoError(t, err)

	now := time.Now()
	from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	to := from.Add(24 * time.Hour)

	result, err := retrait.List(tenantID, from, to, 1, 10)
	AssertNoError(t, err)
	AssertTrue(t, result.Total >= 2, "at least 2 retraits")

	sum, err := retrait.SumForPeriod(tenantID, from, to)
	AssertNoError(t, err)
	AssertFloatEqual(t, sum, 500, "retrait sum = 300+200 = 500")
}

// ══════════════════════════════════════════════════════════════════════════════
//
//	SUPPLIER BUSINESS SCENARIOS
//
// ══════════════════════════════════════════════════════════════════════════════

// Scenario: supplier list search by name
func TestBiz_Supplier_ListSearch(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)

	_, err := supplier.Create(tenantID, supplier.CreateInput{Name: "Alpha Supplies", Phone: "050"})
	AssertNoError(t, err)
	_, err = supplier.Create(tenantID, supplier.CreateInput{Name: "Beta Trading", Phone: "051"})
	AssertNoError(t, err)

	res, err := supplier.List(tenantID, "Alpha", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(1), "search 'Alpha' finds 1")

	res, err = supplier.List(tenantID, "", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(2), "empty search returns all")
}

// ══════════════════════════════════════════════════════════════════════════════
//
//	FULL JOURNEY: CREATE → PURCHASE → SELL → RETURN → LOSS → CLOSE
//
// ══════════════════════════════════════════════════════════════════════════════

// Scenario: the exact user journey from the requirements
func TestBiz_FullJourney(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "journey@test.local"

	cat, _ := category.Create(tenantID, category.CreateInput{Name: "General"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})

	// ── Step 1: Create product (PA=10, PV3=20, barcode)
	p, err := product.Create(tenantID, product.CreateInput{
		Name: "Journey Product", Barcodes: []string{"JOURNEY001"},
		CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(), UnitID: un.ID.Hex(),
		PrixAchat: 10, PrixVente1: 20, PrixVente2: 18, PrixVente3: 20, VAT: 0,
	})
	AssertNoError(t, err)
	productID := p.ID.Hex()
	AssertStock(t, tenantID, productID, 0, "Step 1: initial stock = 0")

	sup, _ := supplier.Create(tenantID, supplier.CreateInput{Name: "Journey Supplier", Phone: "050"})

	// ── Step 2: Purchase 10 units @10
	purch, err := purchase.Create(tenantID, userID, userEmail, purchase.CreateInput{
		SupplierID: sup.ID.Hex(),
		Lines:      []purchase.LineInput{{ProductID: productID, Qty: 10, PrixAchat: 10}},
	})
	AssertNoError(t, err)
	_, err = purchase.Validate(tenantID, purch.ID.Hex(), userID, userEmail, &purchase.ValidateInput{
		Lines: []purchase.ValidateLineInput{{ProductID: productID, ReceivedQty: 10}},
	})
	AssertNoError(t, err)

	// ── Step 3: Check movement = purchase +10
	mov, err := product.ListMovements(tenantID, productID, "", "", 1, 50)
	AssertNoError(t, err)
	AssertTrue(t, mov.Total >= 1, "Step 3: at least 1 movement")
	AssertStock(t, tenantID, productID, 10, "Step 3: stock = 10")

	// ── Step 4: Update prices (PA=12, PV3=25)
	_, err = product.Update(tenantID, productID, product.UpdateInput{
		Name: "Journey Product", Barcodes: []string{"JOURNEY001"},
		CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(), UnitID: un.ID.Hex(),
		PrixAchat: 12, PrixVente1: 25, PrixVente2: 22, PrixVente3: 25,
	})
	AssertNoError(t, err)
	AssertFloatEqual(t, GetProductPrixAchat(t, tenantID, productID), 12, "Step 4: PA updated to 12")

	// ── Step 5: Search by text and barcode
	res, err := product.List(tenantID, "Journey", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(1), "Step 5: search by name works")

	res, err = product.List(tenantID, "JOURNEY001", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, res.Total, int64(1), "Step 5: search by barcode works")

	// ── Step 6: Purchase 2 more products (multiple items)
	p2, _ := product.Create(tenantID, product.CreateInput{
		Name: "Journey Product 2", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 5, PrixVente1: 15,
	})

	purch2, err := purchase.Create(tenantID, userID, userEmail, purchase.CreateInput{
		SupplierID: sup.ID.Hex(),
		Lines: []purchase.LineInput{
			{ProductID: productID, Qty: 5, PrixAchat: 12},
			{ProductID: p2.ID.Hex(), Qty: 8, PrixAchat: 5},
		},
	})
	AssertNoError(t, err)
	_, err = purchase.Validate(tenantID, purch2.ID.Hex(), userID, userEmail, &purchase.ValidateInput{
		Lines: []purchase.ValidateLineInput{
			{ProductID: productID, ReceivedQty: 5},
			{ProductID: p2.ID.Hex(), ReceivedQty: 8},
		},
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 15, "Step 6: stock = 10+5 = 15")
	AssertStock(t, tenantID, p2.ID.Hex(), 8, "Step 6: product2 stock = 8")

	// ── Step 7: Purchase on credit (don't pay yet)
	purch3, err := purchase.Create(tenantID, userID, userEmail, purchase.CreateInput{
		SupplierID: sup.ID.Hex(),
		Lines:      []purchase.LineInput{{ProductID: productID, Qty: 3, PrixAchat: 12}},
	})
	AssertNoError(t, err)
	_, err = purchase.Validate(tenantID, purch3.ID.Hex(), userID, userEmail, &purchase.ValidateInput{
		Lines: []purchase.ValidateLineInput{{ProductID: productID, ReceivedQty: 3}},
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 18, "Step 7: stock = 15+3 = 18")

	// ── Step 8: Partial payment of purchase
	_, err = purchase.Pay(tenantID, purch3.ID.Hex(), userID, purchase.PayInput{Amount: 20, Note: "partial"})
	AssertNoError(t, err)

	// ── Step 9: Full payment of remaining
	_, err = purchase.Pay(tenantID, purch3.ID.Hex(), userID, purchase.PayInput{Amount: 16, Note: "full"})
	AssertNoError(t, err)

	// ── Step 10: Return 2 items to supplier
	_, err = purchase.Return(tenantID, purch3.ID.Hex(), userID, userEmail,
		[]purchase.ValidateLineInput{{ProductID: productID, ReceivedQty: 2}},
	)
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 16, "Step 10: stock = 18-2 = 16")

	// ── Step 11: Record loss
	_, err = loss.Create(tenantID, loss.CreateInput{
		ProductID: productID, Type: "casse", Qty: 1, Remark: "broken",
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 15, "Step 11: stock = 16-1 = 15")

	// Loss in movement history
	mov, err = product.ListMovements(tenantID, productID, "", "", 1, 50)
	AssertNoError(t, err)
	foundLoss := false
	for _, m := range mov.Items {
		if m.Type == "loss" {
			foundLoss = true
		}
	}
	AssertTrue(t, foundLoss, "Step 11: loss in movement history")

	// ── Step 12: Open caisse with 100
	session, err := caisse.Open(tenantID, userID, userEmail, caisse.OpenInput{OpeningAmount: 100})
	AssertNoError(t, err)

	// ── Step 13: Sale 3 items @25
	s1, err := sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: productID, Qty: 3, UnitPrice: 25}},
		PaymentMethod: "cash", AmountPaid: 75, SaleType: "cash",
		CaisseID: session.ID.Hex(),
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 12, "Step 13: stock = 15-3 = 12")

	// ── Step 14: Close caisse with WRONG amount
	_, err = caisse.Close(tenantID, userID, caisse.CloseInput{ClosingAmount: 150})
	AssertNoError(t, err)

	// ── Step 15: Check user summary — ecart should be negative
	now := time.Now()
	from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	to := from.Add(24 * time.Hour)

	summary, err := sale.UserSummary(tenantID, from, to, "", "")
	AssertNoError(t, err)
	AssertTrue(t, len(summary.Users) > 0, "Step 15: user summary has entries")

	var userLine *sale.UserSummaryLine
	for i := range summary.Users {
		if summary.Users[i].UserID == userID {
			userLine = &summary.Users[i]
			break
		}
	}
	AssertTrue(t, userLine != nil, "Step 15: found user in summary")
	AssertTrue(t, userLine.SalesCount >= 1, "Step 15: at least 1 sale")
	// Expected cash = opening(100) + sales(75) = 175, actual=150 → ecart=-25
	AssertFloatEqual(t, userLine.Ecart, -25, "Step 15: ecart = -25")

	// ── Step 16: Check statistics
	stats, err := sale.SalesStatistics(tenantID, from, to, true)
	AssertNoError(t, err)
	AssertTrue(t, stats.SalesCount >= 1, "Step 16: at least 1 sale in stats")
	AssertTrue(t, stats.RevenueTTC > 0, "Step 16: revenue > 0")
	AssertTrue(t, stats.LossCost > 0, "Step 16: loss cost > 0")

	// ── Step 17: Delete product with sales → should archive
	archived, err := product.Delete(tenantID, productID)
	AssertNoError(t, err)
	AssertTrue(t, archived, "Step 17: product archived (has sales)")

	// ── Step 18: Adjustment on product 2 (correct inventory)
	_, err = adjustment.Create(tenantID, userID, userEmail, adjustment.CreateInput{
		ProductID: p2.ID.Hex(), QtyAfter: 10, Reason: "found extra stock",
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, p2.ID.Hex(), 10, "Step 18: product2 adjusted to 10")

	// ── Step 19: Sale return
	_, err = sale_return.Create(tenantID, userID, userEmail, s1.ID.Hex(), sale_return.CreateInput{
		Lines: []sale_return.ReturnLineInput{{ProductID: productID, Qty: 1, Reason: "defective"}},
	})
	AssertNoError(t, err)

	_ = s1
}
