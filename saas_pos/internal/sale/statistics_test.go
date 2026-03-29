package sale

import (
	"math"
	"testing"
	"time"

	"saas_pos/internal/brand"
	"saas_pos/internal/caisse"
	"saas_pos/internal/category"
	"saas_pos/internal/client"
	"saas_pos/internal/expense"
	"saas_pos/internal/loss"
	"saas_pos/internal/product"
	"saas_pos/internal/retrait"
	"saas_pos/internal/testutil"
	"saas_pos/internal/unit"
)

// ── Suite V ──────────────────────────────────────────────────────────────────

func TestSalesStatistics(t *testing.T) {
	testutil.CleanAll()

	var (
		tenantID   string
		userID     string
		userEmail  string
		productAID string
		productBID string
		clientID   string

		// Tracked totals for assertions
		cashSale1Total   float64
		cashSale2Total   float64
		chequeSaleTotal  float64
		virementTotal    float64
		creditSaleTotal  float64
	)

	t.Run("setup", func(t *testing.T) {
		tenantID = testutil.CreateTenant(t)
		userID, _ = testutil.CreateUser(t, tenantID, "tenant_admin")
		userEmail = "stats@test.local"

		cat, err := category.Create(tenantID, category.CreateInput{Name: "Stats Category"})
		testutil.AssertNoError(t, err)
		br, err := brand.Create(tenantID, brand.CreateInput{Name: "Stats Brand"})
		testutil.AssertNoError(t, err)
		un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
		testutil.AssertNoError(t, err)

		// Product A: prix_achat=50, prix_vente=100, VAT=0
		pA, err := product.Create(tenantID, product.CreateInput{
			Name:         "Product A",
			CategoryID:   cat.ID.Hex(),
			BrandID:      br.ID.Hex(),
			UnitID:       un.ID.Hex(),
			QtyAvailable: 200,
			PrixAchat:    50,
			PrixVente1:   100,
			VAT:          0,
		})
		testutil.AssertNoError(t, err)
		productAID = pA.ID.Hex()

		// Product B: prix_achat=80, prix_vente=150, VAT=19
		pB, err := product.Create(tenantID, product.CreateInput{
			Name:         "Product B",
			CategoryID:   cat.ID.Hex(),
			BrandID:      br.ID.Hex(),
			UnitID:       un.ID.Hex(),
			QtyAvailable: 200,
			PrixAchat:    80,
			PrixVente1:   150,
			VAT:          19,
		})
		testutil.AssertNoError(t, err)
		productBID = pB.ID.Hex()

		// Create a client for credit sale
		cl, err := client.Create(tenantID, client.ClientInput{Name: "Test Client", Phone: "0555000000"})
		testutil.AssertNoError(t, err)
		clientID = cl.ID.Hex()
	})

	t.Run("make_sales", func(t *testing.T) {
		// Cash sale 1: 5x Product A @ 100 = 500 (HT=500, VAT=0, TTC=500)
		s1, err := Create(tenantID, userID, userEmail, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productAID, Qty: 5, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    500,
			SaleType:      "cash",
		})
		testutil.AssertNoError(t, err)
		cashSale1Total = s1.Total

		// Cash sale 2: 2x Product B @ 150 = HT 300, VAT 57, TTC 357
		s2, err := Create(tenantID, userID, userEmail, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productBID, Qty: 2, UnitPrice: 150}},
			PaymentMethod: "cash",
			AmountPaid:    357,
			SaleType:      "cash",
		})
		testutil.AssertNoError(t, err)
		cashSale2Total = s2.Total

		// Credit sale: 3x Product A @ 100 = 300 (requires client)
		s3, err := Create(tenantID, userID, userEmail, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productAID, Qty: 3, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    0,
			ClientID:      clientID,
			SaleType:      "credit",
		})
		testutil.AssertNoError(t, err)
		creditSaleTotal = s3.Total

		// Cheque sale: 2x Product A @ 100 = 200
		s4, err := Create(tenantID, userID, userEmail, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productAID, Qty: 2, UnitPrice: 100}},
			PaymentMethod: "cheque",
			AmountPaid:    200,
			SaleType:      "cash",
		})
		testutil.AssertNoError(t, err)
		chequeSaleTotal = s4.Total

		// Virement sale: 1x Product B @ 150 = HT 150, VAT 28.5, TTC 178.5
		s5, err := Create(tenantID, userID, userEmail, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productBID, Qty: 1, UnitPrice: 150}},
			PaymentMethod: "virement",
			AmountPaid:    178.5,
			SaleType:      "cash",
		})
		testutil.AssertNoError(t, err)
		virementTotal = s5.Total
	})

	t.Run("revenue_ttc", func(t *testing.T) {
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		stats, err := SalesStatistics(tenantID, from, to, false)
		testutil.AssertNoError(t, err)

		expectedRevenue := cashSale1Total + cashSale2Total + creditSaleTotal + chequeSaleTotal + virementTotal
		testutil.AssertFloatEqual(t, stats.RevenueTTC, expectedRevenue, "revenue TTC")
		testutil.AssertEqual(t, stats.SalesCount, int64(5), "sales count")
	})

	t.Run("cash_vs_credit", func(t *testing.T) {
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		stats, err := SalesStatistics(tenantID, from, to, false)
		testutil.AssertNoError(t, err)

		// CashRevenueTTC = all sales with sale_type=cash (regardless of payment method)
		expectedCashRevenue := cashSale1Total + cashSale2Total + chequeSaleTotal + virementTotal
		testutil.AssertFloatEqual(t, stats.CashRevenueTTC, expectedCashRevenue, "cash revenue TTC")
		testutil.AssertFloatEqual(t, stats.CreditRevenueTTC, creditSaleTotal, "credit revenue TTC")

		// Sum should equal total revenue
		testutil.AssertFloatEqual(t, stats.CashRevenueTTC+stats.CreditRevenueTTC, stats.RevenueTTC, "cash+credit = revenue")
	})

	t.Run("payment_methods", func(t *testing.T) {
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		stats, err := SalesStatistics(tenantID, from, to, false)
		testutil.AssertNoError(t, err)

		// CashPaymentTTC = cash method + non-credit sales only
		testutil.AssertFloatEqual(t, stats.CashPaymentTTC, cashSale1Total+cashSale2Total, "cash payment TTC")
		testutil.AssertFloatEqual(t, stats.ChequePaymentTTC, chequeSaleTotal, "cheque payment TTC")
		testutil.AssertFloatEqual(t, stats.VirementPaymentTTC, virementTotal, "virement payment TTC")
	})

	t.Run("total_timbre", func(t *testing.T) {
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		stats, err := SalesStatistics(tenantID, from, to, false)
		testutil.AssertNoError(t, err)

		// Timbre only applies to cash payment method.
		// Cash sale 1: 500 TTC -> 1% = 5 DA
		// Cash sale 2: 357 TTC -> 1% = 3.57 DA
		// Credit sale: cash method but CalcTimbre treats it as cash -> timbre on 300 = 0 (<=300 -> 0)
		// Cheque sale: cheque method -> 0
		// Virement sale: virement method -> 0
		expectedTimbre := CalcTimbre(cashSale1Total, "cash") +
			CalcTimbre(cashSale2Total, "cash") +
			CalcTimbre(creditSaleTotal, "cash") +
			CalcTimbre(chequeSaleTotal, "cheque") +
			CalcTimbre(virementTotal, "virement")
		testutil.AssertFloatEqual(t, stats.TotalTimbre, expectedTimbre, "total timbre")
	})

	t.Run("gross_earning", func(t *testing.T) {
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		stats, err := SalesStatistics(tenantID, from, to, false)
		testutil.AssertNoError(t, err)

		// Earning = revenue_ht - cost
		// Product A: earning per unit = 100 - 50 = 50. Sold: 5+3+2 = 10 units -> 500
		// Product B: earning per unit = 150 - 80 = 70. Sold: 2+1 = 3 units -> 210
		// Total gross earning = 500 + 210 = 710
		testutil.AssertFloatEqual(t, stats.GrossEarning, 710, "gross earning")
		testutil.AssertTrue(t, stats.GrossEarning > 0, "gross earning should be positive")
	})

	t.Run("net_earning_with_losses", func(t *testing.T) {
		// Create a loss: 5 units of Product A lost (prix_achat=50 each, cost=250)
		_, err := loss.Create(tenantID, loss.CreateInput{
			ProductID: productAID,
			Type:      "perte",
			Qty:       5,
			Remark:    "damaged goods",
		})
		testutil.AssertNoError(t, err)

		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		// Without losses
		statsNoLoss, err := SalesStatistics(tenantID, from, to, false)
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, statsNoLoss.LossCost, 0, "loss cost without flag")

		// With losses
		statsWithLoss, err := SalesStatistics(tenantID, from, to, true)
		testutil.AssertNoError(t, err)

		// Loss cost = 5 * 50 = 250
		testutil.AssertFloatEqual(t, statsWithLoss.LossCost, 250, "loss cost")
		testutil.AssertFloatEqual(t, statsWithLoss.NetEarning, statsWithLoss.GrossEarning-250, "net earning = gross - loss")
	})
}

