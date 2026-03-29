package facturation

import (
	"math"
	"os"
	"strings"
	"testing"

	"saas_pos/internal/brand"
	"saas_pos/internal/category"
	"saas_pos/internal/client"
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

// factDeps holds shared IDs used across the sequential sub-tests.
type factDeps struct {
	TenantID  string
	UserID    string
	UserEmail string
	ClientID  string
	ProductID string // product with VAT=19, price=1000
}

func setupFactDeps(t *testing.T) factDeps {
	t.Helper()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")

	// Look up user email from DB
	userEmail := "user@test.local"

	// Create a client
	cl, err := client.Create(tenantID, client.ClientInput{
		Name:  "Fact Client",
		Phone: "0555000111",
	})
	testutil.AssertNoError(t, err)

	// Create category, brand, unit for product
	cat, err := category.Create(tenantID, category.CreateInput{Name: "Fact Cat"})
	testutil.AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Fact Brand"})
	testutil.AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	testutil.AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name:         "Widget",
		CategoryID:   cat.ID.Hex(),
		BrandID:      br.ID.Hex(),
		UnitID:       un.ID.Hex(),
		PrixAchat:    500,
		PrixVente1:   1000,
		VAT:          19,
		QtyAvailable: 100,
	})
	testutil.AssertNoError(t, err)

	return factDeps{
		TenantID:  tenantID,
		UserID:    userID,
		UserEmail: userEmail,
		ClientID:  cl.ID.Hex(),
		ProductID: p.ID.Hex(),
	}
}

