package client

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"saas_pos/internal/database"
	"saas_pos/internal/testutil"

	"go.mongodb.org/mongo-driver/bson"
)

func TestMain(m *testing.M) {
	testutil.Setup()
	code := m.Run()
	testutil.Teardown()
	os.Exit(code)
}

func TestClientFlow(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	var clientID string

	t.Run("create", func(t *testing.T) {
		c, err := Create(tenantID, ClientInput{
			Name:    "Acme Corp",
			Phone:   "0555123456",
			Email:   "acme@test.local",
			Address: "123 Main St",
			RC:      "RC-001",
			NIF:     "NIF-001",
		})
		testutil.AssertNoError(t, err)
		clientID = c.ID.Hex()
		testutil.AssertNotEmpty(t, clientID, "client ID")
		testutil.AssertTrue(t, strings.HasPrefix(c.Code, "CLT-"), "code prefix CLT-")
		testutil.AssertFloatEqual(t, c.Balance, 0, "initial balance")
	})

	t.Run("update", func(t *testing.T) {
		c, err := Update(tenantID, clientID, ClientInput{
			Name:  "Acme Corp Updated",
			Phone: "0555999888",
			RC:    "RC-002",
			NIF:   "NIF-002",
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, c.Name, "Acme Corp Updated", "updated name")
		testutil.AssertEqual(t, c.Phone, "0555999888", "updated phone")
		testutil.AssertEqual(t, c.RC, "RC-002", "updated RC")
		testutil.AssertEqual(t, c.NIF, "NIF-002", "updated NIF")
	})

	t.Run("adjust_balance", func(t *testing.T) {
		err := AdjustBalance(tenantID, clientID, 1000)
		testutil.AssertNoError(t, err)
		bal := testutil.GetClientBalance(t, tenantID, clientID)
		testutil.AssertFloatEqual(t, bal, 1000, "balance after +1000")
	})

	t.Run("add_payment_partial", func(t *testing.T) {
		p, err := AddPayment(tenantID, clientID, PaymentInput{Amount: 400, Note: "partial payment"})
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, p.Amount, 400, "payment amount")
		bal := testutil.GetClientBalance(t, tenantID, clientID)
		testutil.AssertFloatEqual(t, bal, 600, "balance after partial payment")
	})

	t.Run("add_payment_full", func(t *testing.T) {
		_, err := AddPayment(tenantID, clientID, PaymentInput{Amount: 600, Note: "full payment"})
		testutil.AssertNoError(t, err)
		bal := testutil.GetClientBalance(t, tenantID, clientID)
		testutil.AssertFloatEqual(t, bal, 0, "balance after full payment")
	})

	t.Run("list_payments", func(t *testing.T) {
		res, err := ListPayments(tenantID, clientID, 1, 10)
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, int(res.Total), 2, "payment count")
	})

	t.Run("payments_sum", func(t *testing.T) {
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)
		sum, err := PaymentsSum(tenantID, from, to)
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, sum, 1000, "payments sum")
	})

	t.Run("get_statement", func(t *testing.T) {
		entries, err := GetStatement(tenantID, clientID)
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, len(entries) > 0, "statement has entries")
	})

	t.Run("delete_with_balance", func(t *testing.T) {
		// Give the client a balance and some sale history so Delete archives
		err := AdjustBalance(tenantID, clientID, 500)
		testutil.AssertNoError(t, err)

		// Delete should fail because client has outstanding balance
		_, err = Delete(tenantID, clientID)
		testutil.AssertError(t, err)

		// Pay off balance, then create a sale record so it archives instead of hard-deleting
		err = AdjustBalance(tenantID, clientID, -500)
		testutil.AssertNoError(t, err)

		// Insert a fake sale record to trigger archival path
		insertFakeSale(t, tenantID, clientID)

		archived, err := Delete(tenantID, clientID)
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, archived, "client should be archived (has history)")
	})

	t.Run("list_archived", func(t *testing.T) {
		res, err := ListArchived(tenantID, "", 1, 10)
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, res.Total >= 1, "archived list has items")
		found := false
		for _, c := range res.Items {
			if c.ID.Hex() == clientID {
				found = true
			}
		}
		testutil.AssertTrue(t, found, "archived client found in list")
	})

	t.Run("unarchive", func(t *testing.T) {
		err := Unarchive(tenantID, clientID)
		testutil.AssertNoError(t, err)

		// Client should appear in normal list now
		c, err := GetByID(tenantID, clientID)
		testutil.AssertNoError(t, err)
		testutil.AssertFalse(t, c.Archived, "client should not be archived")
	})

	t.Run("duplicate_name_allowed", func(t *testing.T) {
		// Creating a second client with the same name should succeed
		c2, err := Create(tenantID, ClientInput{Name: "Acme Corp Updated"})
		testutil.AssertNoError(t, err)
		testutil.AssertNotEmpty(t, c2.ID.Hex(), "second client ID")
	})
}

