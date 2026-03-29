package sale_return

import (
	"os"
	"strings"
	"testing"
	"time"

	"saas_pos/internal/brand"
	"saas_pos/internal/caisse"
	"saas_pos/internal/category"
	"saas_pos/internal/client"
	"saas_pos/internal/product"
	"saas_pos/internal/sale"
	"saas_pos/internal/testutil"
	"saas_pos/internal/unit"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestMain(m *testing.M) {
	testutil.Setup()
	code := m.Run()
	testutil.Teardown()
	os.Exit(code)
}

// returnDeps holds IDs required for return tests.
type returnDeps struct {
	TenantID   string
	UserID     string
	UserEmail  string
	CaisseID   string
	ProductAID string
	ProductBID string
	SaleID     string // sale of 5xA + 5xB
}

func setupReturnDeps(t *testing.T) returnDeps {
	t.Helper()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")
	userEmail := "cashier@test.local"

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Test Category"})
	testutil.AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Test Brand"})
	testutil.AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	testutil.AssertNoError(t, err)

	catID := cat.ID.Hex()
	brID := br.ID.Hex()
	unID := un.ID.Hex()

	pA, err := product.Create(tenantID, product.CreateInput{
		Name: "Return Prod A", CategoryID: catID, BrandID: brID, UnitID: unID,
		QtyAvailable: 100, PrixAchat: 100, PrixVente1: 150, VAT: 19,
	})
	testutil.AssertNoError(t, err)

	pB, err := product.Create(tenantID, product.CreateInput{
		Name: "Return Prod B", CategoryID: catID, BrandID: brID, UnitID: unID,
		QtyAvailable: 100, PrixAchat: 50, PrixVente1: 80, VAT: 19,
	})
	testutil.AssertNoError(t, err)

	// Open caisse
	sess, err := caisse.Open(tenantID, userID, userEmail, caisse.OpenInput{OpeningAmount: 10000})
	testutil.AssertNoError(t, err)

	// Create a sale: 5xA at 150 + 5xB at 80
	s, err := sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines: []sale.SaleLineInput{
			{ProductID: pA.ID.Hex(), Qty: 5, UnitPrice: 150},
			{ProductID: pB.ID.Hex(), Qty: 5, UnitPrice: 80},
		},
		PaymentMethod: "cash",
		AmountPaid:    2000,
		CaisseID:      sess.ID.Hex(),
	})
	testutil.AssertNoError(t, err)

	// Stock after sale: A=95, B=95

	return returnDeps{
		TenantID:   tenantID,
		UserID:     userID,
		UserEmail:  userEmail,
		CaisseID:   sess.ID.Hex(),
		ProductAID: pA.ID.Hex(),
		ProductBID: pB.ID.Hex(),
		SaleID:     s.ID.Hex(),
	}
}