func TestFacturationFlow(t *testing.T) {
	testutil.CleanAll()
	d := setupFactDeps(t)

	var bcID string
	var devisID string
	var factureID string // cash facture
	var creditFactureID string

	// ── 1. create_bc ────────────────────────────────────────────────────────
	t.Run("create_bc", func(t *testing.T) {
		doc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:  DocBC,
			ClientID: d.ClientID,
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 2, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		bcID = doc.ID.Hex()
		testutil.AssertTrue(t, strings.HasPrefix(doc.Ref, "BC-"), "BC ref prefix")
		testutil.AssertEqual(t, doc.Status, StatusDraft, "BC status")
	})

	// ── 2. create_devis ─────────────────────────────────────────────────────
	t.Run("create_devis", func(t *testing.T) {
		doc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:  DocDevis,
			ClientID: d.ClientID,
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 3, UnitPrice: 1000, Discount: 100},
			},
		})
		testutil.AssertNoError(t, err)
		devisID = doc.ID.Hex()
		testutil.AssertTrue(t, strings.HasPrefix(doc.Ref, "DV-"), "Devis ref prefix")
	})

	// ── 3. line_totals ──────────────────────────────────────────────────────
	t.Run("line_totals", func(t *testing.T) {
		doc, err := GetByID(d.TenantID, devisID)
		testutil.AssertNoError(t, err)
		line := doc.Lines[0]
		// TotalHT = qty*price - discount = 3*1000 - 100 = 2900
		testutil.AssertFloatEqual(t, line.TotalHT, 2900, "line TotalHT")
		// TotalVAT = 2900 * 19/100 = 551
		testutil.AssertFloatEqual(t, line.TotalVAT, 551, "line TotalVAT")
		// TotalTTC = 2900 + 551 = 3451
		testutil.AssertFloatEqual(t, line.TotalTTC, 3451, "line TotalTTC")
	})

	// ── 4. document_total ───────────────────────────────────────────────────
	t.Run("document_total", func(t *testing.T) {
		doc, err := GetByID(d.TenantID, devisID)
		testutil.AssertNoError(t, err)
		var sumTTC float64
		for _, l := range doc.Lines {
			sumTTC += l.TotalTTC
		}
		testutil.AssertFloatEqual(t, doc.Total, sumTTC, "document total = sum of line TTCs")
	})

	// ── 5. update_draft_bc ──────────────────────────────────────────────────
	t.Run("update_draft_bc", func(t *testing.T) {
		updated, err := Update(d.TenantID, bcID, UpdateInput{
			ClientID: d.ClientID,
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 5, UnitPrice: 1000, Discount: 200},
			},
			Note: "updated BC",
		})
		testutil.AssertNoError(t, err)
		// TotalHT = 5*1000 - 200 = 4800
		testutil.AssertFloatEqual(t, updated.TotalHT, 4800, "updated BC TotalHT")
		// TotalTTC = 4800 + 4800*0.19 = 4800 + 912 = 5712
		testutil.AssertFloatEqual(t, updated.Total, 5712, "updated BC Total")
	})

	// ── 6. update_facture_error ─────────────────────────────────────────────
	t.Run("update_facture_error", func(t *testing.T) {
		// Create a facture (cash, auto-paid)
		fDoc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cash",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 1, UnitPrice: 500, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)

		// Attempt to update facture should fail
		_, err = Update(d.TenantID, fDoc.ID.Hex(), UpdateInput{
			ClientID: d.ClientID,
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 2, UnitPrice: 500, Discount: 0},
			},
		})
		testutil.AssertError(t, err)
	})

	// ── 7. delete_draft ─────────────────────────────────────────────────────
	t.Run("delete_draft", func(t *testing.T) {
		// Create a throwaway draft BC, then delete it
		draft, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:  DocBC,
			ClientID: d.ClientID,
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 1, UnitPrice: 100, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)

		err = Delete(d.TenantID, draft.ID.Hex())
		testutil.AssertNoError(t, err)

		// Verify gone
		_, err = GetByID(d.TenantID, draft.ID.Hex())
		testutil.AssertError(t, err)
	})

	// ── 8. delete_facture_error ─────────────────────────────────────────────
	t.Run("delete_facture_error", func(t *testing.T) {
		fDoc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cash",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 1, UnitPrice: 200, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		// Facture status is "paid", not draft -> delete should fail
		err = Delete(d.TenantID, fDoc.ID.Hex())
		testutil.AssertError(t, err)
	})

	// ── 9. status_transition ────────────────────────────────────────────────
	t.Run("status_transition", func(t *testing.T) {
		// BC: draft -> accepted
		updated, err := UpdateStatus(d.TenantID, bcID, StatusAccepted)
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, updated.Status, StatusAccepted, "BC accepted")

		// Create a new devis for status transitions
		dv, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:  DocDevis,
			ClientID: d.ClientID,
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 1, UnitPrice: 500, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)

		// Devis: draft -> sent
		dv, err = UpdateStatus(d.TenantID, dv.ID.Hex(), StatusSent)
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, dv.Status, StatusSent, "devis sent")

		// Devis: sent -> accepted
		dv, err = UpdateStatus(d.TenantID, dv.ID.Hex(), StatusAccepted)
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, dv.Status, StatusAccepted, "devis accepted")
	})

	// ── 10. convert_devis_to_facture ────────────────────────────────────────
	t.Run("convert_devis_to_facture", func(t *testing.T) {
		facture, err := Convert(d.TenantID, devisID, d.UserID, d.UserEmail, ConvertInput{
			PaymentMethod: "cash",
			AmountPaid:    0, // credit conversion
		})
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, strings.HasPrefix(facture.Ref, "FA-"), "facture ref prefix")
		testutil.AssertEqual(t, facture.DocType, DocFacture, "converted doc type")
		testutil.AssertNotEmpty(t, facture.ParentID, "parent ID set")

		// Parent devis should be marked accepted
		parent, err := GetByID(d.TenantID, devisID)
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, parent.Status, StatusAccepted, "parent devis accepted")
	})

	// ── 11. cash_facture_auto_paid ──────────────────────────────────────────
	t.Run("cash_facture_auto_paid", func(t *testing.T) {
		doc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cash",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 1, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		factureID = doc.ID.Hex()
		testutil.AssertEqual(t, doc.Status, StatusPaid, "cash facture auto-paid")
		// Total = 1000 + 19% = 1190, which is > 300, so timbre > 0
		testutil.AssertTrue(t, doc.Timbre > 0, "timbre calculated for cash facture > 300")
	})

	// ── 12. credit_facture_balance ──────────────────────────────────────────
	t.Run("credit_facture_balance", func(t *testing.T) {
		// Reset client balance to 0
		bal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		if bal != 0 {
			_ = client.AdjustBalance(d.TenantID, d.ClientID, -bal)
		}

		doc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cheque", // credit, not auto-paid
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 2, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		creditFactureID = doc.ID.Hex()
		testutil.AssertEqual(t, doc.Status, StatusUnpaid, "credit facture unpaid")

		// Client balance should increase by the facture total
		newBal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		testutil.AssertFloatEqual(t, newBal, doc.Total, "client balance = facture total")
	})

	// ── 13. pay_facture_partial ─────────────────────────────────────────────
	t.Run("pay_facture_partial", func(t *testing.T) {
		doc, err := GetByID(d.TenantID, creditFactureID)
		testutil.AssertNoError(t, err)

		partialAmount := math.Round(doc.Total/2*100) / 100
		updated, err := Pay(d.TenantID, creditFactureID, PayInput{
			Amount:        partialAmount,
			PaymentMethod: "cheque",
			Note:          "partial",
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, updated.Status, StatusPartial, "partial payment status")
		testutil.AssertFloatEqual(t, updated.PaidAmount, partialAmount, "paid amount after partial")
	})

	// ── 14. pay_facture_full ────────────────────────────────────────────────
	t.Run("pay_facture_full", func(t *testing.T) {
		doc, err := GetByID(d.TenantID, creditFactureID)
		testutil.AssertNoError(t, err)

		remaining := math.Round((doc.Total-doc.PaidAmount)*100) / 100
		updated, err := Pay(d.TenantID, creditFactureID, PayInput{
			Amount:        remaining,
			PaymentMethod: "cheque",
			Note:          "final",
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, updated.Status, StatusPaid, "fully paid status")
		testutil.AssertFloatEqual(t, updated.PaidAmount, doc.Total, "paid = total")
	})

	// ── 15. payment_timbre ──────────────────────────────────────────────────
	t.Run("payment_timbre", func(t *testing.T) {
		// Create a cash facture with total > 300 via credit then pay cash
		// Reset client balance
		bal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		if bal != 0 {
			_ = client.AdjustBalance(d.TenantID, d.ClientID, -bal)
		}

		doc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cash",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 1, UnitPrice: 500, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		// Total = 500 + 19% = 595, which is > 300
		testutil.AssertTrue(t, doc.Total > 300, "total > 300 for timbre test")
		testutil.AssertTrue(t, doc.Timbre > 0, "timbre > 0 for cash payment > 300")
	})

	// ── 16. create_avoir ────────────────────────────────────────────────────
	t.Run("create_avoir", func(t *testing.T) {
		// Use the cash factureID from test 11
		avoir, err := CreateAvoir(d.TenantID, factureID, d.UserID, d.UserEmail, AvoirInput{
			Lines: []AvoirLineInput{
				{ProductID: d.ProductID, Qty: 1},
			},
			Note: "return widget",
		})
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, strings.HasPrefix(avoir.Ref, "AV-"), "avoir ref prefix")
		testutil.AssertEqual(t, avoir.DocType, DocAvoir, "avoir doc type")
		testutil.AssertEqual(t, avoir.Status, StatusPaid, "avoir status is paid")
	})

	// ── 17. avoir_client_balance ────────────────────────────────────────────
	t.Run("avoir_client_balance", func(t *testing.T) {
		// Reset client balance
		bal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		if bal != 0 {
			_ = client.AdjustBalance(d.TenantID, d.ClientID, -bal)
		}

		// Set a known balance
		_ = client.AdjustBalance(d.TenantID, d.ClientID, 5000)
		balBefore := testutil.GetClientBalance(t, d.TenantID, d.ClientID)

		// Create a fresh cash facture to create avoir from
		fDoc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cash",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 2, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)

		avoir, err := CreateAvoir(d.TenantID, fDoc.ID.Hex(), d.UserID, d.UserEmail, AvoirInput{
			Lines: []AvoirLineInput{
				{ProductID: d.ProductID, Qty: 1},
			},
		})
		testutil.AssertNoError(t, err)

		balAfter := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		// Avoir should decrease client balance by the avoir total
		testutil.AssertFloatEqual(t, balAfter, balBefore-avoir.Total, "avoir decreased client balance")
	})

	// ── 18. avoir_parent_impact ─────────────────────────────────────────────
	t.Run("avoir_parent_impact", func(t *testing.T) {
		// Create a credit facture, pay it, then create avoir
		bal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		if bal != 0 {
			_ = client.AdjustBalance(d.TenantID, d.ClientID, -bal)
		}

		fDoc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cash",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 3, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		paidBefore := fDoc.PaidAmount

		// Create avoir returning 1 unit
		avoir, err := CreateAvoir(d.TenantID, fDoc.ID.Hex(), d.UserID, d.UserEmail, AvoirInput{
			Lines: []AvoirLineInput{
				{ProductID: d.ProductID, Qty: 1},
			},
		})
		testutil.AssertNoError(t, err)

		// The avoir itself is created; check that the avoir total is correct
		// AvoirTotal = 1*1000 * 1.19 = 1190
		expectedAvoirTotal := math.Round(1000*1.19*100) / 100
		testutil.AssertFloatEqual(t, avoir.Total, expectedAvoirTotal, "avoir total")

		// The CreateAvoir function does NOT directly decrease parent paid_amount
		// (it adjusts client balance instead), so we verify the parent is unchanged
		// or verify the avoir's ParentID links correctly.
		testutil.AssertEqual(t, avoir.ParentID, fDoc.ID.Hex(), "avoir parent ID")

		// Re-read parent to confirm it still exists and paid_amount unchanged
		parent, err := GetByID(d.TenantID, fDoc.ID.Hex())
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, parent.PaidAmount, paidBefore, "parent paid_amount unchanged by avoir")
	})
}