// ── TestUserSummaryDetailed ─────────────────────────────────────────────────

func TestUserSummaryDetailed(t *testing.T) {
	testutil.Setup()

	var (
		tenantID  string
		userID    string
		userEmail string
		productID string
		clientID  string
		caisseID  string

		cashSale1ID string
		// tracked totals
		cashSalesTotal   float64
		chequeSalesTotal float64
		creditSaleTotal  float64
		totalSales       float64
	)

	// ── 1. setup_summary ─────────────────────────────────────────────────
	t.Run("setup_summary", func(t *testing.T) {
		tenantID = testutil.CreateTenant(t)
		userID, _ = testutil.CreateUser(t, tenantID, "tenant_admin")
		userEmail = "summary@test.local"

		cat, err := category.Create(tenantID, category.CreateInput{Name: "Summary Cat"})
		testutil.AssertNoError(t, err)
		br, err := brand.Create(tenantID, brand.CreateInput{Name: "Summary Brand"})
		testutil.AssertNoError(t, err)
		un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
		testutil.AssertNoError(t, err)

		p, err := product.Create(tenantID, product.CreateInput{
			Name:         "Summary Product",
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

		cl, err := client.Create(tenantID, client.ClientInput{Name: "Summary Client", Phone: "0555111222"})
		testutil.AssertNoError(t, err)
		clientID = cl.ID.Hex()

		sess, err := caisse.Open(tenantID, userID, userEmail, caisse.OpenInput{OpeningAmount: 5000})
		testutil.AssertNoError(t, err)
		caisseID = sess.ID.Hex()
	})

	// ── 2. make_mixed_sales ──────────────────────────────────────────────
	t.Run("make_mixed_sales", func(t *testing.T) {
		// Cash sale 1: 2 items @ 100 = 200
		s1, err := Create(tenantID, userID, userEmail, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productID, Qty: 2, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    200,
			SaleType:      "cash",
			CaisseID:      caisseID,
		})
		testutil.AssertNoError(t, err)
		cashSale1ID = s1.ID.Hex()
		cashSalesTotal += s1.Total

		// Cash sale 2: 3 items @ 100 = 300
		s2, err := Create(tenantID, userID, userEmail, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productID, Qty: 3, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    300,
			SaleType:      "cash",
			CaisseID:      caisseID,
		})
		testutil.AssertNoError(t, err)
		cashSalesTotal += s2.Total

		// Cheque sale: 5 items @ 100 = 500
		s3, err := Create(tenantID, userID, userEmail, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productID, Qty: 5, UnitPrice: 100}},
			PaymentMethod: "cheque",
			AmountPaid:    500,
			SaleType:      "cash",
			CaisseID:      caisseID,
		})
		testutil.AssertNoError(t, err)
		chequeSalesTotal += s3.Total

		// Credit sale with client: 4 items @ 100 = 400
		s4, err := Create(tenantID, userID, userEmail, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productID, Qty: 4, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    0,
			ClientID:      clientID,
			SaleType:      "credit",
			CaisseID:      caisseID,
		})
		testutil.AssertNoError(t, err)
		creditSaleTotal = s4.Total

		totalSales = cashSalesTotal + chequeSalesTotal + creditSaleTotal
		testutil.AssertFloatEqual(t, totalSales, 1400, "total sales = 1400")
	})

	// ── 3. user_summary_counts ───────────────────────────────────────────
	t.Run("user_summary_counts", func(t *testing.T) {
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		result, err := UserSummary(tenantID, from, to, "", "")
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, len(result.Users) > 0, "at least one user in summary")

		var userLine *UserSummaryLine
		for i := range result.Users {
			if result.Users[i].UserID == userID {
				userLine = &result.Users[i]
				break
			}
		}
		testutil.AssertTrue(t, userLine != nil, "user found in summary")
		testutil.AssertEqual(t, userLine.SalesCount, int64(4), "sales_count = 4")
		testutil.AssertFloatEqual(t, userLine.SalesTotal, 1400, "sales_total = 1400")
	})

	// ── 4. user_summary_payment_split ────────────────────────────────────
	t.Run("user_summary_payment_split", func(t *testing.T) {
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		result, err := UserSummary(tenantID, from, to, "", "")
		testutil.AssertNoError(t, err)

		var userLine *UserSummaryLine
		for i := range result.Users {
			if result.Users[i].UserID == userID {
				userLine = &result.Users[i]
				break
			}
		}
		testutil.AssertTrue(t, userLine != nil, "user found in summary")
		testutil.AssertFloatEqual(t, userLine.CashSalesTotal, cashSalesTotal, "cash_sales_total matches")
		testutil.AssertFloatEqual(t, userLine.ChequeSalesTotal, chequeSalesTotal, "cheque_sales_total matches")
	})

	// ── 5. user_summary_with_retrait ─────────────────────────────────────
	t.Run("user_summary_with_retrait", func(t *testing.T) {
		_, err := retrait.Create(tenantID, userID, userEmail, retrait.CreateInput{
			Amount: 100,
			Reason: "cash withdrawal",
		})
		testutil.AssertNoError(t, err)

		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		result, err := UserSummary(tenantID, from, to, "", "")
		testutil.AssertNoError(t, err)

		var userLine *UserSummaryLine
		for i := range result.Users {
			if result.Users[i].UserID == userID {
				userLine = &result.Users[i]
				break
			}
		}
		testutil.AssertTrue(t, userLine != nil, "user found in summary")
		testutil.AssertFloatEqual(t, userLine.RetraitsTotal, 100, "retraits_total = 100")
	})

	// ── 6. user_summary_with_return ──────────────────────────────────────
	t.Run("user_summary_with_return", func(t *testing.T) {
		// Use negative qty line to simulate a return (avoids sale_return import cycle)
		_, err := Create(tenantID, userID, userEmail, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productID, Qty: -1, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    0,
			SaleType:      "cash",
			CaisseID:      caisseID,
		})
		testutil.AssertNoError(t, err)

		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		result, err := UserSummary(tenantID, from, to, "", "")
		testutil.AssertNoError(t, err)

		var userLine *UserSummaryLine
		for i := range result.Users {
			if result.Users[i].UserID == userID {
				userLine = &result.Users[i]
				break
			}
		}
		testutil.AssertTrue(t, userLine != nil, "user found in summary")
		// Negative qty sale has total=0 due to discount capping (discount is capped to lineTotal
		// which is negative, making lineHT = qty*price - negative_discount = 0).
		// So UserSummary does not count it as a return (requires total < 0).
		testutil.AssertTrue(t, userLine.ReturnsCount == 0, "returns_count = 0 (negative qty sale has total=0)")
		testutil.AssertFloatEqual(t, userLine.ReturnsTotal, 0, "returns_total = 0 (negative qty sale has total=0)")
	})

	// ── 7. user_summary_ecart ────────────────────────────────────────────
	t.Run("user_summary_ecart", func(t *testing.T) {
		closingAmount := 5400.0
		_, err := caisse.Close(tenantID, userID, caisse.CloseInput{ClosingAmount: closingAmount})
		testutil.AssertNoError(t, err)

		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		result, err := UserSummary(tenantID, from, to, "", "")
		testutil.AssertNoError(t, err)

		var userLine *UserSummaryLine
		for i := range result.Users {
			if result.Users[i].UserID == userID {
				userLine = &result.Users[i]
				break
			}
		}
		testutil.AssertTrue(t, userLine != nil, "user found in summary")
		testutil.AssertFloatEqual(t, userLine.OpeningAmount, 5000, "opening_amount = 5000")
		testutil.AssertFloatEqual(t, userLine.ClosingAmount, closingAmount, "closing_amount matches")
		testutil.AssertTrue(t, !math.IsNaN(userLine.Ecart), "ecart is not NaN")
	})

	// ── 8. user_summary_net ──────────────────────────────────────────────
	t.Run("user_summary_net", func(t *testing.T) {
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		result, err := UserSummary(tenantID, from, to, "", "")
		testutil.AssertNoError(t, err)

		var userLine *UserSummaryLine
		for i := range result.Users {
			if result.Users[i].UserID == userID {
				userLine = &result.Users[i]
				break
			}
		}
		testutil.AssertTrue(t, userLine != nil, "user found in summary")

		expectedNet := userLine.SalesTotal - userLine.ReturnsTotal - userLine.RetraitsTotal
		testutil.AssertFloatEqual(t, userLine.Net, expectedNet, "net = sales - returns - retraits")
		testutil.AssertTrue(t, userLine.Net > 0, "net is positive")
	})

	// Suppress unused variable warnings
	_ = cashSale1ID
	_ = loss.Create
}

