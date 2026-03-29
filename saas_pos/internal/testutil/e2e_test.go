package testutil

import (
	"math"
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
	"saas_pos/internal/price_history"
	"saas_pos/internal/product"
	"saas_pos/internal/purchase"
	"saas_pos/internal/retrait"
	"saas_pos/internal/sale"
	"saas_pos/internal/sale_return"
	"saas_pos/internal/supplier"
	"saas_pos/internal/supplier_product"
	"saas_pos/internal/transfer"
	"saas_pos/internal/unit"
	"saas_pos/internal/variant"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestE2E_FullLifecycle(t *testing.T) {
	Setup()
	CleanAll()

	// 1. Create tenant and user
	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "user@test.local"

	// 2. Create category, brand, unit
	cat, err := category.Create(tenantID, category.CreateInput{Name: "Electronics"})
	AssertNoError(t, err)
	AssertNotEmpty(t, cat.ID.Hex(), "category ID")

	br, err := brand.Create(tenantID, brand.CreateInput{Name: "TestBrand"})
	AssertNoError(t, err)
	AssertNotEmpty(t, br.ID.Hex(), "brand ID")

	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)
	AssertNotEmpty(t, un.ID.Hex(), "unit ID")

	// 3. Create product A (qty=0, prix_achat=100, prix_vente1=150, VAT=19)
	prodA, err := product.Create(tenantID, product.CreateInput{
		Name:       "Product A",
		Barcodes:   []string{"1234567890"},
		CategoryID: cat.ID.Hex(),
		BrandID:    br.ID.Hex(),
		UnitID:     un.ID.Hex(),
		PrixAchat:  100,
		PrixVente1: 150,
		VAT:        19,
	})
	AssertNoError(t, err)
	productID := prodA.ID.Hex()
	AssertStock(t, tenantID, productID, 0, "initial stock = 0")

	// 4. Create supplier
	sup, err := supplier.Create(tenantID, supplier.CreateInput{
		Name:  "Supplier One",
		Phone: "0555000000",
	})
	AssertNoError(t, err)
	AssertNotEmpty(t, sup.ID.Hex(), "supplier ID")

	// 5. Create purchase (A x10 @100), validate full
	purch, err := purchase.Create(tenantID, userID, userEmail, purchase.CreateInput{
		SupplierID: sup.ID.Hex(),
		Lines: []purchase.LineInput{
			{ProductID: productID, Qty: 10, PrixAchat: 100},
		},
	})
	AssertNoError(t, err)

	validateLines := []purchase.ValidateLineInput{
		{ProductID: productID, ReceivedQty: 10},
	}
	_, err = purchase.Validate(tenantID, purch.ID.Hex(), userID, userEmail, &purchase.ValidateInput{
		Lines: validateLines,
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 10, "stock after 1st purchase")
	AssertFloatEqual(t, GetProductPrixAchat(t, tenantID, productID), 100, "prix_achat after 1st purchase")

	// 6. Open caisse (5000)
	caisseSession, err := caisse.Open(tenantID, userID, userEmail, caisse.OpenInput{
		OpeningAmount: 5000,
	})
	AssertNoError(t, err)
	AssertNotEmpty(t, caisseSession.ID.Hex(), "caisse session ID")

	// 7. Sell 2xA (cash, price=150)
	sale1, err := sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines: []sale.SaleLineInput{
			{ProductID: productID, Qty: 2, UnitPrice: 150},
		},
		PaymentMethod: "cash",
		AmountPaid:    500,
		SaleType:      "cash",
		CaisseID:      caisseSession.ID.Hex(),
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 8, "stock after sale 1 (2 units)")

	// 8. Sell 3xA more
	sale2, err := sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines: []sale.SaleLineInput{
			{ProductID: productID, Qty: 3, UnitPrice: 150},
		},
		PaymentMethod: "cash",
		AmountPaid:    600,
		SaleType:      "cash",
		CaisseID:      caisseSession.ID.Hex(),
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 5, "stock after sale 2 (3 units)")

	// 9. Return 1 from sale at step 7
	_, err = sale_return.Create(tenantID, userID, userEmail, sale1.ID.Hex(), sale_return.CreateInput{
		Lines: []sale_return.ReturnLineInput{
			{ProductID: productID, Qty: 1, Reason: "defective"},
		},
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 6, "stock after return of 1 from sale1")

	// 10. Create 2nd purchase (A x4 @120), validate
	purch2, err := purchase.Create(tenantID, userID, userEmail, purchase.CreateInput{
		SupplierID: sup.ID.Hex(),
		Lines: []purchase.LineInput{
			{ProductID: productID, Qty: 4, PrixAchat: 120},
		},
	})
	AssertNoError(t, err)

	_, err = purchase.Validate(tenantID, purch2.ID.Hex(), userID, userEmail, &purchase.ValidateInput{
		Lines: []purchase.ValidateLineInput{
			{ProductID: productID, ReceivedQty: 4},
		},
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 10, "stock after 2nd purchase")
	// Weighted average: (6*100 + 4*120) / 10 = 108
	AssertFloatEqual(t, GetProductPrixAchat(t, tenantID, productID), 108, "prix_achat weighted average")

	// 11. Create loss (type=vol, qty=1)
	_, err = loss.Create(tenantID, loss.CreateInput{
		ProductID: productID,
		Type:      "vol",
		Qty:       1,
		Remark:    "theft",
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 9, "stock after loss of 1")

	// 12. Adjust stock to 12
	_, err = adjustment.Create(tenantID, userID, userEmail, adjustment.CreateInput{
		ProductID: productID,
		QtyAfter:  12,
		Reason:    "inventory count correction",
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 12, "stock after adjustment to 12")

	// 13. Sell 7xA
	sale3, err := sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines: []sale.SaleLineInput{
			{ProductID: productID, Qty: 7, UnitPrice: 150},
		},
		PaymentMethod: "cash",
		AmountPaid:    1500,
		SaleType:      "cash",
		CaisseID:      caisseSession.ID.Hex(),
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 5, "stock after sale 3 (7 units)")

	// 14. Return 2 from step 13 sale
	_, err = sale_return.Create(tenantID, userID, userEmail, sale3.ID.Hex(), sale_return.CreateInput{
		Lines: []sale_return.ReturnLineInput{
			{ProductID: productID, Qty: 2, Reason: "wrong item"},
		},
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, productID, 7, "stock after return of 2 from sale3")

	// 15. Create retrait (500)
	_, err = retrait.Create(tenantID, userID, userEmail, retrait.CreateInput{
		Amount: 500,
		Reason: "cash withdrawal",
	})
	AssertNoError(t, err)

	// 16. Close caisse and verify stats
	closedSession, err := caisse.Close(tenantID, userID, caisse.CloseInput{
		ClosingAmount: 5000,
		Notes:         "end of day",
	})
	AssertNoError(t, err)
	AssertEqual(t, closedSession.Status, "closed", "caisse status after close")

	// Verify sales took place: list sales in the period
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	endOfDay := startOfDay.Add(24 * time.Hour)
	salesResult, err := sale.List(tenantID, startOfDay, endOfDay, 1, 10, "")
	AssertNoError(t, err)
	AssertTrue(t, salesResult.Total >= 3, "at least 3 sales recorded")

	// ── 17. SalesStatistics verification ──
	stats, err := sale.SalesStatistics(tenantID, startOfDay, endOfDay, true)
	AssertNoError(t, err)
	AssertTrue(t, stats.SalesCount >= 3, "SalesStatistics: SalesCount >= 3")
	AssertTrue(t, stats.RevenueTTC > 0, "SalesStatistics: RevenueTTC > 0")
	AssertTrue(t, stats.RevenueHT > 0, "SalesStatistics: RevenueHT > 0")
	AssertTrue(t, stats.TotalVAT > 0, "SalesStatistics: TotalVAT > 0 (product has VAT=19)")
	AssertTrue(t, stats.GrossEarning > 0, "SalesStatistics: GrossEarning > 0")
	AssertTrue(t, stats.CashPaymentTTC > 0, "SalesStatistics: CashPaymentTTC > 0 (all cash)")
	AssertFloatEqual(t, stats.ChequePaymentTTC, 0, "SalesStatistics: ChequePaymentTTC == 0")
	AssertFloatEqual(t, stats.VirementPaymentTTC, 0, "SalesStatistics: VirementPaymentTTC == 0")
	AssertTrue(t, stats.TotalTimbre >= 0, "SalesStatistics: TotalTimbre >= 0")
	AssertTrue(t, stats.LossCost > 0, "SalesStatistics: LossCost > 0 (1 unit lost)")
	AssertFloatEqual(t, stats.NetEarning, stats.GrossEarning-stats.LossCost, "SalesStatistics: NetEarning == GrossEarning - LossCost")
	AssertFloatEqual(t, stats.CashRevenueTTC, stats.RevenueTTC, "SalesStatistics: CashRevenueTTC == RevenueTTC (all cash)")
	AssertFloatEqual(t, stats.CreditRevenueTTC, 0, "SalesStatistics: CreditRevenueTTC == 0")

	// ── 18. UserSummary verification ──
	summary, err := sale.UserSummary(tenantID, startOfDay, endOfDay, "", "")
	AssertNoError(t, err)
	AssertTrue(t, len(summary.Users) > 0, "UserSummary: at least 1 user line")

	// Find our user's line
	var userLine *sale.UserSummaryLine
	for i := range summary.Users {
		if summary.Users[i].UserID == userID {
			userLine = &summary.Users[i]
			break
		}
	}
	AssertTrue(t, userLine != nil, "UserSummary: found our user in result")
	AssertTrue(t, userLine.SalesCount >= 3, "UserSummary: SalesCount >= 3")
	AssertTrue(t, userLine.SalesTotal > 0, "UserSummary: SalesTotal > 0")
	AssertFloatEqual(t, userLine.CashSalesTotal, userLine.SalesTotal, "UserSummary: CashSalesTotal == SalesTotal (all cash)")
	AssertFloatEqual(t, userLine.RetraitsTotal, 500, "UserSummary: RetraitsTotal == 500")
	AssertFloatEqual(t, userLine.OpeningAmount, 5000, "UserSummary: OpeningAmount == 5000")
	AssertFloatEqual(t, userLine.ClosingAmount, 5000, "UserSummary: ClosingAmount == 5000")
	expectedNet := userLine.SalesTotal - userLine.ReturnsTotal - userLine.RetraitsTotal
	AssertFloatEqual(t, userLine.Net, expectedNet, "UserSummary: Net == SalesTotal - ReturnsTotal - RetraitsTotal")
	expectedEcart := userLine.ClosingAmount - (userLine.OpeningAmount + userLine.CashSalesTotal + userLine.TimbreTotal - userLine.ReturnsTotal - userLine.RetraitsTotal)
	AssertFalse(t, math.IsNaN(expectedEcart), "UserSummary: Ecart is not NaN")
	AssertFloatEqual(t, userLine.Ecart, expectedEcart, "UserSummary: Ecart matches expected formula")

	// ── 19. Expense verification ──
	dateStr := now.Format("2006-01-02")
	_, err = expense.Create(tenantID, expense.CreateInput{
		Label:    "Rent",
		Amount:   1000,
		DateFrom: dateStr,
		DateTo:   dateStr,
	})
	AssertNoError(t, err)
	expenseSum, err := expense.SumForPeriod(tenantID, startOfDay, endOfDay)
	AssertNoError(t, err)
	AssertFloatEqual(t, expenseSum, 1000, "Expense: SumForPeriod == 1000")

	// ── 20. Credit sale + client payment flow ──
	cl, err := client.Create(tenantID, client.ClientInput{
		Name:  "Test Client",
		Phone: "0555111111",
	})
	AssertNoError(t, err)
	AssertNotEmpty(t, cl.ID.Hex(), "client ID")

	// Verify client starts with zero balance
	balanceBefore := GetClientBalance(t, tenantID, cl.ID.Hex())
	AssertFloatEqual(t, balanceBefore, 0, "Client: initial balance == 0")

	// Create credit sale for 3xA @150 to client
	creditSale, err := sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines: []sale.SaleLineInput{
			{ProductID: productID, Qty: 3, UnitPrice: 150},
		},
		PaymentMethod: "cash",
		AmountPaid:    0,
		ClientID:      cl.ID.Hex(),
		SaleType:      "credit",
	})
	AssertNoError(t, err)
	AssertNotEmpty(t, creditSale.ID.Hex(), "credit sale ID")

	// Verify client balance increased
	balanceAfterSale := GetClientBalance(t, tenantID, cl.ID.Hex())
	AssertTrue(t, balanceAfterSale > 0, "Client: balance increased after credit sale")

	// Add client payment for half the balance
	halfBalance := math.Round(balanceAfterSale/2*100) / 100
	_, err = client.AddPayment(tenantID, cl.ID.Hex(), client.PaymentInput{
		Amount: halfBalance,
		Note:   "partial payment",
	})
	AssertNoError(t, err)

	// Verify balance decreased
	balanceAfterPayment := GetClientBalance(t, tenantID, cl.ID.Hex())
	AssertTrue(t, balanceAfterPayment < balanceAfterSale, "Client: balance decreased after payment")
	AssertFloatEqual(t, balanceAfterPayment, balanceAfterSale-halfBalance, "Client: balance == original - payment")

	// Verify PaymentsSum
	paySum, err := client.PaymentsSum(tenantID, startOfDay, endOfDay)
	AssertNoError(t, err)
	AssertTrue(t, paySum > 0, "Client: PaymentsSum > 0")

	// ── 21. Final stock check ──
	// Credit sale sold 3 units: stock was 7 before, now should be 4
	AssertStock(t, tenantID, productID, 4, "final stock after credit sale (7 - 3 = 4)")

	// Suppress unused variable warnings
	_ = sale2
	_ = creditSale
}

// ══════════════════════════════════════════════════════════════════════════════
// TestE2E_VariantsAndTransfers
// Covers: variant CRUD, parent stock sync, variant sale, locations, transfers
// ══════════════════════════════════════════════════════════════════════════════

func TestE2E_VariantsAndTransfers(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "vt@test.local"

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Clothing"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "FashionB"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	// 1. Create parent product (qty=0, will be synced from variants)
	parent, err := product.Create(tenantID, product.CreateInput{
		Name: "T-Shirt", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 80, PrixVente1: 120, VAT: 0,
	})
	AssertNoError(t, err)
	parentID := parent.ID.Hex()

	// 2. Create variant V1 (Red/M, qty=20)
	v1, err := variant.Create(tenantID, parentID, variant.CreateInput{
		Attributes: map[string]string{"color": "Red", "size": "M"},
		Barcodes:   []string{"VAR001"},
		QtyAvailable: 20, PrixAchat: 80, PrixVente1: 120,
	})
	AssertNoError(t, err)
	AssertNotEmpty(t, v1.ID.Hex(), "V1 ID")

	// 3. Create variant V2 (Blue/L, qty=30)
	v2, err := variant.Create(tenantID, parentID, variant.CreateInput{
		Attributes: map[string]string{"color": "Blue", "size": "L"},
		Barcodes:   []string{"VAR002"},
		QtyAvailable: 30, PrixAchat: 85, PrixVente1: 125,
	})
	AssertNoError(t, err)

	// 4. Parent stock synced = 50
	AssertStock(t, tenantID, parentID, 50, "parent stock synced = 20+30")

	// 5. ListByProduct returns 2 variants
	variants, err := variant.ListByProduct(tenantID, parentID)
	AssertNoError(t, err)
	AssertEqual(t, len(variants), 2, "2 variants listed")

	// 6. FindByBarcode
	found, err := variant.FindByBarcode(tenantID, "VAR001")
	AssertNoError(t, err)
	AssertEqual(t, found.ID.Hex(), v1.ID.Hex(), "FindByBarcode returns V1")

	// 7. Sell 5xV1 → V1 stock=15, parent stock=45
	_, err = sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines: []sale.SaleLineInput{
			{ProductID: parentID, VariantID: v1.ID.Hex(), Qty: 5, UnitPrice: 120},
		},
		PaymentMethod: "cash", AmountPaid: 600, SaleType: "cash",
	})
	AssertNoError(t, err)
	AssertVariantStockEqual(t, v1.ID.Hex(), 15, "V1 stock after sale")
	AssertStock(t, tenantID, parentID, 45, "parent stock after variant sale")

	// 8. Update V2 prix_vente1 to 130
	updatedV2, err := variant.Update(tenantID, v2.ID.Hex(), variant.UpdateInput{
		Attributes: map[string]string{"color": "Blue", "size": "L"},
		Barcodes:   []string{"VAR002"},
		QtyAvailable: 30, PrixAchat: 85, PrixVente1: 130, IsActive: true,
	})
	AssertNoError(t, err)
	AssertFloatEqual(t, updatedV2.PrixVente1, 130, "V2 prix_vente1 updated to 130")

	// 9. Create 2 locations
	loc1, err := location.Create(tenantID, location.CreateInput{Name: "Main Store", Address: "123 Main St"})
	AssertNoError(t, err)
	loc2, err := location.Create(tenantID, location.CreateInput{Name: "Warehouse", Address: "456 Industrial"})
	AssertNoError(t, err)

	// 10. List locations = 2
	locs, err := location.List(tenantID)
	AssertNoError(t, err)
	AssertEqual(t, len(locs), 2, "2 locations")

	// 11. Create transfer: Main → Warehouse, parent product x5
	tr, err := transfer.Create(tenantID, userID, userEmail, transfer.CreateInput{
		FromLocationID: loc1.ID.Hex(),
		ToLocationID:   loc2.ID.Hex(),
		Lines:          []transfer.TransferLineInput{{ProductID: parentID, Qty: 5}},
	})
	AssertNoError(t, err)
	AssertEqual(t, tr.Status, "draft", "transfer status = draft")

	// 12. Complete transfer
	completed, err := transfer.Complete(tenantID, tr.ID.Hex())
	AssertNoError(t, err)
	AssertEqual(t, completed.Status, "completed", "transfer status = completed")

	// 13. List transfers
	trList, err := transfer.List(tenantID, 1, 10)
	AssertNoError(t, err)
	AssertTrue(t, trList.Total >= 1, "at least 1 transfer")

	// 14. Delete V2 → only V1 remains, parent stock re-synced
	err = variant.Delete(tenantID, v2.ID.Hex())
	AssertNoError(t, err)
	variants2, err := variant.ListByProduct(tenantID, parentID)
	AssertNoError(t, err)
	AssertEqual(t, len(variants2), 1, "1 variant after delete")
	AssertStock(t, tenantID, parentID, 15, "parent stock re-synced to V1 only (15)")
}

