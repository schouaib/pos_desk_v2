package sale

import (
	"os"
	"strings"
	"testing"

	"saas_pos/internal/brand"
	"saas_pos/internal/caisse"
	"saas_pos/internal/category"
	"saas_pos/internal/product"
	"saas_pos/internal/testutil"
	"saas_pos/internal/unit"
)

func TestMain(m *testing.M) {
	testutil.Setup()
	code := m.Run()
	testutil.Teardown()
	os.Exit(code)
}

// saleDeps holds IDs required for sale tests.
type saleDeps struct {
	TenantID   string
	UserID     string
	UserEmail  string
	CaisseID   string
	ProductAID string
	ProductBID string
}

func setupSaleDeps(t *testing.T) saleDeps {
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

	pA, err := product.Create(tenantID, product.CreateInput{
		Name:         "Product A",
		CategoryID:   cat.ID.Hex(),
		BrandID:      br.ID.Hex(),
		UnitID:       un.ID.Hex(),
		QtyAvailable: 100,
		PrixAchat:    100,
		PrixVente1:   150,
		VAT:          19,
	})
	testutil.AssertNoError(t, err)

	pB, err := product.Create(tenantID, product.CreateInput{
		Name:         "Product B",
		CategoryID:   cat.ID.Hex(),
		BrandID:      br.ID.Hex(),
		UnitID:       un.ID.Hex(),
		QtyAvailable: 100,
		PrixAchat:    50,
		PrixVente1:   80,
		VAT:          19,
	})
	testutil.AssertNoError(t, err)

	// Open a caisse session
	sess, err := caisse.Open(tenantID, userID, userEmail, caisse.OpenInput{OpeningAmount: 10000})
	testutil.AssertNoError(t, err)

	return saleDeps{
		TenantID:   tenantID,
		UserID:     userID,
		UserEmail:  userEmail,
		CaisseID:   sess.ID.Hex(),
		ProductAID: pA.ID.Hex(),
		ProductBID: pB.ID.Hex(),
	}
}