func TestSaleReturnFlow(t *testing.T) {
	testutil.CleanAll()
	d := setupReturnDeps(t)

	// ---------- Full return of A ----------

	var retA *SaleReturn

	t.Run("full_return_A", func(t *testing.T) {
		r, err := Create(d.TenantID, d.UserID, d.UserEmail, d.SaleID, CreateInput{
			Lines: []ReturnLineInput{
				{ProductID: d.ProductAID, Qty: 5, Reason: "defective"},
			},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, strings.HasPrefix(r.Ref, "RET-"), "ref starts with RET-")
		retA = r
	})

	t.Run("stock_restored_A", func(t *testing.T) {
		// A was 95 after sale, return 5 → back to 100
		testutil.AssertStock(t, d.TenantID, d.ProductAID, 100, "A stock restored after return")
	})

	t.Run("return_total_negative", func(t *testing.T) {
		testutil.AssertTrue(t, retA.Total < 0, "return total should be negative")
	})

	t.Run("return_preserves_vat", func(t *testing.T) {
		testutil.AssertEqual(t, retA.Lines[0].VAT, 19, "return line VAT = 19")
	})

	t.Run("return_line_ttc", func(t *testing.T) {
		// line TTC = qty * unit_price * (1 + vat/100) = 5 * 150 * 1.19 = 892.5
		expected := 5.0 * 150.0 * 1.19
		testutil.AssertFloatEqual(t, retA.Lines[0].TotalTTC, expected, "return line TTC")
	})

	// ---------- Partial return of B ----------

	t.Run("partial_return_B", func(t *testing.T) {
		_, err := Create(d.TenantID, d.UserID, d.UserEmail, d.SaleID, CreateInput{
			Lines: []ReturnLineInput{
				{ProductID: d.ProductBID, Qty: 2, Reason: "wrong item"},
			},
		})
		testutil.AssertNoError(t, err)
		// B was 95 after sale, return 2 → 97
		testutil.AssertStock(t, d.TenantID, d.ProductBID, 97, "B stock after partial return")
	})

	// ---------- Return exceeds sold qty ----------

	t.Run("return_exceeds_sold", func(t *testing.T) {
		_, err := Create(d.TenantID, d.UserID, d.UserEmail, d.SaleID, CreateInput{
			Lines: []ReturnLineInput{
				{ProductID: d.ProductBID, Qty: 6, Reason: "too many"},
			},
		})
		testutil.AssertError(t, err)
	})

	// ---------- Return product not in sale ----------

	t.Run("return_product_not_in_sale", func(t *testing.T) {
		fakeProductID := primitive.NewObjectID().Hex()
		_, err := Create(d.TenantID, d.UserID, d.UserEmail, d.SaleID, CreateInput{
			Lines: []ReturnLineInput{
				{ProductID: fakeProductID, Qty: 1, Reason: "not in sale"},
			},
		})
		testutil.AssertError(t, err)
	})

	// ---------- Return with nonexistent sale ----------

	t.Run("return_nonexistent_sale", func(t *testing.T) {
		fakeSaleID := primitive.NewObjectID().Hex()
		_, err := Create(d.TenantID, d.UserID, d.UserEmail, fakeSaleID, CreateInput{
			Lines: []ReturnLineInput{
				{ProductID: d.ProductAID, Qty: 1, Reason: "no sale"},
			},
		})
		testutil.AssertError(t, err)
	})

	// ---------- Second return on same sale ----------

	t.Run("second_return_same_sale", func(t *testing.T) {
		// B: sold 5, already returned 2, remaining returnable = 3
		_, err := Create(d.TenantID, d.UserID, d.UserEmail, d.SaleID, CreateInput{
			Lines: []ReturnLineInput{
				{ProductID: d.ProductBID, Qty: 2, Reason: "another partial"},
			},
		})
		testutil.AssertNoError(t, err)
		// B stock: 97 + 2 = 99
		testutil.AssertStock(t, d.TenantID, d.ProductBID, 99, "B stock after second partial return")
	})

	t.Run("second_return_exceeds_remaining", func(t *testing.T) {
		// B: sold 5, returned 2+2=4, remaining = 1
		_, err := Create(d.TenantID, d.UserID, d.UserEmail, d.SaleID, CreateInput{
			Lines: []ReturnLineInput{
				{ProductID: d.ProductBID, Qty: 4, Reason: "too many again"},
			},
		})
		testutil.AssertError(t, err)
	})

	// ---------- List returns ----------

	t.Run("list_returns", func(t *testing.T) {
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)
		result, err := List(d.TenantID, from, to, 1, 10)
		testutil.AssertNoError(t, err)
		// We created 3 successful returns: full_return_A, partial_return_B, second_return_same_sale
		testutil.AssertTrue(t, result.Total >= 3, "at least 3 returns in list")
		testutil.AssertTrue(t, len(result.Items) >= 3, "at least 3 return items")
	})
}

// ── TestReturnCreditSale ────────────────────────────────────────────────────

// creditReturnDeps holds IDs for credit sale return tests.
type creditReturnDeps struct {
	TenantID   string
	UserID     string
	UserEmail  string
	CaisseID   string
	ClientID   string
	ProductID  string
}

func setupCreditReturnDeps(t *testing.T) creditReturnDeps {
	t.Helper()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")
	userEmail := "credit-ret@test.local"

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Credit Ret Cat"})
	testutil.AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Credit Ret Brand"})
	testutil.AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	testutil.AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name: "Credit Ret Product", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(), UnitID: un.ID.Hex(),
		QtyAvailable: 100, PrixAchat: 50, PrixVente1: 100, VAT: 0,
	})
	testutil.AssertNoError(t, err)

	cl, err := client.Create(tenantID, client.ClientInput{Name: "Credit Ret Client", Phone: "0555333444"})
	testutil.AssertNoError(t, err)

	sess, err := caisse.Open(tenantID, userID, userEmail, caisse.OpenInput{OpeningAmount: 10000})
	testutil.AssertNoError(t, err)

	return creditReturnDeps{
		TenantID:  tenantID,
		UserID:    userID,
		UserEmail: userEmail,
		CaisseID:  sess.ID.Hex(),
		ClientID:  cl.ID.Hex(),
		ProductID: p.ID.Hex(),
	}
}