// ══════════════════════════════════════════════════════════════════════════════
// TestE2E_FacturationFlow
// Covers: BC → Devis → Facture → Pay → Avoir, full document lifecycle
// ══════════════════════════════════════════════════════════════════════════════

func TestE2E_FacturationFlow(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "fact@test.local"

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Office"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "OfficeBrand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name: "Printer Paper", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 50, PrixAchat: 60, PrixVente1: 100, VAT: 19,
	})
	AssertNoError(t, err)
	productID := p.ID.Hex()

	cl, err := client.Create(tenantID, client.ClientInput{Name: "FactClient", Phone: "0555222333"})
	AssertNoError(t, err)
	clientID := cl.ID.Hex()

	// 1. Create Bon de Commande
	bc, err := facturation.Create(tenantID, userID, userEmail, facturation.CreateInput{
		DocType:  "bc",
		ClientID: clientID,
		Lines:    []facturation.LineInput{{ProductID: productID, Qty: 5, UnitPrice: 100}},
	})
	AssertNoError(t, err)
	AssertEqual(t, bc.DocType, "bc", "doc_type = bc")
	AssertNotEmpty(t, bc.ID.Hex(), "BC ID")
	AssertStock(t, tenantID, productID, 50, "stock unchanged after BC")

	// 2. Create Devis separately
	devis, err := facturation.Create(tenantID, userID, userEmail, facturation.CreateInput{
		DocType:  "devis",
		ClientID: clientID,
		Lines:    []facturation.LineInput{{ProductID: productID, Qty: 5, UnitPrice: 100}},
	})
	AssertNoError(t, err)
	AssertEqual(t, devis.DocType, "devis", "doc_type = devis")
	AssertStock(t, tenantID, productID, 50, "stock unchanged after Devis")

	// 3. Convert BC → Facture
	factureFBC, err := facturation.Convert(tenantID, bc.ID.Hex(), userID, userEmail, facturation.ConvertInput{
		PaymentMethod: "cash",
	})
	AssertNoError(t, err)
	AssertEqual(t, factureFBC.DocType, "facture", "BC converted to facture")

	// 4. Convert Devis → Facture
	facture, err := facturation.Convert(tenantID, devis.ID.Hex(), userID, userEmail, facturation.ConvertInput{
		PaymentMethod: "cash",
	})
	AssertNoError(t, err)
	AssertEqual(t, facture.DocType, "facture", "Devis converted to facture")
	AssertTrue(t, facture.Total > 0, "facture total > 0")
	AssertStock(t, tenantID, productID, 40, "stock decreased by 10 after 2 factures (BC+Devis)")

	// 4. Verify facture includes VAT
	got, err := facturation.GetByID(tenantID, facture.ID.Hex())
	AssertNoError(t, err)
	AssertTrue(t, got.TotalVAT > 0, "facture has VAT (product VAT=19)")
	AssertTrue(t, got.Total > got.TotalHT, "TTC > HT")

	// 5. Pay partial (200)
	afterPay1, err := facturation.Pay(tenantID, facture.ID.Hex(), facturation.PayInput{
		Amount: 200, PaymentMethod: "cash", Note: "partial",
	})
	AssertNoError(t, err)
	AssertFloatEqual(t, afterPay1.PaidAmount, 200, "paid_amount = 200")
	AssertEqual(t, afterPay1.Status, "partial", "status = partial")

	// 6. Pay remaining
	remaining := facture.Total - 200
	afterPay2, err := facturation.Pay(tenantID, facture.ID.Hex(), facturation.PayInput{
		Amount: remaining, PaymentMethod: "cash", Note: "final",
	})
	AssertNoError(t, err)
	AssertEqual(t, afterPay2.Status, "paid", "status = paid")

	// 7. Create Avoir for 2 items
	avoir, err := facturation.CreateAvoir(tenantID, facture.ID.Hex(), userID, userEmail, facturation.AvoirInput{
		Lines: []facturation.AvoirLineInput{{ProductID: productID, Qty: 2}},
		Note:  "damaged items",
	})
	AssertNoError(t, err)
	AssertEqual(t, avoir.DocType, "avoir", "avoir doc_type")
	AssertStock(t, tenantID, productID, 42, "stock +2 after avoir (40+2)")

	// 8. List factures
	factureList, err := facturation.List(tenantID, "facture", "", "", "", "", "", 1, 10)
	AssertNoError(t, err)
	AssertTrue(t, factureList.Total >= 1, "at least 1 facture")

	// 9. List all docs (BC, Devis, Facture, Avoir)
	allDocs, err := facturation.List(tenantID, "", "", "", "", "", "", 1, 20)
	AssertNoError(t, err)
	AssertTrue(t, allDocs.Total >= 5, "at least 5 docs total (BC+Devis+2 Factures+Avoir)")

	_ = factureFBC
}

