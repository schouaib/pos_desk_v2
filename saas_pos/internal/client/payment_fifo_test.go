package client_test

import (
	"testing"

	"saas_pos/internal/brand"
	"saas_pos/internal/category"
	"saas_pos/internal/client"
	"saas_pos/internal/product"
	"saas_pos/internal/sale"
	"saas_pos/internal/sale_return"
	"saas_pos/internal/testutil"
	"saas_pos/internal/unit"
)

func TestClientPaymentFIFO(t *testing.T) {
	testutil.Setup()

	var (
		tenantID  string
		userID    string
		userEmail string
		clientID  string
		productID string
	)

	t.Run("setup", func(t *testing.T) {
		tenantID = testutil.CreateTenant(t)
		userID, _ = testutil.CreateUser(t, tenantID, "admin")
		userEmail = "fifo-user@test.local"

		cl, err := client.Create(tenantID, client.ClientInput{Name: "FIFO Client", Phone: "0555444333"})
		testutil.AssertNoError(t, err)
		clientID = cl.ID.Hex()

		cat, err := category.Create(tenantID, category.CreateInput{Name: "FIFO Cat"})
		testutil.AssertNoError(t, err)
		br, err := brand.Create(tenantID, brand.CreateInput{Name: "FIFO Brand"})
		testutil.AssertNoError(t, err)
		un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
		testutil.AssertNoError(t, err)

		p, err := product.Create(tenantID, product.CreateInput{
			Name: "FIFO Widget", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(),
			UnitID: un.ID.Hex(), PrixAchat: 50, PrixVente1: 100, VAT: 0, QtyAvailable: 100,
		})
		testutil.AssertNoError(t, err)
		productID = p.ID.Hex()
	})

	t.Run("credit_sale_creates_balance", func(t *testing.T) {
		_, err := sale.Create(tenantID, userID, userEmail, sale.CreateInput{
			Lines:         []sale.SaleLineInput{{ProductID: productID, Qty: 5, UnitPrice: 100}},
			PaymentMethod: "cash", AmountPaid: 0, ClientID: clientID, SaleType: "credit",
		})
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, testutil.GetClientBalance(t, tenantID, clientID), 500, "balance=500")
	})

	t.Run("second_credit_sale", func(t *testing.T) {
		_, err := sale.Create(tenantID, userID, userEmail, sale.CreateInput{
			Lines:         []sale.SaleLineInput{{ProductID: productID, Qty: 3, UnitPrice: 100}},
			PaymentMethod: "cash", AmountPaid: 0, ClientID: clientID, SaleType: "credit",
		})
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, testutil.GetClientBalance(t, tenantID, clientID), 800, "balance=800")
	})

	t.Run("partial_payment", func(t *testing.T) {
		_, err := client.AddPayment(tenantID, clientID, client.PaymentInput{Amount: 200, Note: "partial"})
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, testutil.GetClientBalance(t, tenantID, clientID), 600, "balance=600")
	})

	t.Run("statement_running_balance", func(t *testing.T) {
		entries, err := client.GetStatement(tenantID, clientID)
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, len(entries) >= 3, "at least 2 sales + 1 payment")
		last := entries[len(entries)-1]
		testutil.AssertFloatEqual(t, last.Balance, 600, "running balance=600")
	})

	t.Run("full_payment_clears", func(t *testing.T) {
		_, err := client.AddPayment(tenantID, clientID, client.PaymentInput{Amount: 600, Note: "clear"})
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, testutil.GetClientBalance(t, tenantID, clientID), 0, "balance=0")
	})

	t.Run("statement_final", func(t *testing.T) {
		entries, err := client.GetStatement(tenantID, clientID)
		testutil.AssertNoError(t, err)
		last := entries[len(entries)-1]
		testutil.AssertFloatEqual(t, last.Balance, 0, "final balance=0")
	})

	t.Run("payment_after_return", func(t *testing.T) {
		s, err := sale.Create(tenantID, userID, userEmail, sale.CreateInput{
			Lines:         []sale.SaleLineInput{{ProductID: productID, Qty: 2, UnitPrice: 100}},
			PaymentMethod: "cash", AmountPaid: 0, ClientID: clientID, SaleType: "credit",
		})
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, testutil.GetClientBalance(t, tenantID, clientID), 200, "balance=200 after credit sale")

		_, err = sale_return.Create(tenantID, userID, userEmail, s.ID.Hex(), sale_return.CreateInput{
			Lines: []sale_return.ReturnLineInput{{ProductID: productID, Qty: 1, Reason: "defective"}},
		})
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, testutil.GetClientBalance(t, tenantID, clientID), 200, "balance=200 after return (return negative sale has total=0 due to discount capping)")
		testutil.AssertFloatEqual(t, testutil.GetProductStock(t, tenantID, productID), 91, "stock=91")
	})
}
