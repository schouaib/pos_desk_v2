package testutil

import (
	"testing"
	"time"

	"saas_pos/internal/adjustment"
	"saas_pos/internal/batch"
	"saas_pos/internal/brand"
	"saas_pos/internal/caisse"
	"saas_pos/internal/category"
	"saas_pos/internal/client"
	"saas_pos/internal/discount"
	"saas_pos/internal/expense"
	"saas_pos/internal/facturation"
	"saas_pos/internal/location"
	"saas_pos/internal/loss"
	"saas_pos/internal/product"
	"saas_pos/internal/purchase"
	"saas_pos/internal/retrait"
	"saas_pos/internal/sale"
	"saas_pos/internal/sale_return"
	"saas_pos/internal/supplier"
	"saas_pos/internal/transfer"
	"saas_pos/internal/unit"
	"saas_pos/internal/variant"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ---------- Test 1: Sale with qty=0 ----------

func TestEdge_SaleQtyZero(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")

	p, err := product.Create(tenantID, product.CreateInput{
		Name:       "Item",
		PrixAchat:  10,
		PrixVente1: 20,
	})
	AssertNoError(t, err)

	_, err = sale.Create(tenantID, userID, "u@test.local", sale.CreateInput{
		Lines: []sale.SaleLineInput{
			{ProductID: p.ID.Hex(), Qty: 0, UnitPrice: 20},
		},
		PaymentMethod: "cash",
		AmountPaid:    0,
		SaleType:      "cash",
	})
	AssertErrorContains(t, err, "qty must not be zero")
}

// ---------- Test 2: Sale discount exceeds line total ----------

func TestEdge_SaleDiscountExceeds(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")

	p, err := product.Create(tenantID, product.CreateInput{
		Name:         "Item",
		PrixAchat:    10,
		PrixVente1:   20,
		QtyAvailable: 10,
	})
	AssertNoError(t, err)

	// Discount of 999 on a line of qty=1 * price=20 is capped to line total (20).
	// The sale should succeed with total capped to 0 (discount = lineTotal).
	s, err := sale.Create(tenantID, userID, "u@test.local", sale.CreateInput{
		Lines: []sale.SaleLineInput{
			{ProductID: p.ID.Hex(), Qty: 1, UnitPrice: 20, Discount: 999},
		},
		PaymentMethod: "cash",
		AmountPaid:    0,
		SaleType:      "cash",
	})
	AssertNoError(t, err)
	// The TotalHT should be 0 because discount was capped to qty*price
	AssertFloatEqual(t, s.TotalHT, 0, "total HT should be 0 when discount >= line total")
}

// ---------- Test 3: Purchase with no lines ----------

func TestEdge_PurchaseNoLines(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")

	// Create a valid supplier so the supplier lookup passes
	sup, err := supplier.Create(tenantID, supplier.CreateInput{
		Name:  "Test Supplier",
		Phone: "0555000000",
	})
	AssertNoError(t, err)

	// Purchase with empty lines -- the service creates a purchase with zero lines.
	// Verify it either errors or creates with 0 lines.
	p, err := purchase.Create(tenantID, userID, "u@test.local", purchase.CreateInput{
		SupplierID: sup.ID.Hex(),
		Lines:      []purchase.LineInput{},
	})
	if err != nil {
		// If the service rejects empty lines, that is acceptable
		AssertError(t, err)
	} else {
		// If it succeeds, it should have 0 lines and 0 total
		AssertEqual(t, len(p.Lines), 0, "purchase should have 0 lines")
		AssertFloatEqual(t, p.Total, 0, "purchase total should be 0 with no lines")
	}
}

// ---------- Test 4: Return on non-existent sale ----------

func TestEdge_ReturnNonexistentSale(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")

	fakeSaleID := primitive.NewObjectID().Hex()
	_, err := sale_return.Create(tenantID, userID, "u@test.local", fakeSaleID, sale_return.CreateInput{
		Lines: []sale_return.ReturnLineInput{
			{ProductID: primitive.NewObjectID().Hex(), Qty: 1, Reason: "test"},
		},
	})
	AssertErrorContains(t, err, "sale not found")
}

// ---------- Test 5: Expense with DateTo before DateFrom ----------

func TestEdge_ExpenseInvalidDates(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)

	_, err := expense.Create(tenantID, expense.CreateInput{
		Label:    "Rent",
		Amount:   1000,
		DateFrom: "2025-06-15",
		DateTo:   "2025-06-01",
	})
	AssertErrorContains(t, err, "date_to must be >= date_from")
}