// insertFakeSale inserts a minimal sale document so the Delete path detects history.
func insertFakeSale(t *testing.T, tenantID, clientID string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := database.Col("sales").InsertOne(ctx, bson.M{
		"tenant_id":  tenantID,
		"client_id":  clientID,
		"ref":        "TEST-SALE-001",
		"total":      100.0,
		"sale_type":  "credit",
		"created_at": time.Now(),
	})
	if err != nil {
		t.Fatalf("insertFakeSale: %v", err)
	}
}

// ── TestClientPaymentIsolated ────────────────────────────────────────────────
// Pure client-level payment tests without cross-package sale dependencies.

func TestClientPaymentIsolated(t *testing.T) {
	testutil.Setup()
	tenantID := testutil.CreateTenant(t)

	var clientID string

	t.Run("setup", func(t *testing.T) {
		cl, err := Create(tenantID, ClientInput{
			Name:  "Payment Isolated Client",
			Phone: "0555777666",
		})
		testutil.AssertNoError(t, err)
		clientID = cl.ID.Hex()
	})

	t.Run("payment_reduces_balance", func(t *testing.T) {
		err := AdjustBalance(tenantID, clientID, 500)
		testutil.AssertNoError(t, err)

		_, err = AddPayment(tenantID, clientID, PaymentInput{Amount: 200, Note: "reduce test"})
		testutil.AssertNoError(t, err)

		bal := testutil.GetClientBalance(t, tenantID, clientID)
		testutil.AssertFloatEqual(t, bal, 300, "balance after +500 then pay 200 = 300")
	})

	t.Run("multiple_payments_clear_balance", func(t *testing.T) {
		// Balance is currently 300 from previous test. Reset to 1000.
		err := AdjustBalance(tenantID, clientID, -300+1000) // net +700 → bal=1000
		testutil.AssertNoError(t, err)

		bal := testutil.GetClientBalance(t, tenantID, clientID)
		testutil.AssertFloatEqual(t, bal, 1000, "balance before multiple payments")

		_, err = AddPayment(tenantID, clientID, PaymentInput{Amount: 300, Note: "pay 1"})
		testutil.AssertNoError(t, err)
		_, err = AddPayment(tenantID, clientID, PaymentInput{Amount: 300, Note: "pay 2"})
		testutil.AssertNoError(t, err)
		_, err = AddPayment(tenantID, clientID, PaymentInput{Amount: 400, Note: "pay 3"})
		testutil.AssertNoError(t, err)

		bal = testutil.GetClientBalance(t, tenantID, clientID)
		testutil.AssertFloatEqual(t, bal, 0, "balance after 300+300+400 = 0")
	})

	t.Run("payments_sum_date_range", func(t *testing.T) {
		// We made payments: 200 + 300 + 300 + 400 = 1200 total for this client
		from := time.Now().Add(-1 * time.Hour)
		to := time.Now().Add(1 * time.Hour)
		sum, err := PaymentsSum(tenantID, from, to)
		testutil.AssertNoError(t, err)
		testutil.AssertTrue(t, sum >= 1200, "payments sum includes all payments made")
	})

	t.Run("statement_entries_and_balance", func(t *testing.T) {
		// Statement shows payments made via AddPayment
		entries, err := GetStatement(tenantID, clientID)
		testutil.AssertNoError(t, err)

		// We've made 4 payments (200 + 300 + 300 + 400) so at least some should appear
		paymentCount := 0
		for _, e := range entries {
			if e.Type == "payment" {
				paymentCount++
			}
		}
		testutil.AssertTrue(t, paymentCount >= 4, "statement has at least 4 payment entries")

		// Verify chronological ordering
		for i := 1; i < len(entries); i++ {
			testutil.AssertTrue(t,
				!entries[i].Date.Before(entries[i-1].Date),
				"statement entries are chronological",
			)
		}
	})
}