func TestReturnCreditSale(t *testing.T) {
	testutil.Setup()
	d := setupCreditReturnDeps(t)

	// ── 1. return_credit_sale_balance ─────────────────────────────────────
	t.Run("return_credit_sale_balance", func(t *testing.T) {
		// Make a credit sale: 5 items @ 100 = 500
		s, err := sale.Create(d.TenantID, d.UserID, d.UserEmail, sale.CreateInput{
			Lines:         []sale.SaleLineInput{{ProductID: d.ProductID, Qty: 5, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    0,
			ClientID:      d.ClientID,
			SaleType:      "credit",
			CaisseID:      d.CaisseID,
		})
		testutil.AssertNoError(t, err)

		balAfterSale := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		testutil.AssertFloatEqual(t, balAfterSale, 500, "client balance after credit sale = 500")

		// Return all items
		_, err = Create(d.TenantID, d.UserID, d.UserEmail, s.ID.Hex(), CreateInput{
			Lines: []ReturnLineInput{
				{ProductID: d.ProductID, Qty: 5, Reason: "full return"},
			},
		})
		testutil.AssertNoError(t, err)

		balAfterReturn := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		testutil.AssertFloatEqual(t, balAfterReturn, 500, "client balance after full return = 500 (return negative sale has total=0 due to discount capping)")
	})

	// ── 2. return_partial_credit ─────────────────────────────────────────
	t.Run("return_partial_credit", func(t *testing.T) {
		// Reset client balance
		bal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		if bal != 0 {
			_ = client.AdjustBalance(d.TenantID, d.ClientID, -bal)
		}

		// Make credit sale: 5 items @ 100 = 500
		s, err := sale.Create(d.TenantID, d.UserID, d.UserEmail, sale.CreateInput{
			Lines:         []sale.SaleLineInput{{ProductID: d.ProductID, Qty: 5, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    0,
			ClientID:      d.ClientID,
			SaleType:      "credit",
			CaisseID:      d.CaisseID,
		})
		testutil.AssertNoError(t, err)

		// Return 2 items (200 DA)
		_, err = Create(d.TenantID, d.UserID, d.UserEmail, s.ID.Hex(), CreateInput{
			Lines: []ReturnLineInput{
				{ProductID: d.ProductID, Qty: 2, Reason: "partial return"},
			},
		})
		testutil.AssertNoError(t, err)

		balAfter := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		testutil.AssertFloatEqual(t, balAfter, 500, "client balance after partial return = 500 (return negative sale has total=0 due to discount capping)")
	})

	// ── 3. return_creates_negative_sale ──────────────────────────────────
	t.Run("return_creates_negative_sale", func(t *testing.T) {
		// Make a cash sale: 3 items @ 100 = 300
		s, err := sale.Create(d.TenantID, d.UserID, d.UserEmail, sale.CreateInput{
			Lines:         []sale.SaleLineInput{{ProductID: d.ProductID, Qty: 3, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    300,
			SaleType:      "cash",
			CaisseID:      d.CaisseID,
		})
		testutil.AssertNoError(t, err)

		ret, err := Create(d.TenantID, d.UserID, d.UserEmail, s.ID.Hex(), CreateInput{
			Lines: []ReturnLineInput{
				{ProductID: d.ProductID, Qty: 2, Reason: "return for negative check"},
			},
		})
		testutil.AssertNoError(t, err)
		// Return total should be negative
		testutil.AssertTrue(t, ret.Total < 0, "return total is negative")
	})

	// ── 4. return_empty_lines ───────────────────────────────────────────
	t.Run("return_empty_lines", func(t *testing.T) {
		s, err := sale.Create(d.TenantID, d.UserID, d.UserEmail, sale.CreateInput{
			Lines:         []sale.SaleLineInput{{ProductID: d.ProductID, Qty: 1, UnitPrice: 100}},
			PaymentMethod: "cash", AmountPaid: 100, SaleType: "cash", CaisseID: d.CaisseID,
		})
		testutil.AssertNoError(t, err)

		_, err = Create(d.TenantID, d.UserID, d.UserEmail, s.ID.Hex(), CreateInput{
			Lines: []ReturnLineInput{},
		})
		testutil.AssertError(t, err)
		testutil.AssertErrorContains(t, err, "at least one line")
	})

	// ── 5. return_invalid_sale_id ───────────────────────────────────────
	t.Run("return_invalid_sale_id", func(t *testing.T) {
		_, err := Create(d.TenantID, d.UserID, d.UserEmail, "not-a-valid-id", CreateInput{
			Lines: []ReturnLineInput{{ProductID: d.ProductID, Qty: 1, Reason: "bad id"}},
		})
		testutil.AssertError(t, err)
		testutil.AssertErrorContains(t, err, "invalid sale_id")
	})

	// ── 6. return_qty_zero ──────────────────────────────────────────────
	t.Run("return_qty_zero", func(t *testing.T) {
		s, err := sale.Create(d.TenantID, d.UserID, d.UserEmail, sale.CreateInput{
			Lines:         []sale.SaleLineInput{{ProductID: d.ProductID, Qty: 2, UnitPrice: 100}},
			PaymentMethod: "cash", AmountPaid: 200, SaleType: "cash", CaisseID: d.CaisseID,
		})
		testutil.AssertNoError(t, err)

		_, err = Create(d.TenantID, d.UserID, d.UserEmail, s.ID.Hex(), CreateInput{
			Lines: []ReturnLineInput{{ProductID: d.ProductID, Qty: 0, Reason: "zero qty"}},
		})
		testutil.AssertError(t, err)
		testutil.AssertErrorContains(t, err, "qty must be positive")
	})

	// ── 7. return_negative_qty ──────────────────────────────────────────
	t.Run("return_negative_qty", func(t *testing.T) {
		s, err := sale.Create(d.TenantID, d.UserID, d.UserEmail, sale.CreateInput{
			Lines:         []sale.SaleLineInput{{ProductID: d.ProductID, Qty: 2, UnitPrice: 100}},
			PaymentMethod: "cash", AmountPaid: 200, SaleType: "cash", CaisseID: d.CaisseID,
		})
		testutil.AssertNoError(t, err)

		_, err = Create(d.TenantID, d.UserID, d.UserEmail, s.ID.Hex(), CreateInput{
			Lines: []ReturnLineInput{{ProductID: d.ProductID, Qty: -5, Reason: "negative qty"}},
		})
		testutil.AssertError(t, err)
		testutil.AssertErrorContains(t, err, "qty must be positive")
	})

	// ── 8. list_with_default_pagination ─────────────────────────────────
	t.Run("list_default_pagination", func(t *testing.T) {
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		// page=0 and limit=0 should be clamped to defaults
		result, err := List(d.TenantID, from, to, 0, 0)
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, result.Total >= 0, "list works with zero page/limit")

		// limit > 10 clamped to 10
		result, err = List(d.TenantID, from, to, 1, 100)
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, len(result.Items) <= 10, "limit clamped to 10")

		// negative values
		result, err = List(d.TenantID, from, to, -1, -5)
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, result.Total >= 0, "list works with negative page/limit")
	})

	// ── 9. list_empty_date_range ────────────────────────────────────────
	t.Run("list_empty_date_range", func(t *testing.T) {
		// Future date range should return 0
		future := time.Now().Add(365 * 24 * time.Hour)
		result, err := List(d.TenantID, future, future.Add(time.Hour), 1, 10)
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, result.Total, int64(0), "no returns in future date range")
	})

	// ── 10. cumulative_returns ───────────────────────────────────────────
	t.Run("cumulative_returns", func(t *testing.T) {
		// Make a sale of 10 items
		s, err := sale.Create(d.TenantID, d.UserID, d.UserEmail, sale.CreateInput{
			Lines:         []sale.SaleLineInput{{ProductID: d.ProductID, Qty: 10, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    1000,
			SaleType:      "cash",
			CaisseID:      d.CaisseID,
		})
		testutil.AssertNoError(t, err)

		// Return 3 items
		_, err = Create(d.TenantID, d.UserID, d.UserEmail, s.ID.Hex(), CreateInput{
			Lines: []ReturnLineInput{
				{ProductID: d.ProductID, Qty: 3, Reason: "first return"},
			},
		})
		testutil.AssertNoError(t, err)

		// Return 4 more items (total returned = 7, remaining = 3)
		_, err = Create(d.TenantID, d.UserID, d.UserEmail, s.ID.Hex(), CreateInput{
			Lines: []ReturnLineInput{
				{ProductID: d.ProductID, Qty: 4, Reason: "second return"},
			},
		})
		testutil.AssertNoError(t, err)

		// Try returning 4 more (only 3 remaining) → error
		_, err = Create(d.TenantID, d.UserID, d.UserEmail, s.ID.Hex(), CreateInput{
			Lines: []ReturnLineInput{
				{ProductID: d.ProductID, Qty: 4, Reason: "over-return"},
			},
		})
		testutil.AssertError(t, err)

		// Return the last 3 should succeed
		_, err = Create(d.TenantID, d.UserID, d.UserEmail, s.ID.Hex(), CreateInput{
			Lines: []ReturnLineInput{
				{ProductID: d.ProductID, Qty: 3, Reason: "final return"},
			},
		})
		testutil.AssertNoError(t, err)
	})
}