// ---------- Test 6: Loss with qty=0 ----------

func TestEdge_LossQtyZero(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)

	p, err := product.Create(tenantID, product.CreateInput{
		Name:       "Item",
		PrixAchat:  10,
		PrixVente1: 20,
	})
	AssertNoError(t, err)

	_, err = loss.Create(tenantID, loss.CreateInput{
		ProductID: p.ID.Hex(),
		Type:      "vol",
		Qty:       0,
		Remark:    "test",
	})
	AssertErrorContains(t, err, "qty must be positive")
}

// ---------- Test 7: Transfer with from == to location ----------

func TestEdge_TransferSameLocation(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")

	locID := primitive.NewObjectID().Hex()
	_, err := transfer.Create(tenantID, userID, "u@test.local", transfer.CreateInput{
		FromLocationID: locID,
		ToLocationID:   locID,
		Lines: []transfer.TransferLineInput{
			{ProductID: primitive.NewObjectID().Hex(), Qty: 1},
		},
	})
	AssertErrorContains(t, err, "from and to locations must be different")
}

// ---------- Test 8: Delete client with balance > 0 (should archive) ----------

func TestEdge_DeleteClientWithBalance(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")

	// Create a client
	cl, err := client.Create(tenantID, client.ClientInput{
		Name:  "Debtor Client",
		Phone: "0555111111",
	})
	AssertNoError(t, err)

	// Create a product and make a credit sale to give the client a balance
	p, err := product.Create(tenantID, product.CreateInput{
		Name:         "Item",
		PrixAchat:    10,
		PrixVente1:   20,
		QtyAvailable: 10,
	})
	AssertNoError(t, err)

	_, err = sale.Create(tenantID, userID, "u@test.local", sale.CreateInput{
		Lines: []sale.SaleLineInput{
			{ProductID: p.ID.Hex(), Qty: 1, UnitPrice: 20},
		},
		PaymentMethod: "cash",
		AmountPaid:    20,
		SaleType:      "credit",
		ClientID:      cl.ID.Hex(),
	})
	AssertNoError(t, err)

	// Delete should fail because client has outstanding balance
	_, err = client.Delete(tenantID, cl.ID.Hex())
	AssertError(t, err)
}

// ---------- Test 9: Double open caisse ----------

func TestEdge_DoubleOpenCaisse(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")

	_, err := caisse.Open(tenantID, userID, "u@test.local", caisse.OpenInput{
		OpeningAmount: 1000,
	})
	AssertNoError(t, err)

	_, err = caisse.Open(tenantID, userID, "u@test.local", caisse.OpenInput{
		OpeningAmount: 2000,
	})
	AssertErrorContains(t, err, "session already open")
}

// ---------- Test 10: Monthly sales limit exceeded ----------