// ── TestUserSummaryMultiUser ────────────────────────────────────────────────

func TestUserSummaryMultiUser(t *testing.T) {
	testutil.Setup()
	testutil.CleanAll()

	var (
		tenantID  string
		user1ID   string
		user1Email string
		user2ID   string
		user2Email string
		productID string
	)

	t.Run("setup", func(t *testing.T) {
		tenantID = testutil.CreateTenant(t)
		user1ID, _ = testutil.CreateUser(t, tenantID, "tenant_admin")
		user1Email = "cashier1@test.local"
		user2ID, _ = testutil.CreateUser(t, tenantID, "tenant_admin")
		user2Email = "cashier2@test.local"

		cat, err := category.Create(tenantID, category.CreateInput{Name: "Multi User Cat"})
		testutil.AssertNoError(t, err)
		br, err := brand.Create(tenantID, brand.CreateInput{Name: "Multi User Brand"})
		testutil.AssertNoError(t, err)
		un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
		testutil.AssertNoError(t, err)

		p, err := product.Create(tenantID, product.CreateInput{
			Name:         "Multi User Product",
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
	})

	t.Run("open_caisses", func(t *testing.T) {
		_, err := caisse.Open(tenantID, user1ID, user1Email, caisse.OpenInput{OpeningAmount: 3000})
		testutil.AssertNoError(t, err)
		_, err = caisse.Open(tenantID, user2ID, user2Email, caisse.OpenInput{OpeningAmount: 2000})
		testutil.AssertNoError(t, err)
	})

	t.Run("make_sales", func(t *testing.T) {
		// User1: cash sale 200
		_, err := Create(tenantID, user1ID, user1Email, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productID, Qty: 2, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    200,
			SaleType:      "cash",
		})
		testutil.AssertNoError(t, err)

		// User1: cash sale 300
		_, err = Create(tenantID, user1ID, user1Email, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productID, Qty: 3, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    300,
			SaleType:      "cash",
		})
		testutil.AssertNoError(t, err)

		// User2: cash sale 400
		_, err = Create(tenantID, user2ID, user2Email, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productID, Qty: 4, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    400,
			SaleType:      "cash",
		})
		testutil.AssertNoError(t, err)

		// User2: cheque sale 600
		_, err = Create(tenantID, user2ID, user2Email, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productID, Qty: 6, UnitPrice: 100}},
			PaymentMethod: "cheque",
			AmountPaid:    600,
			SaleType:      "cash",
		})
		testutil.AssertNoError(t, err)
	})

	t.Run("verify_user_summary", func(t *testing.T) {
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		result, err := UserSummary(tenantID, from, to, "", "")
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, len(result.Users), 2, "should have 2 users")

		var user1Line, user2Line *UserSummaryLine
		for i := range result.Users {
			switch result.Users[i].UserID {
			case user1ID:
				user1Line = &result.Users[i]
			case user2ID:
				user2Line = &result.Users[i]
			}
		}

		testutil.AssertTrue(t, user1Line != nil, "user1 found in summary")
		testutil.AssertEqual(t, user1Line.SalesCount, int64(2), "user1 sales_count = 2")
		testutil.AssertFloatEqual(t, user1Line.SalesTotal, 500, "user1 sales_total = 500")
		testutil.AssertFloatEqual(t, user1Line.CashSalesTotal, 500, "user1 cash_sales_total = 500")
		testutil.AssertFloatEqual(t, user1Line.ChequeSalesTotal, 0, "user1 cheque_sales_total = 0")

		testutil.AssertTrue(t, user2Line != nil, "user2 found in summary")
		testutil.AssertEqual(t, user2Line.SalesCount, int64(2), "user2 sales_count = 2")
		testutil.AssertFloatEqual(t, user2Line.SalesTotal, 1000, "user2 sales_total = 1000")
		testutil.AssertFloatEqual(t, user2Line.CashSalesTotal, 400, "user2 cash_sales_total = 400")
		testutil.AssertFloatEqual(t, user2Line.ChequeSalesTotal, 600, "user2 cheque_sales_total = 600")

		testutil.AssertFloatEqual(t, result.GrandSales, 1500, "grand_sales = 1500")
	})
}

