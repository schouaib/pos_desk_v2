package supplier

import (
	"context"
	"os"
	"testing"
	"time"

	"saas_pos/internal/database"
	"saas_pos/internal/testutil"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestMain(m *testing.M) {
	testutil.Setup()
	code := m.Run()
	testutil.Teardown()
	os.Exit(code)
}

func TestSupplier_Create(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	s, err := Create(tenantID, CreateInput{
		Name:    "Supplier A",
		Phone:   "0555000000",
		Address: "123 Main St",
	})
	testutil.AssertNoError(t, err)
	testutil.AssertNotEmpty(t, s.ID.Hex(), "supplier ID")
	testutil.AssertEqual(t, s.Name, "Supplier A", "supplier name")
	testutil.AssertFloatEqual(t, s.Balance, 0, "initial balance should be 0")
}

func TestSupplier_Update(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	s, err := Create(tenantID, CreateInput{Name: "Old Name", Phone: "0550000000"})
	testutil.AssertNoError(t, err)

	updated, err := Update(tenantID, s.ID.Hex(), UpdateInput{
		Name:  "New Name",
		Phone: "0551111111",
	})
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, updated.Name, "New Name", "updated name")
	testutil.AssertEqual(t, updated.Phone, "0551111111", "updated phone")
}

func TestSupplier_AdjustBalance(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	s, err := Create(tenantID, CreateInput{Name: "Balanced Supplier"})
	testutil.AssertNoError(t, err)

	adjusted, err := AdjustBalance(tenantID, s.ID.Hex(), AdjustBalanceInput{Amount: 500})
	testutil.AssertNoError(t, err)
	testutil.AssertFloatEqual(t, adjusted.Balance, 500, "balance after +500")
}

func TestSupplier_PayBalance(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	s, err := Create(tenantID, CreateInput{Name: "Pay Supplier"})
	testutil.AssertNoError(t, err)

	// Adjust balance to 500
	_, err = AdjustBalance(tenantID, s.ID.Hex(), AdjustBalanceInput{Amount: 500})
	testutil.AssertNoError(t, err)

	// To use PayBalance we need a validated purchase so the payment can be distributed.
	// Insert a mock purchase document so PayBalance doesn't fail on "exceeds total remaining".
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, _ = database.Col("purchases").InsertOne(ctx, bson.M{
		"_id":         primitive.NewObjectID(),
		"tenant_id":   tid,
		"supplier_id": s.ID,
		"status":      "validated",
		"total":       500.0,
		"paid_amount": 0.0,
		"created_at":  time.Now(),
	})

	paid, err := PayBalance(tenantID, s.ID.Hex(), 200, "partial payment", "test-user")
	testutil.AssertNoError(t, err)
	testutil.AssertFloatEqual(t, paid.Balance, 300, "balance after paying 200")
}

func TestSupplier_ArchiveUnarchive(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	s, err := Create(tenantID, CreateInput{Name: "Archive Me"})
	testutil.AssertNoError(t, err)

	// To trigger archiving (soft-delete), the supplier must have purchases.
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, _ = database.Col("purchases").InsertOne(ctx, bson.M{
		"_id":         primitive.NewObjectID(),
		"tenant_id":   tid,
		"supplier_id": s.ID,
		"status":      "validated",
		"total":       100.0,
		"paid_amount": 100.0,
		"created_at":  time.Now(),
	})

	archived, err := Delete(tenantID, s.ID.Hex())
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, archived, "supplier should be archived (not hard-deleted)")

	// Verify appears in archived list
	archivedList, err := ListArchived(tenantID, "", 1, 500)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, archivedList.Total, int64(1), "archived list count")

	// Unarchive
	err = Unarchive(tenantID, s.ID.Hex())
	testutil.AssertNoError(t, err)

	// Should be back in active list
	activeList, err := List(tenantID, "", 1, 500)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, activeList.Total, int64(1), "active list after unarchive")
}

func TestSupplierPaymentFIFO(t *testing.T) {
	testutil.CleanAll()

	var (
		tenantID   string
		supplierID string
	)

	t.Run("pay_reduces_balance", func(t *testing.T) {
		tenantID = testutil.CreateTenant(t)

		s, err := Create(tenantID, CreateInput{Name: "FIFO Supplier", Phone: "0555333333"})
		testutil.AssertNoError(t, err)
		supplierID = s.ID.Hex()

		// Set balance to 1000 via AdjustBalance
		_, err = AdjustBalance(tenantID, supplierID, AdjustBalanceInput{Amount: 1000})
		testutil.AssertNoError(t, err)

		// Insert a mock purchase so PayBalance FIFO distribution works
		tid, _ := primitive.ObjectIDFromHex(tenantID)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _ = database.Col("purchases").InsertOne(ctx, bson.M{
			"_id":         primitive.NewObjectID(),
			"tenant_id":   tid,
			"supplier_id": s.ID,
			"status":      "validated",
			"total":       1000.0,
			"paid_amount": 0.0,
			"created_at":  time.Now(),
		})

		paid, err := PayBalance(tenantID, supplierID, 400, "first payment", "test-user")
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, paid.Balance, 600, "balance after paying 400")
	})

	t.Run("pay_multiple", func(t *testing.T) {
		if supplierID == "" {
			t.Skip("depends on pay_reduces_balance")
		}
		paid, err := PayBalance(tenantID, supplierID, 300, "second payment", "test-user")
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, paid.Balance, 300, "balance after paying 300 more")

		paid, err = PayBalance(tenantID, supplierID, 300, "third payment", "test-user")
		testutil.AssertNoError(t, err)
		testutil.AssertFloatEqual(t, paid.Balance, 0, "balance should be zero")
	})

	t.Run("list_payments", func(t *testing.T) {
		if supplierID == "" {
			t.Skip("depends on pay_multiple")
		}
		result, err := ListPayments(tenantID, supplierID, "", "", 1, 50)
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, result.Total, int64(3), "three payments recorded")
		// Verify individual amounts (most recent first or oldest first — just check all exist)
		var amounts []float64
		for _, p := range result.Items {
			amounts = append(amounts, p.Amount)
		}
		testutil.AssertTrue(t, len(amounts) == 3, "should have 3 payment amounts")
	})

	t.Run("pay_zero_error", func(t *testing.T) {
		if supplierID == "" {
			t.Skip("depends on pay_multiple")
		}
		_, err := PayBalance(tenantID, supplierID, 0, "zero payment", "test-user")
		testutil.AssertError(t, err)
	})
}