func TestEdge_SalesLimitExceeded(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenantWithLimits(t, 0, 0, 1)
	userID, _ := CreateUser(t, tenantID, "admin")

	p, err := product.Create(tenantID, product.CreateInput{
		Name:         "Item",
		PrixAchat:    10,
		PrixVente1:   20,
		QtyAvailable: 100,
	})
	AssertNoError(t, err)

	// First sale should succeed
	_, err = sale.Create(tenantID, userID, "u@test.local", sale.CreateInput{
		Lines: []sale.SaleLineInput{
			{ProductID: p.ID.Hex(), Qty: 1, UnitPrice: 20},
		},
		PaymentMethod: "cash",
		AmountPaid:    20,
		SaleType:      "cash",
	})
	AssertNoError(t, err)

	// Second sale should fail
	_, err = sale.Create(tenantID, userID, "u@test.local", sale.CreateInput{
		Lines: []sale.SaleLineInput{
			{ProductID: p.ID.Hex(), Qty: 1, UnitPrice: 20},
		},
		PaymentMethod: "cash",
		AmountPaid:    20,
		SaleType:      "cash",
	})
	AssertErrorContains(t, err, "monthly sales limit")
}

// ---------- Test 11: Product limit exceeded ----------

func TestEdge_ProductLimitExceeded(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenantWithLimits(t, 1, 0, 0)

	// First product should succeed
	_, err := product.Create(tenantID, product.CreateInput{
		Name:       "First Product",
		PrixAchat:  10,
		PrixVente1: 20,
	})
	AssertNoError(t, err)

	// Second product should fail
	_, err = product.Create(tenantID, product.CreateInput{
		Name:       "Second Product",
		PrixAchat:  10,
		PrixVente1: 20,
	})
	AssertErrorContains(t, err, "product limit")
}

// ---------- Test 12: Empty product name ----------

func TestEdge_EmptyProductName(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)

	_, err := product.Create(tenantID, product.CreateInput{
		Name:       "",
		PrixAchat:  10,
		PrixVente1: 20,
	})
	AssertErrorContains(t, err, "name is required")
}

// ══════════════════════════════════════════════════════════════════════════════
// Boundary & business logic discovery tests
// These tests probe real behavior to find bugs — they document what ACTUALLY
// happens, not what we assume should happen.
// ══════════════════════════════════════════════════════════════════════════════

// helper: creates a ready-to-sell product with stock
func edgeProduct(t *testing.T, tenantID string, qty float64) string {
	t.Helper()
	cat, _ := category.Create(tenantID, category.CreateInput{Name: "EdgeCat"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "EdgeBr"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Pc"})
	p, err := product.Create(tenantID, product.CreateInput{
		Name: "EdgeProd", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: qty, PrixAchat: 50, PrixVente1: 100, VAT: 0,
	})
	AssertNoError(t, err)
	return p.ID.Hex()
}

// ---------- Test 13: Sell more than stock (overselling) ----------

func TestEdge_OversellStock(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	prodID := edgeProduct(t, tenantID, 5) // only 5 in stock

	// Try to sell 10 — does the system allow it or reject it?
	_, err := sale.Create(tenantID, userID, "u@test.local", sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: prodID, Qty: 10, UnitPrice: 100}},
		PaymentMethod: "cash", AmountPaid: 1000, SaleType: "cash",
	})
	if err != nil {
		// System rejects overselling — good, verify stock unchanged
		AssertStock(t, tenantID, prodID, 5, "stock unchanged after rejected oversell")
	} else {
		// System allows overselling — stock goes negative, document this
		stock := GetProductStock(t, tenantID, prodID)
		t.Logf("WARNING: overselling allowed — stock went to %.0f (negative stock)", stock)
		AssertTrue(t, stock < 0, "stock is negative after oversell")
	}
}

// ---------- Test 14: Purchase pay more than owed ----------

