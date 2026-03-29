package caisse_test

import (
	"testing"
	"time"

	"saas_pos/internal/brand"
	"saas_pos/internal/caisse"
	"saas_pos/internal/category"
	"saas_pos/internal/product"
	"saas_pos/internal/retrait"
	"saas_pos/internal/sale"
	"saas_pos/internal/testutil"
	"saas_pos/internal/unit"
)

// ── Suite U ──────────────────────────────────────────────────────────────────

func TestCaisseReconciliation(t *testing.T) {
	testutil.Setup()
	testutil.CleanAll()

	var (
		tenantID  string
		userID    string
		userEmail string
		productID string
		caisseID  string
	)

	t.Run("setup", func(t *testing.T) {
		tenantID = testutil.CreateTenant(t)
		userID, _ = testutil.CreateUser(t, tenantID, "tenant_admin")
		userEmail = "reconciliation@test.local"

		cat, err := category.Create(tenantID, category.CreateInput{Name: "General"})
		testutil.AssertNoError(t, err)
		br, err := brand.Create(tenantID, brand.CreateInput{Name: "BrandA"})
		testutil.AssertNoError(t, err)
		un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
		testutil.AssertNoError(t, err)

		p, err := product.Create(tenantID, product.CreateInput{
			Name:         "Product A",
			CategoryID:   cat.ID.Hex(),
			BrandID:      br.ID.Hex(),
			UnitID:       un.ID.Hex(),
			QtyAvailable: 100,
			PrixAchat:    50,
			PrixVente1:   100,
			VAT:          0,
		})
		testutil.AssertNoError(t, err)
		productID = p.ID.Hex()

		sess, err := caisse.Open(tenantID, userID, userEmail, caisse.OpenInput{OpeningAmount: 5000})
		testutil.AssertNoError(t, err)
		caisseID = sess.ID.Hex()
		testutil.AssertFloatEqual(t, sess.OpeningAmount, 5000, "opening amount")
	})

	t.Run("make_sales", func(t *testing.T) {
		s1, err := sale.Create(tenantID, userID, userEmail, sale.CreateInput{
			Lines:         []sale.SaleLineInput{{ProductID: productID, Qty: 3, UnitPrice: 100}},
			PaymentMethod: "cash", AmountPaid: 300, SaleType: "cash", CaisseID: caisseID,
		})
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, s1.Total, 300, "sale 1 total")

		s2, err := sale.Create(tenantID, userID, userEmail, sale.CreateInput{
			Lines:         []sale.SaleLineInput{{ProductID: productID, Qty: 3, UnitPrice: 100}},
			PaymentMethod: "cash", AmountPaid: 300, SaleType: "cash", CaisseID: caisseID,
		})
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, s2.Total, 300, "sale 2 total")

		s3, err := sale.Create(tenantID, userID, userEmail, sale.CreateInput{
			Lines:         []sale.SaleLineInput{{ProductID: productID, Qty: 4, UnitPrice: 100}},
			PaymentMethod: "cash", AmountPaid: 400, SaleType: "cash", CaisseID: caisseID,
		})
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, s3.Total, 400, "sale 3 total")
	})

	t.Run("make_retrait", func(t *testing.T) {
		r, err := retrait.Create(tenantID, userID, userEmail, retrait.CreateInput{
			Amount: 200, Reason: "cash withdrawal for supplies",
		})
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, r.Amount, 200, "retrait amount")
	})

	t.Run("close_caisse", func(t *testing.T) {
		sess, err := caisse.Close(tenantID, userID, caisse.CloseInput{ClosingAmount: 5800})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, sess.Status, "closed", "session status")
	})

	t.Run("user_summary", func(t *testing.T) {
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		summary, err := sale.UserSummary(tenantID, from, to, userID, "")
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, len(summary.Users) > 0, "should have at least one user in summary")

		u := summary.Users[0]
		testutil.AssertEqual(t, u.SalesCount, int64(3), "sales count")
		testutil.AssertFloatEqual(t, u.SalesTotal, 1000, "sales total")
		testutil.AssertFloatEqual(t, u.RetraitsTotal, 200, "retraits total")
	})

	t.Run("ecart_calculation", func(t *testing.T) {
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		summary, err := sale.UserSummary(tenantID, from, to, userID, "")
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, len(summary.Users) > 0, "should have user data")

		u := summary.Users[0]
		expectedCash := 5000.0 + u.CashSalesTotal + u.TimbreTotal - u.ReturnsTotal - u.RetraitsTotal
		ecart := u.ClosingAmount - expectedCash
		testutil.AssertFloatEqual(t, u.Ecart, ecart, "ecart matches formula")
	})
}