// ══════════════════════════════════════════════════════════════════════════════
// TestE2E_DiscountsAndBatches
// Covers: discount CRUD + GetApplicable, batch creation + expiry listing
// ══════════════════════════════════════════════════════════════════════════════

func TestE2E_DiscountsAndBatches(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "disc@test.local"

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Food"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "FoodBrand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Kg"})
	AssertNoError(t, err)

	// ── Discount flow ──

	prodD, err := product.Create(tenantID, product.CreateInput{
		Name: "Rice", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 100, PrixAchat: 40, PrixVente1: 80, VAT: 0,
	})
	AssertNoError(t, err)
	prodDID := prodD.ID.Hex()

	// 1. Create discount: 10% off when qty >= 5
	rule, err := discount.Create(tenantID, discount.CreateInput{
		ProductID: prodDID, Type: "percentage", Value: 10, MinQty: 5,
	})
	AssertNoError(t, err)
	AssertNotEmpty(t, rule.ID.Hex(), "discount rule ID")

	// 2. ListByProduct = 1
	rules, err := discount.ListByProduct(tenantID, prodDID)
	AssertNoError(t, err)
	AssertEqual(t, len(rules), 1, "1 discount rule")

	// 3. GetApplicable qty=3 → nil (below MinQty)
	pid, _ := primitive.ObjectIDFromHex(prodDID)
	noDisc := discount.GetApplicable(tenantID, pid, 3, time.Now())
	AssertTrue(t, noDisc == nil, "no discount for qty=3")

	// 4. GetApplicable qty=5 → returns the rule
	disc := discount.GetApplicable(tenantID, pid, 5, time.Now())
	AssertTrue(t, disc != nil, "discount applies for qty=5")
	AssertFloatEqual(t, disc.Value, 10, "discount value = 10")

	// 5. Sale with discount: 5x80=400, flat discount 40 (10% of 400) → total=360
	s, err := sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines: []sale.SaleLineInput{
			{ProductID: prodDID, Qty: 5, UnitPrice: 80, Discount: 40}, // flat 10% of line total
		},
		PaymentMethod: "cash", AmountPaid: 360, SaleType: "cash",
	})
	AssertNoError(t, err)
	AssertFloatEqual(t, s.Total, 360, "sale total with discount = 360")
	AssertStock(t, tenantID, prodDID, 95, "stock 100-5=95")

	// 6. Delete discount
	err = discount.Delete(tenantID, rule.ID.Hex())
	AssertNoError(t, err)
	rules2, err := discount.ListByProduct(tenantID, prodDID)
	AssertNoError(t, err)
	AssertEqual(t, len(rules2), 0, "0 discount rules after delete")

	// ── Batch flow ──

	prodE, err := product.Create(tenantID, product.CreateInput{
		Name: "Milk", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 30, PrixVente1: 60, VAT: 0,
	})
	AssertNoError(t, err)
	prodEID := prodE.ID.Hex()

	// 7. Batch B1: expires tomorrow
	tomorrow := time.Now().Add(24 * time.Hour).Format("2006-01-02")
	_, err = batch.Create(tenantID, batch.CreateInput{
		ProductID: prodEID, BatchNumber: "LOT-001", ExpiryDate: &tomorrow,
		Qty: 20, PrixAchat: 30,
	})
	AssertNoError(t, err)

	// 8. Batch B2: expires in 90 days
	future := time.Now().Add(90 * 24 * time.Hour).Format("2006-01-02")
	_, err = batch.Create(tenantID, batch.CreateInput{
		ProductID: prodEID, BatchNumber: "LOT-002", ExpiryDate: &future,
		Qty: 15, PrixAchat: 35,
	})
	AssertNoError(t, err)

	// 9. ListByProduct = 2
	batches, err := batch.ListByProduct(tenantID, prodEID, 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, batches.Total, int64(2), "2 batches")

	// 10. ListExpiring(3 days) → only B1
	expiring3, err := batch.ListExpiring(tenantID, 3)
	AssertNoError(t, err)
	AssertTrue(t, len(expiring3) >= 1, "B1 expiring within 3 days")
	foundLot001 := false
	for _, b := range expiring3 {
		if b.BatchNumber == "LOT-001" {
			foundLot001 = true
		}
	}
	AssertTrue(t, foundLot001, "LOT-001 in expiring list")

	// 11. ListExpiring(100 days) → both
	expiring100, err := batch.ListExpiring(tenantID, 100)
	AssertNoError(t, err)
	AssertTrue(t, len(expiring100) >= 2, "both batches expiring within 100 days")

	_ = userEmail
}