func TestEdge_PurchaseOverpay(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	prodID := edgeProduct(t, tenantID, 0)

	sup, _ := supplier.Create(tenantID, supplier.CreateInput{Name: "EdgeSup", Phone: "0555000001"})

	purch, err := purchase.Create(tenantID, userID, "u@test.local", purchase.CreateInput{
		SupplierID: sup.ID.Hex(),
		Lines:      []purchase.LineInput{{ProductID: prodID, Qty: 5, PrixAchat: 50}},
	})
	AssertNoError(t, err)
	_, err = purchase.Validate(tenantID, purch.ID.Hex(), userID, "u@test.local", &purchase.ValidateInput{
		Lines: []purchase.ValidateLineInput{{ProductID: prodID, ReceivedQty: 5}},
	})
	AssertNoError(t, err)

	// Pay more than total
	_, err = purchase.Pay(tenantID, purch.ID.Hex(), userID, purchase.PayInput{
		Amount: purch.Total + 99999, Note: "overpay",
	})
	if err != nil {
		t.Logf("OK: overpay rejected — %v", err)
	} else {
		t.Logf("WARNING: overpay allowed — paid more than total")
	}
}

// ---------- Test 15: Facture pay more than owed ----------

func TestEdge_FactureOverpay(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	prodID := edgeProduct(t, tenantID, 50)

	cl, _ := client.Create(tenantID, client.ClientInput{Name: "OverpayClient", Phone: "0555000002"})

	fac, err := facturation.Create(tenantID, userID, "u@test.local", facturation.CreateInput{
		DocType: "facture", ClientID: cl.ID.Hex(),
		Lines: []facturation.LineInput{{ProductID: prodID, Qty: 2, UnitPrice: 100}},
	})
	AssertNoError(t, err)

	_, err = facturation.Pay(tenantID, fac.ID.Hex(), facturation.PayInput{
		Amount: fac.Total + 99999, PaymentMethod: "cash",
	})
	if err != nil {
		t.Logf("OK: facture overpay rejected — %v", err)
	} else {
		t.Logf("WARNING: facture overpay allowed")
	}
}

// ---------- Test 16: Avoir qty exceeds facture qty ----------

func TestEdge_AvoirExceedsFacture(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	prodID := edgeProduct(t, tenantID, 50)

	cl, _ := client.Create(tenantID, client.ClientInput{Name: "AvoirClient", Phone: "0555000003"})

	fac, err := facturation.Create(tenantID, userID, "u@test.local", facturation.CreateInput{
		DocType: "facture", ClientID: cl.ID.Hex(),
		Lines: []facturation.LineInput{{ProductID: prodID, Qty: 3, UnitPrice: 100}},
	})
	AssertNoError(t, err)

	// Try to create avoir for MORE than was on the facture
	_, err = facturation.CreateAvoir(tenantID, fac.ID.Hex(), userID, "u@test.local", facturation.AvoirInput{
		Lines: []facturation.AvoirLineInput{{ProductID: prodID, Qty: 999}},
	})
	AssertError(t, err) // should be rejected
	t.Logf("Avoir exceeds facture: %v", err)
}

// ---------- Test 17: Convert facture (invalid transition) ----------

func TestEdge_ConvertFactureInvalid(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	prodID := edgeProduct(t, tenantID, 50)

	cl, _ := client.Create(tenantID, client.ClientInput{Name: "ConvClient", Phone: "0555000004"})

	fac, err := facturation.Create(tenantID, userID, "u@test.local", facturation.CreateInput{
		DocType: "facture", ClientID: cl.ID.Hex(),
		Lines: []facturation.LineInput{{ProductID: prodID, Qty: 1, UnitPrice: 100}},
	})
	AssertNoError(t, err)

	// Cannot convert a facture to anything
	_, err = facturation.Convert(tenantID, fac.ID.Hex(), userID, "u@test.local", facturation.ConvertInput{})
	AssertErrorContains(t, err, "cannot convert")
}

// ---------- Test 18: Retrait negative amount ----------

func TestEdge_RetraitNegative(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")

	_, err := retrait.Create(tenantID, userID, "u@test.local", retrait.CreateInput{
		Amount: -500, Reason: "negative",
	})
	AssertError(t, err)
	t.Logf("Negative retrait: %v", err)
}

// ---------- Test 19: Caisse close without open ----------

