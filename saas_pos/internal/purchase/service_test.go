package purchase

import (
	"os"
	"strings"
	"testing"

	"saas_pos/internal/brand"
	"saas_pos/internal/category"
	"saas_pos/internal/product"
	"saas_pos/internal/supplier"
	"saas_pos/internal/testutil"
	"saas_pos/internal/unit"
)

func TestMain(m *testing.M) {
	testutil.Setup()
	code := m.Run()
	testutil.Teardown()
	os.Exit(code)
}

func TestPurchaseFlow(t *testing.T) {
	testutil.CleanAll()

	// -- Setup: tenant, user, supplier, category, brand, unit, 2 products --
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")
	userEmail := "admin@test.local"

	sup, err := supplier.Create(tenantID, supplier.CreateInput{Name: "Supplier One", Phone: "0555000000"})
	testutil.AssertNoError(t, err)
	supplierID := sup.ID.Hex()

	cat, err := category.Create(tenantID, category.CreateInput{Name: "General"})
	testutil.AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "BrandX"})
	testutil.AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	testutil.AssertNoError(t, err)

	prodA, err := product.Create(tenantID, product.CreateInput{
		Name:       "Product A",
		CategoryID: cat.ID.Hex(),
		BrandID:    br.ID.Hex(),
		UnitID:     un.ID.Hex(),
		PrixAchat:  80,
		PrixVente1: 150,
		VAT:        19,
	})
	testutil.AssertNoError(t, err)
	prodAID := prodA.ID.Hex()

	prodB, err := product.Create(tenantID, product.CreateInput{
		Name:       "Product B",
		CategoryID: cat.ID.Hex(),
		BrandID:    br.ID.Hex(),
		UnitID:     un.ID.Hex(),
		PrixAchat:  40,
		PrixVente1: 80,
		VAT:        19,
	})
	testutil.AssertNoError(t, err)
	prodBID := prodB.ID.Hex()

	// Shared state across subtests
	var draftPurchase *Purchase
	var discountPercentPurchase *Purchase
	var discountFlatPurchase *Purchase
	var expensePurchase *Purchase
	var validatedPurchase *Purchase
	var partialPurchase *Purchase

	// ---- Test 1: create_draft ----
	t.Run("create_draft", func(t *testing.T) {
		p, err := Create(tenantID, userID, userEmail, CreateInput{
			SupplierID: supplierID,
			Lines: []LineInput{
				{ProductID: prodAID, Qty: 10, PrixAchat: 100, PrixVente1: 150},
				{ProductID: prodBID, Qty: 20, PrixAchat: 50, PrixVente1: 80},
			},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, p.Status, StatusDraft, "status")
		testutil.AssertTrue(t, strings.HasPrefix(p.Ref, "ACH-"), "ref prefix")
		draftPurchase = p
	})

	// ---- Test 2: line_ht_calculation ----
	t.Run("line_ht_calculation", func(t *testing.T) {
		if draftPurchase == nil {
			t.Skip("depends on create_draft")
		}
		// lineA: 10 * 100 * (1 - 0/100) = 1000
		testutil.AssertFloatEqual(t, draftPurchase.Lines[0].TotalHT, 1000, "lineA TotalHT")
	})

	// ---- Test 3: line_vat_calculation ----
	t.Run("line_vat_calculation", func(t *testing.T) {
		if draftPurchase == nil {
			t.Skip("depends on create_draft")
		}
		// VAT = 1000 * 0.19 = 190
		testutil.AssertFloatEqual(t, draftPurchase.Lines[0].TotalVAT, 190, "lineA TotalVAT")
	})

	// ---- Test 4: line_ttc_calculation ----
	t.Run("line_ttc_calculation", func(t *testing.T) {
		if draftPurchase == nil {
			t.Skip("depends on create_draft")
		}
		// TTC = 1000 + 190 = 1190
		testutil.AssertFloatEqual(t, draftPurchase.Lines[0].TotalTTC, 1190, "lineA TotalTTC")
	})

	// ---- Test 5: purchase_total_ht ----
	t.Run("purchase_total_ht", func(t *testing.T) {
		if draftPurchase == nil {
			t.Skip("depends on create_draft")
		}
		// lineA HT=1000, lineB HT=20*50=1000 => total HT = 2000
		expectedHT := draftPurchase.Lines[0].TotalHT + draftPurchase.Lines[1].TotalHT
		testutil.AssertFloatEqual(t, draftPurchase.TotalHT, expectedHT, "TotalHT")
	})

	// ---- Test 6: global_discount_percent ----
	t.Run("global_discount_percent", func(t *testing.T) {
		p, err := Create(tenantID, userID, userEmail, CreateInput{
			SupplierID:       supplierID,
			GlobalRemise:     10,
			GlobalRemiseType: "percentage",
			Lines: []LineInput{
				{ProductID: prodAID, Qty: 10, PrixAchat: 100},
				{ProductID: prodBID, Qty: 20, PrixAchat: 50},
			},
		})
		testutil.AssertNoError(t, err)
		// subtotal after line discounts = 10*100 + 20*50 = 2000
		// global discount 10% of 2000 = 200
		testutil.AssertFloatEqual(t, p.DiscountTotal, 200, "DiscountTotal percent")
		discountPercentPurchase = p
	})

	// ---- Test 7: global_discount_flat ----
	t.Run("global_discount_flat", func(t *testing.T) {
		p, err := Create(tenantID, userID, userEmail, CreateInput{
			SupplierID:       supplierID,
			GlobalRemise:     200,
			GlobalRemiseType: "flat",
			Lines: []LineInput{
				{ProductID: prodAID, Qty: 10, PrixAchat: 100},
				{ProductID: prodBID, Qty: 20, PrixAchat: 50},
			},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, p.DiscountTotal, 200, "DiscountTotal flat")
		discountFlatPurchase = p
	})

	// ---- Test 8: with_expenses ----
	t.Run("with_expenses", func(t *testing.T) {
		p, err := Create(tenantID, userID, userEmail, CreateInput{
			SupplierID: supplierID,
			Lines: []LineInput{
				{ProductID: prodAID, Qty: 10, PrixAchat: 100},
			},
			Expenses: []ExpenseInput{
				{Label: "shipping", Amount: 100},
			},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, p.ExpensesTotal, 100, "ExpensesTotal")
		expensePurchase = p
	})

	// ---- Test 9: final_total ----
	t.Run("final_total", func(t *testing.T) {
		if expensePurchase == nil {
			t.Skip("depends on with_expenses")
		}
		// HT=1000, no discount, expenses=100 => final = (1000+100) + VAT
		// Total = HT_after_discount + VAT + expenses
		// computeFinalTotal: sal=1000, gDiscount=0, => 1000-0+100=1100
		// finalTotal = (1100 + totalVAT + 0) ... wait, the code does:
		// htAfterDiscount = computeFinalTotal(lines, gr, rt, 0) = sal - gDiscount = 1000
		// finalTotal = round((htAfterDiscount + totalVAT + expensesTotal)*100)/100
		//            = 1000 + 190 + 100 = 1290
		testutil.AssertFloatEqual(t, expensePurchase.Total, 1290, "final Total with expenses")
	})

	// ---- Test 10: update_draft ----
	t.Run("update_draft", func(t *testing.T) {
		if draftPurchase == nil {
			t.Skip("depends on create_draft")
		}
		updated, err := Update(tenantID, draftPurchase.ID.Hex(), UpdateInput{
			SupplierID: supplierID,
			Lines: []LineInput{
				{ProductID: prodAID, Qty: 5, PrixAchat: 100, PrixVente1: 150},
				{ProductID: prodBID, Qty: 10, PrixAchat: 50, PrixVente1: 80},
			},
		})
		testutil.AssertNoError(t, err)
		// New HT: 5*100=500 + 10*50=500 = 1000
		testutil.AssertFloatEqual(t, updated.TotalHT, 1000, "updated TotalHT")
		draftPurchase = updated
	})

	// ---- Test 11: validate_full ----
	t.Run("validate_full", func(t *testing.T) {
		if draftPurchase == nil {
			t.Skip("depends on update_draft")
		}
		v, err := Validate(tenantID, draftPurchase.ID.Hex(), userID, userEmail, &ValidateInput{
			Lines: []ValidateLineInput{
				{ProductID: prodAID, ReceivedQty: 5},
				{ProductID: prodBID, ReceivedQty: 10},
			},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, v.Status, StatusValidated, "status after full validation")
		validatedPurchase = v
	})

	// ---- Test 12: stock_incremented_A ----
	t.Run("stock_incremented_A", func(t *testing.T) {
		if validatedPurchase == nil {
			t.Skip("depends on validate_full")
		}
		// Product A started at 0, received 5
		testutil.AssertStock(t, tenantID, prodAID, 5, "product A stock after validation")
	})

	// ---- Test 13: stock_incremented_B ----
	t.Run("stock_incremented_B", func(t *testing.T) {
		if validatedPurchase == nil {
			t.Skip("depends on validate_full")
		}
		// Product B started at 0, received 10
		testutil.AssertStock(t, tenantID, prodBID, 10, "product B stock after validation")
	})

	// ---- Test 14: prix_achat_updated ----
	t.Run("prix_achat_updated", func(t *testing.T) {
		if validatedPurchase == nil {
			t.Skip("depends on validate_full")
		}
		// Product A: effective prix_achat = 100 (no line discount, no global discount)
		pa := testutil.GetProductPrixAchat(t, tenantID, prodAID)
		testutil.AssertFloatEqual(t, pa, 100, "product A prix_achat after validation")
	})

	// ---- Test 15: weighted_avg ----
	t.Run("weighted_avg", func(t *testing.T) {
		if validatedPurchase == nil {
			t.Skip("depends on validate_full")
		}
		// Create a second purchase for product A: 10@120
		p2, err := Create(tenantID, userID, userEmail, CreateInput{
			SupplierID: supplierID,
			Lines: []LineInput{
				{ProductID: prodAID, Qty: 10, PrixAchat: 120, PrixVente1: 160},
			},
		})
		testutil.AssertNoError(t, err)

		_, err = Validate(tenantID, p2.ID.Hex(), userID, userEmail, &ValidateInput{
			Lines: []ValidateLineInput{
				{ProductID: prodAID, ReceivedQty: 10},
			},
		})
		testutil.AssertNoError(t, err)

		// Weighted avg: (5*100 + 10*120) / (5+10) = (500+1200)/15 = 113.33
		pa := testutil.GetProductPrixAchat(t, tenantID, prodAID)
		testutil.AssertFloatEqual(t, pa, 113.33, "weighted avg prix_achat")
	})

	// ---- Test 16: partial_validation ----
	t.Run("partial_validation", func(t *testing.T) {
		// Create a fresh purchase for 10 units of product B
		pp, err := Create(tenantID, userID, userEmail, CreateInput{
			SupplierID: supplierID,
			Lines: []LineInput{
				{ProductID: prodBID, Qty: 10, PrixAchat: 50, PrixVente1: 80},
			},
		})
		testutil.AssertNoError(t, err)

		// Current stock for B: 10 (from test 13)
		stockBefore := testutil.GetProductStock(t, tenantID, prodBID)

		v, err := Validate(tenantID, pp.ID.Hex(), userID, userEmail, &ValidateInput{
			Lines: []ValidateLineInput{
				{ProductID: prodBID, ReceivedQty: 7},
			},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, v.Status, StatusPartiallyValidated, "partial validation status")

		stockAfter := testutil.GetProductStock(t, tenantID, prodBID)
		testutil.AssertFloatEqual(t, stockAfter, stockBefore+7, "stock after partial validation")
		partialPurchase = v
	})

	// ---- Test 17: pay_purchase ----
	t.Run("pay_purchase", func(t *testing.T) {
		if validatedPurchase == nil {
			t.Skip("depends on validate_full")
		}
		paid, err := Pay(tenantID, validatedPurchase.ID.Hex(), userID, PayInput{
			Amount: validatedPurchase.Total,
			Note:   "full payment",
		})
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, paid.PaidAmount, validatedPurchase.Total, "paid_amount equals total")
	})

	// ---- Test 18: cannot_update_validated ----
	t.Run("cannot_update_validated", func(t *testing.T) {
		if validatedPurchase == nil {
			t.Skip("depends on validate_full")
		}
		_, err := Update(tenantID, validatedPurchase.ID.Hex(), UpdateInput{
			SupplierID: supplierID,
			Lines: []LineInput{
				{ProductID: prodAID, Qty: 1, PrixAchat: 100},
			},
		})
		testutil.AssertError(t, err)
	})

	// Silence unused variable warnings
	_ = discountPercentPurchase
	_ = discountFlatPurchase
	_ = partialPurchase
}

func TestPurchasePayments(t *testing.T) {
	testutil.CleanAll()

	var (
		tenantID   string
		userID     string
		userEmail  = "admin@test.local"
		supplierID string
		prodID     string
		purchaseID string
		total      float64
	)

	t.Run("setup", func(t *testing.T) {
		tenantID = testutil.CreateTenant(t)
		userID, _ = testutil.CreateUser(t, tenantID, "admin")

		sup, err := supplier.Create(tenantID, supplier.CreateInput{Name: "Pay Sup", Phone: "0555111111"})
		testutil.AssertNoError(t, err)
		supplierID = sup.ID.Hex()

		cat, err := category.Create(tenantID, category.CreateInput{Name: "CatPay"})
		testutil.AssertNoError(t, err)
		br, err := brand.Create(tenantID, brand.CreateInput{Name: "BrandPay"})
		testutil.AssertNoError(t, err)
		un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
		testutil.AssertNoError(t, err)

		prod, err := product.Create(tenantID, product.CreateInput{
			Name:       "Product Pay",
			CategoryID: cat.ID.Hex(),
			BrandID:    br.ID.Hex(),
			UnitID:     un.ID.Hex(),
			PrixAchat:  100,
			PrixVente1: 200,
			VAT:        19,
		})
		testutil.AssertNoError(t, err)
		prodID = prod.ID.Hex()
	})

	t.Run("create_and_validate", func(t *testing.T) {
		if prodID == "" {
			t.Skip("depends on setup")
		}
		p, err := Create(tenantID, userID, userEmail, CreateInput{
			SupplierID: supplierID,
			Lines: []LineInput{
				{ProductID: prodID, Qty: 10, PrixAchat: 100, PrixVente1: 200},
			},
		})
		testutil.AssertNoError(t, err)

		v, err := Validate(tenantID, p.ID.Hex(), userID, userEmail, &ValidateInput{
			Lines: []ValidateLineInput{
				{ProductID: prodID, ReceivedQty: 10},
			},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, v.Status, StatusValidated, "status after validation")
		// 10 * 100 = 1000 HT + 19% VAT = 1190 TTC
		testutil.AssertFloatEqual(t, v.Total, 1190, "total TTC")
		purchaseID = v.ID.Hex()
		total = v.Total
	})

	t.Run("partial_payment", func(t *testing.T) {
		if purchaseID == "" {
			t.Skip("depends on create_and_validate")
		}
		paid, err := Pay(tenantID, purchaseID, userID, PayInput{Amount: 500, Note: "partial"})
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, paid.PaidAmount, 500, "paid_amount after partial")
		testutil.AssertEqual(t, paid.Status, StatusValidated, "status still validated after partial payment")
	})

	t.Run("list_payments", func(t *testing.T) {
		if purchaseID == "" {
			t.Skip("depends on partial_payment")
		}
		payments, count, err := ListPayments(tenantID, purchaseID, 1, 50)
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, count, int64(1), "one payment recorded")
		testutil.AssertFloatEqual(t, payments[0].Amount, 500, "payment amount")
	})

	t.Run("full_payment", func(t *testing.T) {
		if purchaseID == "" {
			t.Skip("depends on partial_payment")
		}
		remaining := total - 500
		paid, err := Pay(tenantID, purchaseID, userID, PayInput{Amount: remaining, Note: "rest"})
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, paid.PaidAmount, total, "paid_amount equals total")
		testutil.AssertEqual(t, paid.Status, StatusPaid, "status should be paid")
	})

	t.Run("supplier_balance_after_payment", func(t *testing.T) {
		if supplierID == "" {
			t.Skip("depends on full_payment")
		}
		bal := testutil.GetSupplierBalance(t, tenantID, supplierID)
		testutil.AssertFloatEqual(t, bal, 0, "supplier balance should be zero after full payment")
	})

	t.Run("overpay_accepted", func(t *testing.T) {
		if purchaseID == "" {
			t.Skip("depends on full_payment")
		}
		// The service allows overpayment (no validation against total)
		p, err := Pay(tenantID, purchaseID, userID, PayInput{Amount: 100, Note: "overpay"})
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, p.PaidAmount > p.Total, "paid exceeds total")
	})
}