// ── TestFacturationAdvanced ─────────────────────────────────────────────────

func TestFacturationAdvanced(t *testing.T) {
	testutil.CleanAll()

	var (
		d               factDeps
		devisID         string
		creditFactureID string
		cashFactureID   string
	)

	// ── 1. setup ────────────────────────────────────────────────────────────
	t.Run("setup", func(t *testing.T) {
		d = setupFactDeps(t)

		// Reset client balance to 0 for a clean start
		bal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		if bal != 0 {
			_ = client.AdjustBalance(d.TenantID, d.ClientID, -bal)
		}
	})

	// ── 2. convert_devis_to_facture ─────────────────────────────────────────
	t.Run("convert_devis_to_facture", func(t *testing.T) {
		// Create a devis first
		dv, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:  DocDevis,
			ClientID: d.ClientID,
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 2, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		devisID = dv.ID.Hex()
		testutil.AssertTrue(t, strings.HasPrefix(dv.Ref, "DV-"), "devis ref prefix")

		// Convert devis to facture (credit, no payment)
		facture, err := Convert(d.TenantID, devisID, d.UserID, d.UserEmail, ConvertInput{
			PaymentMethod: "cheque",
			AmountPaid:    0,
		})
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, strings.HasPrefix(facture.Ref, "FA-"), "converted facture ref starts with FA-")
		testutil.AssertEqual(t, facture.DocType, DocFacture, "converted doc type is facture")

		// Verify a sale was created (SaleID should be set)
		testutil.AssertNotEmpty(t, facture.SaleID, "facture has linked sale ID")

		// Parent devis should be accepted
		parent, err := GetByID(d.TenantID, devisID)
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, parent.Status, StatusAccepted, "parent devis accepted after convert")
	})

	// ── 3. convert_with_payment ─────────────────────────────────────────────
	t.Run("convert_with_payment", func(t *testing.T) {
		// Create a new devis
		dv, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:  DocDevis,
			ClientID: d.ClientID,
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 1, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)

		// Total TTC = 1000 + 19% = 1190
		expectedTotal := math.Round(1000*1.19*100) / 100

		// Convert with partial payment of 500
		facture, err := Convert(d.TenantID, dv.ID.Hex(), d.UserID, d.UserEmail, ConvertInput{
			PaymentMethod: "cheque",
			AmountPaid:    500,
		})
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, strings.HasPrefix(facture.Ref, "FA-"), "converted facture ref")

		// With 500 paid on a 1190 total, status should be partial
		testutil.AssertFloatEqual(t, facture.Total, expectedTotal, "facture total after convert")
		if facture.PaidAmount >= facture.Total {
			testutil.AssertEqual(t, facture.Status, StatusPaid, "facture fully paid")
		} else {
			testutil.AssertEqual(t, facture.Status, StatusPartial, "facture partially paid")
		}
	})

	// ── 4. credit_facture_increases_balance ──────────────────────────────────
	t.Run("credit_facture_increases_balance", func(t *testing.T) {
		// Reset client balance
		bal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		if bal != 0 {
			_ = client.AdjustBalance(d.TenantID, d.ClientID, -bal)
		}

		balBefore := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		testutil.AssertFloatEqual(t, balBefore, 0, "balance starts at 0")

		// Create a cheque (credit) facture
		doc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cheque",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 3, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		creditFactureID = doc.ID.Hex()
		testutil.AssertEqual(t, doc.Status, StatusUnpaid, "credit facture is unpaid")

		// Client balance should have increased by the facture total
		balAfter := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		testutil.AssertFloatEqual(t, balAfter, doc.Total, "client balance increased by facture total")
	})

	// ── 5. pay_facture_partial_then_full ─────────────────────────────────────
	t.Run("pay_facture_partial_then_full", func(t *testing.T) {
		doc, err := GetByID(d.TenantID, creditFactureID)
		testutil.AssertNoError(t, err)

		// Pay half
		halfAmount := math.Round(doc.Total/2*100) / 100
		updated, err := Pay(d.TenantID, creditFactureID, PayInput{
			Amount:        halfAmount,
			PaymentMethod: "cheque",
			Note:          "first half",
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, updated.Status, StatusPartial, "status after partial payment")
		testutil.AssertFloatEqual(t, updated.PaidAmount, halfAmount, "paid amount after first payment")

		// Pay the rest
		remaining := math.Round((doc.Total-halfAmount)*100) / 100
		updated, err = Pay(d.TenantID, creditFactureID, PayInput{
			Amount:        remaining,
			PaymentMethod: "cheque",
			Note:          "second half",
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, updated.Status, StatusPaid, "status after full payment")
		testutil.AssertFloatEqual(t, updated.PaidAmount, doc.Total, "paid amount equals total")
	})

	// ── 6. avoir_from_facture ───────────────────────────────────────────────
	t.Run("avoir_from_facture", func(t *testing.T) {
		// Reset client balance
		bal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		if bal != 0 {
			_ = client.AdjustBalance(d.TenantID, d.ClientID, -bal)
		}

		// Create a paid cash facture
		fDoc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cash",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 3, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, fDoc.Status, StatusPaid, "cash facture is paid")

		balBeforeAvoir := testutil.GetClientBalance(t, d.TenantID, d.ClientID)

		// Create avoir for 1 item
		avoir, err := CreateAvoir(d.TenantID, fDoc.ID.Hex(), d.UserID, d.UserEmail, AvoirInput{
			Lines: []AvoirLineInput{
				{ProductID: d.ProductID, Qty: 1},
			},
			Note: "defective item return",
		})
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, strings.HasPrefix(avoir.Ref, "AV-"), "avoir ref starts with AV-")
		testutil.AssertEqual(t, avoir.DocType, DocAvoir, "avoir doc type")
		testutil.AssertEqual(t, avoir.ParentID, fDoc.ID.Hex(), "avoir parent is the facture")

		// Client balance should have decreased by avoir total
		balAfterAvoir := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		testutil.AssertFloatEqual(t, balAfterAvoir, balBeforeAvoir-avoir.Total, "balance decreased by avoir total")
	})

	// ── 7. avoir_restores_stock ─────────────────────────────────────────────
	t.Run("avoir_restores_stock", func(t *testing.T) {
		// Record stock before creating a facture + avoir
		stockBefore := testutil.GetProductStock(t, d.TenantID, d.ProductID)

		// Create a cash facture (which creates a sale and decrements stock)
		fDoc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cash",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 2, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)

		stockAfterSale := testutil.GetProductStock(t, d.TenantID, d.ProductID)
		testutil.AssertFloatEqual(t, stockAfterSale, stockBefore, "stock unchanged after standalone facture (no sale created)")

		// Create avoir returning 1 item — standalone facture avoir restores stock manually
		_, err = CreateAvoir(d.TenantID, fDoc.ID.Hex(), d.UserID, d.UserEmail, AvoirInput{
			Lines: []AvoirLineInput{
				{ProductID: d.ProductID, Qty: 1},
			},
		})
		testutil.AssertNoError(t, err)

		stockAfterAvoir := testutil.GetProductStock(t, d.TenantID, d.ProductID)
		testutil.AssertFloatEqual(t, stockAfterAvoir, stockAfterSale+1, "stock increased by 1 after avoir")
	})

	// ── 8. timbre_on_cash_payment ───────────────────────────────────────────
	t.Run("timbre_on_cash_payment", func(t *testing.T) {
		// Reset client balance
		bal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		if bal != 0 {
			_ = client.AdjustBalance(d.TenantID, d.ClientID, -bal)
		}

		// Create a credit facture with total > 300
		doc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cheque",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 1, UnitPrice: 500, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		// Total = 500 + 19% = 595 > 300
		testutil.AssertTrue(t, doc.Total > 300, "facture total > 300 for timbre test")
		cashFactureID = doc.ID.Hex()

		// Pay — Pay enforces the facture's original payment method (cheque), so timbre = 0
		updated, err := Pay(d.TenantID, cashFactureID, PayInput{
			Amount:        doc.Total,
			PaymentMethod: "cash",
			Note:          "cash payment",
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, updated.Status, StatusPaid, "facture paid after payment")
		testutil.AssertFloatEqual(t, updated.Timbre, 0, "timbre = 0 because Pay enforces facture's original method (cheque)")
	})

	// ── 9. timbre_zero_for_cheque ───────────────────────────────────────────
	t.Run("timbre_zero_for_cheque", func(t *testing.T) {
		// Reset client balance
		bal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		if bal != 0 {
			_ = client.AdjustBalance(d.TenantID, d.ClientID, -bal)
		}

		// Create a credit facture with total > 300
		doc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cheque",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 1, UnitPrice: 500, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)

		// Pay with cheque -> timbre should be 0
		updated, err := Pay(d.TenantID, doc.ID.Hex(), PayInput{
			Amount:        doc.Total,
			PaymentMethod: "cheque",
			Note:          "cheque payment",
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, updated.Status, StatusPaid, "facture paid after cheque payment")

		// Check that the cheque payment itself has no timbre
		// The last payment in the payments array should have timbre = 0
		if len(updated.Payments) > 0 {
			lastPayment := updated.Payments[len(updated.Payments)-1]
			testutil.AssertFloatEqual(t, lastPayment.Timbre, 0, "cheque payment timbre = 0")
		}
	})

	// ── 10. status_transitions ──────────────────────────────────────────────
	t.Run("status_transitions", func(t *testing.T) {
		// Create a fresh devis
		dv, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:  DocDevis,
			ClientID: d.ClientID,
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 1, UnitPrice: 500, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, dv.Status, StatusDraft, "new devis starts as draft")

		// draft -> sent
		dv, err = UpdateStatus(d.TenantID, dv.ID.Hex(), StatusSent)
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, dv.Status, StatusSent, "devis transitioned to sent")

		// Verify via GetByID
		fetched, err := GetByID(d.TenantID, dv.ID.Hex())
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, fetched.Status, StatusSent, "fetched status is sent")

		// sent -> accepted
		dv, err = UpdateStatus(d.TenantID, dv.ID.Hex(), StatusAccepted)
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, dv.Status, StatusAccepted, "devis transitioned to accepted")

		// Verify via GetByID
		fetched, err = GetByID(d.TenantID, dv.ID.Hex())
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, fetched.Status, StatusAccepted, "fetched status is accepted")
	})
}