func TestEdge_CaisseCloseWithoutOpen(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")

	_, err := caisse.Close(tenantID, userID, caisse.CloseInput{ClosingAmount: 1000})
	AssertError(t, err)
	t.Logf("Close without open: %v", err)
}

// ---------- Test 20: Caisse negative opening ----------

func TestEdge_CaisseNegativeOpening(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")

	_, err := caisse.Open(tenantID, userID, "u@test.local", caisse.OpenInput{OpeningAmount: -100})
	AssertErrorContains(t, err, "negative")
}

// ---------- Test 21: Adjustment to negative qty ----------

func TestEdge_AdjustmentNegativeQty(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	prodID := edgeProduct(t, tenantID, 10)

	_, err := adjustment.Create(tenantID, userID, "u@test.local", adjustment.CreateInput{
		ProductID: prodID, QtyAfter: -5, Reason: "negative adjust",
	})
	if err != nil {
		t.Logf("OK: negative adjustment rejected — %v", err)
	} else {
		stock := GetProductStock(t, tenantID, prodID)
		t.Logf("WARNING: negative adjustment allowed — stock=%.0f", stock)
	}
}

// ---------- Test 22: Loss more than stock ----------

func TestEdge_LossExceedsStock(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	prodID := edgeProduct(t, tenantID, 3)

	_, err := loss.Create(tenantID, loss.CreateInput{
		ProductID: prodID, Type: "vol", Qty: 100, Remark: "mass theft",
	})
	if err != nil {
		t.Logf("OK: loss > stock rejected — %v", err)
		AssertStock(t, tenantID, prodID, 3, "stock unchanged")
	} else {
		stock := GetProductStock(t, tenantID, prodID)
		t.Logf("WARNING: loss > stock allowed — stock=%.0f", stock)
	}
}

// ---------- Test 23: Transfer more than stock ----------

func TestEdge_TransferExceedsStock(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	prodID := edgeProduct(t, tenantID, 5)

	loc1, _ := location.Create(tenantID, location.CreateInput{Name: "A"})
	loc2, _ := location.Create(tenantID, location.CreateInput{Name: "B"})

	tr, err := transfer.Create(tenantID, userID, "u@test.local", transfer.CreateInput{
		FromLocationID: loc1.ID.Hex(), ToLocationID: loc2.ID.Hex(),
		Lines: []transfer.TransferLineInput{{ProductID: prodID, Qty: 999}},
	})
	if err != nil {
		t.Logf("OK: transfer > stock rejected at create — %v", err)
		return
	}
	_, err = transfer.Complete(tenantID, tr.ID.Hex())
	if err != nil {
		t.Logf("OK: transfer > stock rejected at complete — %v", err)
	} else {
		t.Logf("WARNING: transfer > stock allowed")
	}
}

// ---------- Test 24: Duplicate barcode across products ----------