func TestPurchaseReturn(t *testing.T) {
	testutil.CleanAll()

	var (
		tenantID   string
		userID     string
		userEmail  = "admin@test.local"
		supplierID string
		prodID     string
		purchaseID string
	)

	t.Run("setup", func(t *testing.T) {
		tenantID = testutil.CreateTenant(t)
		userID, _ = testutil.CreateUser(t, tenantID, "admin")

		sup, err := supplier.Create(tenantID, supplier.CreateInput{Name: "Ret Sup", Phone: "0555222222"})
		testutil.AssertNoError(t, err)
		supplierID = sup.ID.Hex()

		cat, err := category.Create(tenantID, category.CreateInput{Name: "CatRet"})
		testutil.AssertNoError(t, err)
		br, err := brand.Create(tenantID, brand.CreateInput{Name: "BrandRet"})
		testutil.AssertNoError(t, err)
		un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
		testutil.AssertNoError(t, err)

		prod, err := product.Create(tenantID, product.CreateInput{
			Name:       "Product Ret",
			CategoryID: cat.ID.Hex(),
			BrandID:    br.ID.Hex(),
			UnitID:     un.ID.Hex(),
			PrixAchat:  100,
			PrixVente1: 200,
			VAT:        19,
		})
		testutil.AssertNoError(t, err)
		prodID = prod.ID.Hex()

		// Stock starts at 0; create and validate a purchase for 10 units
		p, err := Create(tenantID, userID, userEmail, CreateInput{
			SupplierID: supplierID,
			Lines: []LineInput{
				{ProductID: prodID, Qty: 10, PrixAchat: 100, PrixVente1: 200},
			},
		})
		testutil.AssertNoError(t, err)

		v, err := Validate(tenantID, p.ID.Hex(), userID, userEmail, &ValidateInput{
			Lines: []ValidateLineInput{
				{ProductID: prodID, ReceivedQty: 10},
			},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, v.Status, StatusValidated, "validated")
		testutil.AssertStock(t, tenantID, prodID, 10, "stock after purchase validation")
		purchaseID = v.ID.Hex()
	})

	t.Run("return_partial", func(t *testing.T) {
		if purchaseID == "" {
			t.Skip("depends on setup")
		}
		ret, err := Return(tenantID, purchaseID, userID, userEmail, []ValidateLineInput{
			{ProductID: prodID, ReceivedQty: 3},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, ret.Total < 0, "return total should be negative")
		testutil.AssertStock(t, tenantID, prodID, 7, "stock after returning 3")
	})

	t.Run("return_remaining", func(t *testing.T) {
		if purchaseID == "" {
			t.Skip("depends on return_partial")
		}
		// Try returning 5 more — only 7 remaining returnable (10 received - 3 already returned)
		ret, err := Return(tenantID, purchaseID, userID, userEmail, []ValidateLineInput{
			{ProductID: prodID, ReceivedQty: 5},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, ret.Total < 0, "second return total should be negative")
		testutil.AssertStock(t, tenantID, prodID, 2, "stock after returning 5 more")
	})
}