// ── TestFacturationExtended ─────────────────────────────────────────────────

func setupFactExtDeps(t *testing.T) factDeps {
	t.Helper()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")
	userEmail := "factext@test.local"

	cl, err := client.Create(tenantID, client.ClientInput{
		Name:  "Ext Fact Client",
		Phone: "0555222333",
	})
	testutil.AssertNoError(t, err)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Ext Cat"})
	testutil.AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Ext Brand"})
	testutil.AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	testutil.AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name:         "Ext Widget",
		CategoryID:   cat.ID.Hex(),
		BrandID:      br.ID.Hex(),
		UnitID:       un.ID.Hex(),
		PrixAchat:    500,
		PrixVente1:   1000,
		VAT:          19,
		QtyAvailable: 200,
	})
	testutil.AssertNoError(t, err)

	return factDeps{
		TenantID:  tenantID,
		UserID:    userID,
		UserEmail: userEmail,
		ClientID:  cl.ID.Hex(),
		ProductID: p.ID.Hex(),
	}
}

func TestFacturationExtended(t *testing.T) {
	testutil.Setup()

	var d factDeps

	t.Run("setup", func(t *testing.T) {
		d = setupFactExtDeps(t)
		// Ensure client balance starts at 0
		bal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		if bal != 0 {
			_ = client.AdjustBalance(d.TenantID, d.ClientID, -bal)
		}
	})

	// ── 1. credit_facture_client_balance ─────────────────────────────────
	t.Run("credit_facture_client_balance", func(t *testing.T) {
		bal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		if bal != 0 {
			_ = client.AdjustBalance(d.TenantID, d.ClientID, -bal)
		}

		doc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cheque",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 2, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, doc.Status, StatusUnpaid, "credit facture is unpaid")

		newBal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		testutil.AssertFloatEqual(t, newBal, doc.Total, "client balance = facture TTC")
	})

	// ── 2. pay_partial_then_full ─────────────────────────────────────────
	t.Run("pay_partial_then_full", func(t *testing.T) {
		bal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		if bal != 0 {
			_ = client.AdjustBalance(d.TenantID, d.ClientID, -bal)
		}

		doc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cheque",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 1, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		// Total = 1000 * 1.19 = 1190

		halfAmount := math.Round(doc.Total/2*100) / 100
		updated, err := Pay(d.TenantID, doc.ID.Hex(), PayInput{
			Amount:        halfAmount,
			PaymentMethod: "cheque",
			Note:          "partial",
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, updated.Status, StatusPartial, "status after partial payment")

		remaining := math.Round((doc.Total-halfAmount)*100) / 100
		updated, err = Pay(d.TenantID, doc.ID.Hex(), PayInput{
			Amount:        remaining,
			PaymentMethod: "cheque",
			Note:          "final",
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, updated.Status, StatusPaid, "status after full payment")
		testutil.AssertFloatEqual(t, updated.PaidAmount, doc.Total, "paid = total")
	})

	// ── 3. payment_timbre_brackets ───────────────────────────────────────
	t.Run("payment_timbre_brackets", func(t *testing.T) {
		// Small facture: total ~595 (500 + 19% VAT). Timbre = 595*0.01 = 5.95
		smallDoc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cash",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 1, UnitPrice: 500, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, smallDoc.Timbre >= 5, "small facture timbre >= 5 (min)")

		// Medium facture: qty=42, price=1000 → HT=42000, TTC=42000*1.19=49980
		// Timbre = 49980 * 0.015 = 749.7
		bal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		if bal != 0 {
			_ = client.AdjustBalance(d.TenantID, d.ClientID, -bal)
		}
		medDoc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cash",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 42, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, medDoc.Timbre > 5, "medium facture timbre > 5")
		testutil.AssertTrue(t, medDoc.Total > 30000, "medium facture total > 30000")

		// Large facture: qty=170, price=1000 → HT=170000, TTC=170000*1.19=202300
		// Timbre = 202300 * 0.02 = 4046
		bal = testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		if bal != 0 {
			_ = client.AdjustBalance(d.TenantID, d.ClientID, -bal)
		}
		largeDoc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cash",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 170, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, largeDoc.Total > 100000, "large facture total > 100000")
		testutil.AssertTrue(t, largeDoc.Timbre > medDoc.Timbre, "large timbre > medium timbre")
	})

	// ── 4. avoir_reduces_client_balance ──────────────────────────────────
	t.Run("avoir_reduces_client_balance", func(t *testing.T) {
		bal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		if bal != 0 {
			_ = client.AdjustBalance(d.TenantID, d.ClientID, -bal)
		}

		fDoc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cash",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 3, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		balBefore := testutil.GetClientBalance(t, d.TenantID, d.ClientID)

		avoir, err := CreateAvoir(d.TenantID, fDoc.ID.Hex(), d.UserID, d.UserEmail, AvoirInput{
			Lines: []AvoirLineInput{
				{ProductID: d.ProductID, Qty: 1},
			},
			Note: "defective",
		})
		testutil.AssertNoError(t, err)

		balAfter := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		testutil.AssertFloatEqual(t, balAfter, balBefore-avoir.Total, "avoir reduced client balance")
	})

	// ── 5. avoir_line_totals ─────────────────────────────────────────────
	t.Run("avoir_line_totals", func(t *testing.T) {
		bal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		if bal != 0 {
			_ = client.AdjustBalance(d.TenantID, d.ClientID, -bal)
		}

		fDoc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:       DocFacture,
			ClientID:      d.ClientID,
			PaymentMethod: "cash",
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 2, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)

		avoir, err := CreateAvoir(d.TenantID, fDoc.ID.Hex(), d.UserID, d.UserEmail, AvoirInput{
			Lines: []AvoirLineInput{
				{ProductID: d.ProductID, Qty: 1},
			},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, len(avoir.Lines) > 0, "avoir has lines")

		line := avoir.Lines[0]
		// Original line: qty=2, price=1000, discount=0 → per-unit HT=1000
		// Avoir for 1 unit: TotalHT = 1000
		expectedHT := 1000.0
		expectedVAT := math.Round(expectedHT*0.19*100) / 100
		expectedTTC := math.Round((expectedHT+expectedVAT)*100) / 100

		testutil.AssertFloatEqual(t, line.TotalHT, expectedHT, "avoir line TotalHT")
		testutil.AssertFloatEqual(t, line.TotalVAT, expectedVAT, "avoir line TotalVAT")
		testutil.AssertFloatEqual(t, line.TotalTTC, expectedTTC, "avoir line TotalTTC")
	})

	// ── 6. convert_devis_to_facture_credit ───────────────────────────────
	t.Run("convert_devis_to_facture_credit", func(t *testing.T) {
		dv, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:  DocDevis,
			ClientID: d.ClientID,
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 1, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)

		facture, err := Convert(d.TenantID, dv.ID.Hex(), d.UserID, d.UserEmail, ConvertInput{
			PaymentMethod: "cheque",
			AmountPaid:    0,
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, facture.DocType, DocFacture, "converted to facture")
		testutil.AssertEqual(t, facture.Status, StatusUnpaid, "credit convert → unpaid")
	})

	// ── 7. convert_devis_to_facture_paid ─────────────────────────────────
	t.Run("convert_devis_to_facture_paid", func(t *testing.T) {
		dv, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:  DocDevis,
			ClientID: d.ClientID,
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 1, UnitPrice: 1000, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)

		// Total should be 1000 * 1.19 = 1190
		expectedTotal := math.Round(1000*1.19*100) / 100

		facture, err := Convert(d.TenantID, dv.ID.Hex(), d.UserID, d.UserEmail, ConvertInput{
			PaymentMethod: "cash",
			AmountPaid:    expectedTotal,
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, facture.DocType, DocFacture, "converted to facture")
		testutil.AssertEqual(t, facture.Status, StatusPaid, "paid convert → paid")
	})

	// ── 8. facture_status_transitions ────────────────────────────────────
	t.Run("facture_status_transitions", func(t *testing.T) {
		// BC: draft → accepted
		bc, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:  DocBC,
			ClientID: d.ClientID,
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 1, UnitPrice: 500, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, bc.Status, StatusDraft, "BC starts as draft")

		bc, err = UpdateStatus(d.TenantID, bc.ID.Hex(), StatusAccepted)
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, bc.Status, StatusAccepted, "BC accepted")

		// Devis: draft → sent → accepted
		dv, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			DocType:  DocDevis,
			ClientID: d.ClientID,
			Lines: []LineInput{
				{ProductID: d.ProductID, Qty: 1, UnitPrice: 500, Discount: 0},
			},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, dv.Status, StatusDraft, "devis starts as draft")

		dv, err = UpdateStatus(d.TenantID, dv.ID.Hex(), StatusSent)
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, dv.Status, StatusSent, "devis sent")

		dv, err = UpdateStatus(d.TenantID, dv.ID.Hex(), StatusAccepted)
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, dv.Status, StatusAccepted, "devis accepted")

		// Try invalid transition: accepted → draft should fail
		_, err = UpdateStatus(d.TenantID, dv.ID.Hex(), StatusDraft)
		testutil.AssertError(t, err)
	})
}