func TestEdge_DuplicateBarcode(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	cat, _ := category.Create(tenantID, category.CreateInput{Name: "DupCat"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "DupBr"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Pc"})

	_, err := product.Create(tenantID, product.CreateInput{
		Name: "Prod1", Barcodes: []string{"SAME123"},
		CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(), UnitID: un.ID.Hex(),
		PrixAchat: 10, PrixVente1: 20,
	})
	AssertNoError(t, err)

	_, err = product.Create(tenantID, product.CreateInput{
		Name: "Prod2", Barcodes: []string{"SAME123"},
		CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(), UnitID: un.ID.Hex(),
		PrixAchat: 15, PrixVente1: 25,
	})
	if err != nil {
		t.Logf("OK: duplicate barcode rejected — %v", err)
	} else {
		t.Log("WARNING: duplicate barcode allowed — barcode scan may return wrong product")
	}
}

// ---------- Test 25: Client payment more than balance ----------

func TestEdge_ClientOverpay(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	prodID := edgeProduct(t, tenantID, 50)

	cl, _ := client.Create(tenantID, client.ClientInput{Name: "OverClient", Phone: "0555000005"})

	// Credit sale: total = 100 (1 x 100)
	_, err := sale.Create(tenantID, userID, "u@test.local", sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: prodID, Qty: 1, UnitPrice: 100}},
		PaymentMethod: "cash", AmountPaid: 0, ClientID: cl.ID.Hex(), SaleType: "credit",
	})
	AssertNoError(t, err)

	bal := GetClientBalance(t, tenantID, cl.ID.Hex())
	AssertTrue(t, bal > 0, "client has balance")

	// Try paying 10x the balance
	_, err = client.AddPayment(tenantID, cl.ID.Hex(), client.PaymentInput{
		Amount: bal * 10, Note: "overpay",
	})
	if err != nil {
		t.Logf("OK: client overpay rejected — %v", err)
	} else {
		newBal := GetClientBalance(t, tenantID, cl.ID.Hex())
		t.Logf("WARNING: client overpay allowed — balance went to %.2f", newBal)
	}
}

// ---------- Test 26: Discount overlapping rules ----------

func TestEdge_OverlappingDiscounts(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	prodID := edgeProduct(t, tenantID, 100)
	pid, _ := primitive.ObjectIDFromHex(prodID)

	// Rule 1: 10% off when qty >= 5
	_, err := discount.Create(tenantID, discount.CreateInput{
		ProductID: prodID, Type: "percentage", Value: 10, MinQty: 5,
	})
	AssertNoError(t, err)

	// Rule 2: 20% off when qty >= 3 (overlaps with rule 1)
	_, err = discount.Create(tenantID, discount.CreateInput{
		ProductID: prodID, Type: "percentage", Value: 20, MinQty: 3,
	})
	AssertNoError(t, err)

	// Which discount applies for qty=5? Both match, which wins?
	disc := discount.GetApplicable(tenantID, pid, 5, time.Now())
	if disc != nil {
		t.Logf("Overlapping discounts: qty=5 gets %.0f%% (value=%.0f)", disc.Value, disc.Value)
	}

	// For qty=4, only rule 2 should match
	disc4 := discount.GetApplicable(tenantID, pid, 4, time.Now())
	if disc4 != nil {
		t.Logf("Overlapping discounts: qty=4 gets %.0f%% (value=%.0f)", disc4.Value, disc4.Value)
		AssertFloatEqual(t, disc4.Value, 20, "qty=4 should get 20%% rule")
	}
}

// ---------- Test 27: Batch FIFO consumption ----------

func TestEdge_BatchFIFOConsumption(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	prodID := edgeProduct(t, tenantID, 0)

	// Create 2 batches via purchase
	sup, _ := supplier.Create(tenantID, supplier.CreateInput{Name: "BatchSup", Phone: "0555000006"})

	tomorrow := time.Now().Add(24 * time.Hour).Format("2006-01-02")
	future := time.Now().Add(90 * 24 * time.Hour).Format("2006-01-02")

	purch, err := purchase.Create(tenantID, userID, "u@test.local", purchase.CreateInput{
		SupplierID: sup.ID.Hex(),
		Lines: []purchase.LineInput{
			{ProductID: prodID, Qty: 10, PrixAchat: 50, Lot: "LOT-A", ExpiryDate: tomorrow},
			{ProductID: prodID, Qty: 20, PrixAchat: 60, Lot: "LOT-B", ExpiryDate: future},
		},
	})
	AssertNoError(t, err)
	_, err = purchase.Validate(tenantID, purch.ID.Hex(), userID, "u@test.local", &purchase.ValidateInput{
		Lines: []purchase.ValidateLineInput{{ProductID: prodID, ReceivedQty: 30}},
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, prodID, 30, "stock=30 after purchase")

	// Sell 15 — should consume LOT-A first (FIFO), then 5 from LOT-B
	_, err = sale.Create(tenantID, userID, "u@test.local", sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: prodID, Qty: 15, UnitPrice: 100}},
		PaymentMethod: "cash", AmountPaid: 1500, SaleType: "cash",
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, prodID, 15, "stock=15 after selling 15")

	// Check batch quantities
	batches, err := batch.ListByProduct(tenantID, prodID, 1, 10)
	AssertNoError(t, err)
	t.Logf("Batches after FIFO sale of 15:")
	for _, b := range batches.Items {
		t.Logf("  %s: qty=%.0f", b.BatchNumber, b.Qty)
	}
}