// ══════════════════════════════════════════════════════════════════════════════
// TestE2E_PurchaseAdvancedAndSupplier
// Covers: purchase with expenses, partial validation, purchase pay,
//         purchase return, supplier-product links, supplier payments
// ══════════════════════════════════════════════════════════════════════════════

func TestE2E_PurchaseAdvancedAndSupplier(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "purch@test.local"

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Hardware"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "HWBrand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	prodF, err := product.Create(tenantID, product.CreateInput{
		Name: "Cable", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), PrixAchat: 50, PrixVente1: 90, VAT: 0,
	})
	AssertNoError(t, err)
	prodFID := prodF.ID.Hex()

	sup, err := supplier.Create(tenantID, supplier.CreateInput{Name: "Supplier Two", Phone: "0555999000"})
	AssertNoError(t, err)
	supID := sup.ID.Hex()

	// ── Supplier-Product link ──
	_, err = supplier_product.Create(tenantID, supplier_product.CreateInput{
		SupplierID: supID, ProductID: prodFID, SupplierRef: "SUP-F001", SupplierPrice: 48,
	})
	AssertNoError(t, err)

	bySup, err := supplier_product.ListBySupplier(tenantID, supID, 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, bySup.Total, int64(1), "1 supplier-product link by supplier")

	byProd, err := supplier_product.ListByProduct(tenantID, prodFID)
	AssertNoError(t, err)
	AssertEqual(t, len(byProd), 1, "1 supplier-product link by product")

	// ── Purchase with expense + partial validation ──
	purch, err := purchase.Create(tenantID, userID, userEmail, purchase.CreateInput{
		SupplierID: supID,
		Lines: []purchase.LineInput{
			{ProductID: prodFID, Qty: 20, PrixAchat: 50},
		},
		Expenses:           []purchase.ExpenseInput{{Label: "Shipping", Amount: 100}},
		DistributeExpenses: true,
	})
	AssertNoError(t, err)
	AssertNotEmpty(t, purch.ID.Hex(), "purchase ID")
	AssertStock(t, tenantID, prodFID, 0, "stock still 0 before validation")

	// Partial validation: receive 15 of 20
	_, err = purchase.Validate(tenantID, purch.ID.Hex(), userID, userEmail, &purchase.ValidateInput{
		Lines: []purchase.ValidateLineInput{
			{ProductID: prodFID, ReceivedQty: 15},
		},
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, prodFID, 15, "stock = 15 after partial validation")
	// Prix_achat should reflect expense distribution: (50*15 + 100) / 15 ≈ 56.67
	prixAchat := GetProductPrixAchat(t, tenantID, prodFID)
	AssertTrue(t, prixAchat > 50, "prix_achat > 50 (includes distributed expense)")

	// ── Purchase payment (partial) ──
	paid1, err := purchase.Pay(tenantID, purch.ID.Hex(), userID, purchase.PayInput{
		Amount: 200, Note: "first payment",
	})
	AssertNoError(t, err)
	AssertFloatEqual(t, paid1.PaidAmount, 200, "purchase paid_amount = 200")

	// ── Supplier balance + payment ──
	// Supplier should have a balance from the partially-paid purchase
	supBal := GetSupplierBalance(t, tenantID, supID)

	// Record a manual supplier payment
	err = supplier.RecordPayment(tenantID, supID, "Supplier Two", 100, "wire transfer", userEmail)
	AssertNoError(t, err)

	supPayments, err := supplier.ListPayments(tenantID, supID, "", "", 1, 10)
	AssertNoError(t, err)
	AssertTrue(t, supPayments.Total >= 1, "at least 1 supplier payment")

	_ = supBal

	// ── Purchase return ──
	_, err = purchase.Return(tenantID, purch.ID.Hex(), userID, userEmail, []purchase.ValidateLineInput{
		{ProductID: prodFID, ReceivedQty: 3},
	})
	AssertNoError(t, err)
	AssertStock(t, tenantID, prodFID, 12, "stock 15-3=12 after purchase return")

	// ── Price history ──
	phResult, err := price_history.List(tenantID, prodFID, 1, 10)
	AssertNoError(t, err)
	AssertTrue(t, phResult.Total >= 1, "at least 1 price history entry")
}