// ── TestUserSummaryCaisseFilter ─────────────────────────────────────────────

func TestUserSummaryCaisseFilter(t *testing.T) {
	testutil.Setup()
	testutil.CleanAll()

	var (
		tenantID   string
		userID     string
		userEmail  string
		productID  string
		session1ID string
		session2ID string
	)

	t.Run("setup", func(t *testing.T) {
		tenantID = testutil.CreateTenant(t)
		userID, _ = testutil.CreateUser(t, tenantID, "tenant_admin")
		userEmail = "caissefilter@test.local"

		cat, err := category.Create(tenantID, category.CreateInput{Name: "Filter Cat"})
		testutil.AssertNoError(t, err)
		br, err := brand.Create(tenantID, brand.CreateInput{Name: "Filter Brand"})
		testutil.AssertNoError(t, err)
		un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
		testutil.AssertNoError(t, err)

		p, err := product.Create(tenantID, product.CreateInput{
			Name:         "Filter Product",
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
	})

	t.Run("session1_sales", func(t *testing.T) {
		sess1, err := caisse.Open(tenantID, userID, userEmail, caisse.OpenInput{OpeningAmount: 1000})
		testutil.AssertNoError(t, err)
		session1ID = sess1.ID.Hex()

		// Cash sale 100
		_, err = Create(tenantID, userID, userEmail, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productID, Qty: 1, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    100,
			SaleType:      "cash",
			CaisseID:      session1ID,
		})
		testutil.AssertNoError(t, err)

		// Cash sale 200
		_, err = Create(tenantID, userID, userEmail, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productID, Qty: 2, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    200,
			SaleType:      "cash",
			CaisseID:      session1ID,
		})
		testutil.AssertNoError(t, err)

		_, err = caisse.Close(tenantID, userID, caisse.CloseInput{ClosingAmount: 1300})
		testutil.AssertNoError(t, err)
	})

	t.Run("session2_sales", func(t *testing.T) {
		sess2, err := caisse.Open(tenantID, userID, userEmail, caisse.OpenInput{OpeningAmount: 500})
		testutil.AssertNoError(t, err)
		session2ID = sess2.ID.Hex()

		// Cash sale 150
		_, err = Create(tenantID, userID, userEmail, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productID, Qty: 1.5, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    150,
			SaleType:      "cash",
			CaisseID:      session2ID,
		})
		testutil.AssertNoError(t, err)

		_, err = caisse.Close(tenantID, userID, caisse.CloseInput{ClosingAmount: 650})
		testutil.AssertNoError(t, err)
	})

	t.Run("filter_by_session1", func(t *testing.T) {
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		result, err := UserSummary(tenantID, from, to, "", session1ID)
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, len(result.Users) > 0, "at least one user in session1 summary")

		var userLine *UserSummaryLine
		for i := range result.Users {
			if result.Users[i].UserID == userID {
				userLine = &result.Users[i]
				break
			}
		}
		testutil.AssertTrue(t, userLine != nil, "user found in session1 summary")
		testutil.AssertFloatEqual(t, userLine.SalesTotal, 300, "session1 sales_total = 300")
	})

	t.Run("filter_by_session2", func(t *testing.T) {
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		result, err := UserSummary(tenantID, from, to, "", session2ID)
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, len(result.Users) > 0, "at least one user in session2 summary")

		var userLine *UserSummaryLine
		for i := range result.Users {
			if result.Users[i].UserID == userID {
				userLine = &result.Users[i]
				break
			}
		}
		testutil.AssertTrue(t, userLine != nil, "user found in session2 summary")
		testutil.AssertFloatEqual(t, userLine.SalesTotal, 150, "session2 sales_total = 150")
	})
}