// ---------- Test 28: Variant sale on archived variant ----------

func TestEdge_SaleArchivedVariant(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")

	cat, _ := category.Create(tenantID, category.CreateInput{Name: "VarCat"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "VarBr"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "Pc"})

	parent, err := product.Create(tenantID, product.CreateInput{
		Name: "VarParent", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 50, PrixVente1: 100,
	})
	AssertNoError(t, err)

	v, err := variant.Create(tenantID, parent.ID.Hex(), variant.CreateInput{
		Attributes:   map[string]string{"size": "XL"},
		QtyAvailable: 10, PrixAchat: 50, PrixVente1: 100,
	})
	AssertNoError(t, err)

	// Deactivate variant
	_, err = variant.Update(tenantID, v.ID.Hex(), variant.UpdateInput{
		Attributes:   map[string]string{"size": "XL"},
		QtyAvailable: 10, PrixAchat: 50, PrixVente1: 100, IsActive: false,
	})
	AssertNoError(t, err)

	// Try selling the inactive variant
	_, err = sale.Create(tenantID, userID, "u@test.local", sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: parent.ID.Hex(), VariantID: v.ID.Hex(), Qty: 1, UnitPrice: 100}},
		PaymentMethod: "cash", AmountPaid: 100, SaleType: "cash",
	})
	if err != nil {
		t.Logf("OK: sale of inactive variant rejected — %v", err)
	} else {
		t.Log("WARNING: sale of inactive variant allowed")
	}
}

// ---------- Test 29: Product delete with sales ----------

func TestEdge_DeleteProductWithSales(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	prodID := edgeProduct(t, tenantID, 50)

	// Create a sale
	_, err := sale.Create(tenantID, userID, "u@test.local", sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: prodID, Qty: 1, UnitPrice: 100}},
		PaymentMethod: "cash", AmountPaid: 100, SaleType: "cash",
	})
	AssertNoError(t, err)

	// Try to delete — should auto-archive, not hard delete
	archived, err := product.Delete(tenantID, prodID)
	AssertNoError(t, err)
	AssertTrue(t, archived, "product with sales was archived, not hard deleted")
}

// ---------- Test 30: Expense zero amount ----------

func TestEdge_ExpenseZeroAmount(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)

	_, err := expense.Create(tenantID, expense.CreateInput{
		Label: "Free", Amount: 0, DateFrom: "2025-01-01", DateTo: "2025-01-31",
	})
	AssertError(t, err)
	t.Logf("Zero expense: %v", err)
}

// ---------- Test 31: Location delete with transfer ----------

func TestEdge_DeleteLocationWithTransfer(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	prodID := edgeProduct(t, tenantID, 50)

	loc1, _ := location.Create(tenantID, location.CreateInput{Name: "LocA"})
	loc2, _ := location.Create(tenantID, location.CreateInput{Name: "LocB"})

	_, err := transfer.Create(tenantID, userID, "u@test.local", transfer.CreateInput{
		FromLocationID: loc1.ID.Hex(), ToLocationID: loc2.ID.Hex(),
		Lines: []transfer.TransferLineInput{{ProductID: prodID, Qty: 1}},
	})
	AssertNoError(t, err)

	// Try to delete the source location
	err = location.Delete(tenantID, loc1.ID.Hex())
	if err != nil {
		t.Logf("OK: delete location with transfer rejected — %v", err)
	} else {
		t.Log("WARNING: location with transfer deleted — transfer references orphaned")
	}
}