// ══════════════════════════════════════════════════════════════════════════════
// TestE2E_ProductAndCaisseAdvanced
// Covers: product update/archive/unarchive, cheque/virement sales,
//         movements, caisse reopen, client statement
// ══════════════════════════════════════════════════════════════════════════════

func TestE2E_ProductAndCaisseAdvanced(t *testing.T) {
	Setup()
	CleanAll()

	tenantID := CreateTenant(t)
	userID, _ := CreateUser(t, tenantID, "admin")
	userEmail := "adv@test.local"

	cat, err := category.Create(tenantID, category.CreateInput{Name: "General"})
	AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "GenBrand"})
	AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	AssertNoError(t, err)

	prodG, err := product.Create(tenantID, product.CreateInput{
		Name: "Product G", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
		UnitID: un.ID.Hex(), QtyAvailable: 50, PrixAchat: 70, PrixVente1: 110, VAT: 0,
	})
	AssertNoError(t, err)
	prodGID := prodG.ID.Hex()
	catID := cat.ID.Hex()
	brID := br.ID.Hex()
	unID := un.ID.Hex()

	// ── Product update ──
	updated, err := product.Update(tenantID, prodGID, product.UpdateInput{
		Name: "Product G", CategoryID: catID, BrandID: brID, UnitID: unID,
		PrixAchat: 70, PrixVente1: 120, PrixVente2: 115, VAT: 0,
	})
	AssertNoError(t, err)
	AssertFloatEqual(t, updated.PrixVente1, 120, "PrixVente1 updated to 120")
	AssertFloatEqual(t, updated.PrixVente2, 115, "PrixVente2 updated to 115")

	got, err := product.GetByID(tenantID, prodGID)
	AssertNoError(t, err)
	AssertFloatEqual(t, got.PrixVente1, 120, "GetByID confirms PrixVente1=120")

	// ── Archive / Unarchive ──
	err = product.Archive(tenantID, prodGID)
	AssertNoError(t, err)
	archived, err := product.GetByID(tenantID, prodGID)
	AssertNoError(t, err)
	AssertNotEmpty(t, archived.ID.Hex(), "archived product still retrievable")

	err = product.Unarchive(tenantID, prodGID)
	AssertNoError(t, err)

	// ── Cheque + Virement + Cash sales ──
	sess1, err := caisse.Open(tenantID, userID, userEmail, caisse.OpenInput{OpeningAmount: 2000})
	AssertNoError(t, err)

	cur, err := caisse.GetCurrent(tenantID, userID)
	AssertNoError(t, err)
	AssertEqual(t, cur.ID.Hex(), sess1.ID.Hex(), "GetCurrent returns open session")

	// Cheque sale: 3xG @120 = 360
	_, err = sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: prodGID, Qty: 3, UnitPrice: 120}},
		PaymentMethod: "cheque", AmountPaid: 360, SaleType: "cash", CaisseID: sess1.ID.Hex(),
	})
	AssertNoError(t, err)

	// Virement sale: 2xG @120 = 240
	_, err = sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: prodGID, Qty: 2, UnitPrice: 120}},
		PaymentMethod: "virement", AmountPaid: 240, SaleType: "cash", CaisseID: sess1.ID.Hex(),
	})
	AssertNoError(t, err)

	// Cash sale: 4xG @120 = 480
	_, err = sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: prodGID, Qty: 4, UnitPrice: 120}},
		PaymentMethod: "cash", AmountPaid: 480, SaleType: "cash", CaisseID: sess1.ID.Hex(),
	})
	AssertNoError(t, err)

	AssertStock(t, tenantID, prodGID, 41, "stock 50-3-2-4=41")

	// ── SalesStatistics: mixed payment methods ──
	now := time.Now()
	sod := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	eod := sod.Add(24 * time.Hour)

	stats, err := sale.SalesStatistics(tenantID, sod, eod, false)
	AssertNoError(t, err)
	AssertTrue(t, stats.CashPaymentTTC > 0, "CashPaymentTTC > 0")
	AssertTrue(t, stats.ChequePaymentTTC > 0, "ChequePaymentTTC > 0")
	AssertTrue(t, stats.VirementPaymentTTC > 0, "VirementPaymentTTC > 0")

	// ── Product movements ──
	movements, err := product.ListMovements(tenantID, prodGID, "", "", 1, 20)
	AssertNoError(t, err)
	AssertTrue(t, movements.Total > 0, "product has movements")

	// ── Caisse close + reopen ──
	_, err = caisse.Close(tenantID, userID, caisse.CloseInput{ClosingAmount: 2480})
	AssertNoError(t, err)

	hist1, count1, err := caisse.ListHistory(tenantID, 1, 10)
	AssertNoError(t, err)
	AssertTrue(t, count1 >= 1, "at least 1 session in history")
	_ = hist1

	// Re-open new session
	sess2, err := caisse.Open(tenantID, userID, userEmail, caisse.OpenInput{OpeningAmount: 1000})
	AssertNoError(t, err)
	AssertTrue(t, sess2.ID.Hex() != sess1.ID.Hex(), "new session has different ID")

	cur2, err := caisse.GetCurrent(tenantID, userID)
	AssertNoError(t, err)
	AssertEqual(t, cur2.ID.Hex(), sess2.ID.Hex(), "GetCurrent returns 2nd session")

	// Sale in 2nd session
	_, err = sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: prodGID, Qty: 1, UnitPrice: 120}},
		PaymentMethod: "cash", AmountPaid: 120, SaleType: "cash", CaisseID: sess2.ID.Hex(),
	})
	AssertNoError(t, err)

	_, err = caisse.Close(tenantID, userID, caisse.CloseInput{ClosingAmount: 1120})
	AssertNoError(t, err)

	_, count2, err := caisse.ListHistory(tenantID, 1, 10)
	AssertNoError(t, err)
	AssertTrue(t, count2 >= 2, "at least 2 sessions in history")

	// ── Client statement ──
	clB, err := client.Create(tenantID, client.ClientInput{Name: "Client B", Phone: "0555333444"})
	AssertNoError(t, err)

	// Open a new caisse for the credit sale
	sess3, err := caisse.Open(tenantID, userID, userEmail, caisse.OpenInput{OpeningAmount: 0})
	AssertNoError(t, err)

	// Credit sale: 5xG @120 to Client B
	_, err = sale.Create(tenantID, userID, userEmail, sale.CreateInput{
		Lines:         []sale.SaleLineInput{{ProductID: prodGID, Qty: 5, UnitPrice: 120}},
		PaymentMethod: "cash", AmountPaid: 0, ClientID: clB.ID.Hex(),
		SaleType: "credit", CaisseID: sess3.ID.Hex(),
	})
	AssertNoError(t, err)

	stmt, err := client.GetStatement(tenantID, clB.ID.Hex())
	AssertNoError(t, err)
	AssertTrue(t, len(stmt) >= 1, "statement has at least 1 entry")

	// Add payment
	_, err = client.AddPayment(tenantID, clB.ID.Hex(), client.PaymentInput{Amount: 300, Note: "cash"})
	AssertNoError(t, err)

	payments, err := client.ListPayments(tenantID, clB.ID.Hex(), 1, 10)
	AssertNoError(t, err)
	AssertTrue(t, payments.Total >= 1, "at least 1 client payment")

	stmt2, err := client.GetStatement(tenantID, clB.ID.Hex())
	AssertNoError(t, err)
	AssertTrue(t, len(stmt2) >= 2, "statement has sale + payment entries")

	// Close the 3rd session
	_, err = caisse.Close(tenantID, userID, caisse.CloseInput{ClosingAmount: 0})
	AssertNoError(t, err)
}