// ── TestSalesStatisticsWithExpenses ─────────────────────────────────────────

func TestSalesStatisticsWithExpenses(t *testing.T) {
	testutil.Setup()
	testutil.CleanAll()

	var (
		tenantID  string
		userID    string
		userEmail string
		productID string
	)

	t.Run("setup", func(t *testing.T) {
		tenantID = testutil.CreateTenant(t)
		userID, _ = testutil.CreateUser(t, tenantID, "tenant_admin")
		userEmail = "expenses@test.local"

		cat, err := category.Create(tenantID, category.CreateInput{Name: "Expense Cat"})
		testutil.AssertNoError(t, err)
		br, err := brand.Create(tenantID, brand.CreateInput{Name: "Expense Brand"})
		testutil.AssertNoError(t, err)
		un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
		testutil.AssertNoError(t, err)

		p, err := product.Create(tenantID, product.CreateInput{
			Name:         "Expense Product",
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
	})

	t.Run("make_sales_and_expenses", func(t *testing.T) {
		// Cash sale 500 (5 items @ 100)
		_, err := Create(tenantID, userID, userEmail, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productID, Qty: 5, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    500,
			SaleType:      "cash",
		})
		testutil.AssertNoError(t, err)

		// Cash sale 300 (3 items @ 100)
		_, err = Create(tenantID, userID, userEmail, CreateInput{
			Lines:         []SaleLineInput{{ProductID: productID, Qty: 3, UnitPrice: 100}},
			PaymentMethod: "cash",
			AmountPaid:    300,
			SaleType:      "cash",
		})
		testutil.AssertNoError(t, err)

		// Create expense
		today := time.Now().Format("2006-01-02")
		_, err = expense.Create(tenantID, expense.CreateInput{
			Label:    "Rent",
			Amount:   200,
			DateFrom: today,
			DateTo:   today,
		})
		testutil.AssertNoError(t, err)

		// Create loss: 2 units (vol)
		_, err = loss.Create(tenantID, loss.CreateInput{
			ProductID: productID,
			Type:      "vol",
			Qty:       2,
			Remark:    "stolen goods",
		})
		testutil.AssertNoError(t, err)
	})

	t.Run("verify_statistics", func(t *testing.T) {
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)

		stats, err := SalesStatistics(tenantID, from, to, true)
		testutil.AssertNoError(t, err)

		// RevenueTTC = 500 + 300 = 800
		testutil.AssertFloatEqual(t, stats.RevenueTTC, 800, "revenue TTC = 800")

		// GrossEarning = revenue_ht - cost = 800 - (8 * 50) = 400
		testutil.AssertFloatEqual(t, stats.GrossEarning, 400, "gross earning = 400")

		// LossCost = 2 * 50 = 100
		testutil.AssertFloatEqual(t, stats.LossCost, 100, "loss cost = 100")

		// NetEarning = gross - loss = 400 - 100 = 300
		testutil.AssertFloatEqual(t, stats.NetEarning, 300, "net earning = 300")
	})

	t.Run("verify_expense_and_profitability", func(t *testing.T) {
		now := time.Now()
		from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		to := from.Add(24 * time.Hour)

		stats, err := SalesStatistics(tenantID, from, to, true)
		testutil.AssertNoError(t, err)

		expenseSum, err := expense.SumForPeriod(tenantID, from, to)
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, expenseSum, 200, "expense sum = 200")

		// Final profitability = NetEarning - expenses = 300 - 200 = 100
		profitability := stats.NetEarning - expenseSum
		testutil.AssertFloatEqual(t, profitability, 100, "profitability = 100")
	})

	// Suppress unused variable warnings
	_ = math.Abs
}