// ---------- Test 32: Purchase delete after validation ----------

func TestEdge_DeleteValidatedPurchase(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	prodID := edgeProduct(t, tenantID, 0)

	sup, _ := supplier.Create(tenantID, supplier.CreateInput{Name: "DelSup", Phone: "0555000007"})
	purch, err := purchase.Create(tenantID, userID, "u@test.local", purchase.CreateInput{
		SupplierID: sup.ID.Hex(),
		Lines:      []purchase.LineInput{{ProductID: prodID, Qty: 10, PrixAchat: 50}},
	})
	AssertNoError(t, err)
	_, err = purchase.Validate(tenantID, purch.ID.Hex(), userID, "u@test.local", &purchase.ValidateInput{
		Lines: []purchase.ValidateLineInput{{ProductID: prodID, ReceivedQty: 10}},
	})
	AssertNoError(t, err)

	// Try to delete validated purchase
	err = purchase.Delete(tenantID, purch.ID.Hex())
	if err != nil {
		t.Logf("OK: delete validated purchase rejected — %v", err)
	} else {
		stock := GetProductStock(t, tenantID, prodID)
		t.Logf("WARNING: validated purchase deleted — stock=%.0f (should stock be reversed?)", stock)
	}
}

// ---------- Test 33: Supplier delete with balance ----------

func TestEdge_DeleteSupplierWithBalance(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	prodID := edgeProduct(t, tenantID, 0)

	sup, _ := supplier.Create(tenantID, supplier.CreateInput{Name: "BalSup", Phone: "0555000008"})

	// Create and validate purchase to create supplier debt
	purch, err := purchase.Create(tenantID, userID, "u@test.local", purchase.CreateInput{
		SupplierID: sup.ID.Hex(),
		Lines:      []purchase.LineInput{{ProductID: prodID, Qty: 5, PrixAchat: 100}},
	})
	AssertNoError(t, err)
	_, err = purchase.Validate(tenantID, purch.ID.Hex(), userID, "u@test.local", &purchase.ValidateInput{
		Lines: []purchase.ValidateLineInput{{ProductID: prodID, ReceivedQty: 5}},
	})
	AssertNoError(t, err)

	// Delete should auto-archive, not hard delete
	archived, err := supplier.Delete(tenantID, sup.ID.Hex())
	AssertNoError(t, err)
	AssertTrue(t, archived, "supplier with purchases was archived, not hard deleted")
}

// ---------- Test 34: Unit/Brand/Category delete when used ----------

func TestEdge_DeleteUsedMetadata(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	cat, _ := category.Create(tenantID, category.CreateInput{Name: "UsedCat"})
	br, _ := brand.Create(tenantID, brand.CreateInput{Name: "UsedBr"})
	un, _ := unit.Create(tenantID, unit.CreateInput{Name: "UsedUn"})

	_, err := product.Create(tenantID, product.CreateInput{
		Name: "UsedProd", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 10, PrixVente1: 20,
	})
	AssertNoError(t, err)

	// Try deleting each — they're in use by a product
	err = category.Delete(tenantID, cat.ID.Hex())
	if err != nil {
		t.Logf("OK: delete used category rejected — %v", err)
	} else {
		t.Log("WARNING: used category deleted")
	}

	err = brand.Delete(tenantID, br.ID.Hex())
	if err != nil {
		t.Logf("OK: delete used brand rejected — %v", err)
	} else {
		t.Log("WARNING: used brand deleted")
	}

	err = unit.Delete(tenantID, un.ID.Hex())
	if err != nil {
		t.Logf("OK: delete used unit rejected — %v", err)
	} else {
		t.Log("WARNING: used unit deleted")
	}
}