func TestSaleFlow(t *testing.T) {
	testutil.CleanAll()
	d := setupSaleDeps(t)

	// Collect refs to verify sequential numbering at the end.
	var refs []string

	// ---------- Timbre tests ----------

	t.Run("calc_timbre_cash_500", func(t *testing.T) {
		got := CalcTimbre(500, "cash")
		testutil.AssertFloatEqual(t, got, 5, "timbre for 500 cash")
	})

	t.Run("calc_timbre_cash_50000", func(t *testing.T) {
		got := CalcTimbre(50000, "cash")
		testutil.AssertFloatEqual(t, got, 750, "timbre for 50000 cash")
	})

	t.Run("calc_timbre_cash_200000", func(t *testing.T) {
		got := CalcTimbre(200000, "cash")
		testutil.AssertFloatEqual(t, got, 4000, "timbre for 200000 cash")
	})

	t.Run("calc_timbre_cheque", func(t *testing.T) {
		got := CalcTimbre(50000, "cheque")
		testutil.AssertFloatEqual(t, got, 0, "timbre for cheque")
	})

	t.Run("calc_timbre_virement", func(t *testing.T) {
		got := CalcTimbre(50000, "virement")
		testutil.AssertFloatEqual(t, got, 0, "timbre for virement")
	})

	t.Run("calc_timbre_cash_300", func(t *testing.T) {
		got := CalcTimbre(300, "cash")
		testutil.AssertFloatEqual(t, got, 0, "timbre for 300 cash (below threshold)")
	})

	t.Run("calc_timbre_cash_301", func(t *testing.T) {
		got := CalcTimbre(301, "cash")
		testutil.AssertFloatEqual(t, got, 5, "timbre for 301 cash (min 5)")
	})

	// ---------- Create sale: 2x Product A at 150 ----------

	var firstSale *Sale

	t.Run("create_cash_sale", func(t *testing.T) {
		s, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			Lines: []SaleLineInput{
				{ProductID: d.ProductAID, Qty: 2, UnitPrice: 150, Discount: 0},
			},
			PaymentMethod: "cash",
			AmountPaid:    400,
			CaisseID:      d.CaisseID,
		})
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, strings.HasPrefix(s.Ref, "VTE-"), "ref starts with VTE-")
		firstSale = s
		refs = append(refs, s.Ref)
	})

	t.Run("stock_decremented", func(t *testing.T) {
		testutil.AssertStock(t, d.TenantID, d.ProductAID, 98, "A stock after selling 2")
	})

	t.Run("line_ht", func(t *testing.T) {
		testutil.AssertFloatEqual(t, firstSale.Lines[0].TotalHT, 300, "line HT = 2*150")
	})

	t.Run("line_vat", func(t *testing.T) {
		// totalVAT = 300 * 0.19 = 57
		testutil.AssertFloatEqual(t, firstSale.TotalVAT, 57, "total VAT = 300*0.19")
	})

	t.Run("line_ttc", func(t *testing.T) {
		// lineTTC = 300 + 57 = 357
		testutil.AssertFloatEqual(t, firstSale.Lines[0].TotalTTC, 357, "line TTC = 300+57")
	})

	t.Run("line_earning", func(t *testing.T) {
		// lineEarning = 300 - 2*100 = 100
		testutil.AssertFloatEqual(t, firstSale.Lines[0].LineEarning, 100, "line earning = 300 - 200")
	})

	t.Run("total_earning", func(t *testing.T) {
		testutil.AssertFloatEqual(t, firstSale.TotalEarning, 100, "total earning")
	})

	// ---------- Sell 3 more of A ----------

	t.Run("sell_more", func(t *testing.T) {
		s, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			Lines: []SaleLineInput{
				{ProductID: d.ProductAID, Qty: 3, UnitPrice: 150},
			},
			PaymentMethod: "cash",
			AmountPaid:    600,
			CaisseID:      d.CaisseID,
		})
		testutil.AssertNoError(t, err)
		refs = append(refs, s.Ref)
		testutil.AssertStock(t, d.TenantID, d.ProductAID, 95, "A stock after selling 3 more")
	})

	// ---------- Change calculation ----------

	t.Run("change_calculation", func(t *testing.T) {
		s, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			Lines: []SaleLineInput{
				{ProductID: d.ProductAID, Qty: 2, UnitPrice: 150},
			},
			PaymentMethod: "cash",
			AmountPaid:    400,
			CaisseID:      d.CaisseID,
		})
		testutil.AssertNoError(t, err)
		refs = append(refs, s.Ref)
		// total TTC = 357, timbre = CalcTimbre(357, "cash") = 3.57 → rounded = 3.57, but min 5 → 5
		// Change = 400 - 357 = 43 (Change is computed as AmountPaid - totalTTC, timbre not subtracted from change)
		expectedChange := 400.0 - 357.0
		testutil.AssertFloatEqual(t, s.Change, expectedChange, "change = amountPaid - totalTTC")
	})

	// ---------- Line discount ----------

	t.Run("line_discount", func(t *testing.T) {
		s, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			Lines: []SaleLineInput{
				{ProductID: d.ProductAID, Qty: 2, UnitPrice: 150, Discount: 20},
			},
			PaymentMethod: "cash",
			AmountPaid:    400,
			CaisseID:      d.CaisseID,
		})
		testutil.AssertNoError(t, err)
		refs = append(refs, s.Ref)
		// lineHT = 2*150 - 20 = 280
		testutil.AssertFloatEqual(t, s.Lines[0].TotalHT, 280, "line HT with discount = 2*150 - 20")
	})

	// ---------- Multi-line sale ----------

	t.Run("multi_line", func(t *testing.T) {
		s, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			Lines: []SaleLineInput{
				{ProductID: d.ProductAID, Qty: 1, UnitPrice: 150},
				{ProductID: d.ProductBID, Qty: 2, UnitPrice: 80},
			},
			PaymentMethod: "cash",
			AmountPaid:    500,
			CaisseID:      d.CaisseID,
		})
		testutil.AssertNoError(t, err)
		refs = append(refs, s.Ref)

		// Line A: HT=150, VAT=150*0.19=28.5, TTC=178.5
		testutil.AssertFloatEqual(t, s.Lines[0].TotalHT, 150, "multi line A HT")
		// Line B: HT=160, VAT=160*0.19=30.4, TTC=190.4
		testutil.AssertFloatEqual(t, s.Lines[1].TotalHT, 160, "multi line B HT")
		// Total = 178.5 + 190.4 = 368.9
		expectedTotal := 178.5 + 190.4
		testutil.AssertFloatEqual(t, s.Total, expectedTotal, "multi-line total TTC")
	})

	// ---------- Sell B ----------

	t.Run("sell_B", func(t *testing.T) {
		s, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			Lines: []SaleLineInput{
				{ProductID: d.ProductBID, Qty: 5, UnitPrice: 80},
			},
			PaymentMethod: "cash",
			AmountPaid:    500,
			CaisseID:      d.CaisseID,
		})
		testutil.AssertNoError(t, err)
		refs = append(refs, s.Ref)
		// B started at 100, sold 2 in multi_line, now selling 5 more → 100 - 2 - 5 = 93
		testutil.AssertStock(t, d.TenantID, d.ProductBID, 93, "B stock after selling 5")
	})

	// ---------- Ref increments ----------

	t.Run("ref_increments", func(t *testing.T) {
		testutil.AssertTrue(t, len(refs) >= 2, "at least 2 sale refs collected")
		for i := 0; i < len(refs); i++ {
			testutil.AssertTrue(t, strings.HasPrefix(refs[i], "VTE-"), "ref has VTE- prefix")
		}
		// Verify sequential: VTE-000001, VTE-000002, etc.
		testutil.AssertEqual(t, refs[0], "VTE-000001", "first ref")
		testutil.AssertEqual(t, refs[1], "VTE-000002", "second ref")
	})
}
