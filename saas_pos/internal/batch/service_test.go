package batch

import (
	"os"
	"testing"
	"time"

	"saas_pos/internal/brand"
	"saas_pos/internal/category"
	"saas_pos/internal/product"
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

// setupProduct creates a tenant and a product with expiry_alert_days, returning IDs.
func setupProduct(t *testing.T, expiryAlertDays int) (tenantID, productID string) {
	t.Helper()
	tenantID = testutil.CreateTenant(t)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "General"})
	testutil.AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "BrandX"})
	testutil.AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	testutil.AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name:            "Batch Product",
		CategoryID:      cat.ID.Hex(),
		BrandID:         br.ID.Hex(),
		UnitID:          un.ID.Hex(),
		PrixAchat:       100,
		PrixVente1:      150,
		VAT:             19,
		ExpiryAlertDays: expiryAlertDays,
	})
	testutil.AssertNoError(t, err)
	return tenantID, p.ID.Hex()
}

func TestBatch_Create(t *testing.T) {
	testutil.CleanAll()
	tenantID, productID := setupProduct(t, 0)

	expiry := time.Now().AddDate(0, 0, 30).Format("2006-01-02")
	b, err := Create(tenantID, CreateInput{
		ProductID:   productID,
		BatchNumber: "LOT001",
		ExpiryDate:  &expiry,
		Qty:         10,
		PrixAchat:   100,
	})
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, b.BatchNumber, "LOT001", "batch number")
	testutil.AssertFloatEqual(t, b.Qty, 10, "batch qty")

	// Create should increment product stock
	testutil.AssertStock(t, tenantID, productID, 10, "stock after batch create")
}

func TestBatch_SecondBatch(t *testing.T) {
	testutil.CleanAll()
	tenantID, productID := setupProduct(t, 0)

	expiry30 := time.Now().AddDate(0, 0, 30).Format("2006-01-02")
	_, err := Create(tenantID, CreateInput{
		ProductID:   productID,
		BatchNumber: "LOT001",
		ExpiryDate:  &expiry30,
		Qty:         10,
		PrixAchat:   100,
	})
	testutil.AssertNoError(t, err)

	expiry60 := time.Now().AddDate(0, 0, 60).Format("2006-01-02")
	_, err = Create(tenantID, CreateInput{
		ProductID:   productID,
		BatchNumber: "LOT002",
		ExpiryDate:  &expiry60,
		Qty:         5,
		PrixAchat:   110,
	})
	testutil.AssertNoError(t, err)

	// Total stock should be 15
	testutil.AssertStock(t, tenantID, productID, 15, "total stock after two batches")
}

func TestBatch_FIFO(t *testing.T) {
	testutil.CleanAll()
	tenantID, productID := setupProduct(t, 0)
	pid, _ := primitive.ObjectIDFromHex(productID)

	expiry30 := time.Now().AddDate(0, 0, 30).Format("2006-01-02")
	_, err := Create(tenantID, CreateInput{
		ProductID:   productID,
		BatchNumber: "LOT001",
		ExpiryDate:  &expiry30,
		Qty:         10,
		PrixAchat:   100,
	})
	testutil.AssertNoError(t, err)

	expiry60 := time.Now().AddDate(0, 0, 60).Format("2006-01-02")
	_, err = Create(tenantID, CreateInput{
		ProductID:   productID,
		BatchNumber: "LOT002",
		ExpiryDate:  &expiry60,
		Qty:         5,
		PrixAchat:   110,
	})
	testutil.AssertNoError(t, err)

	// Decrement 8 via FIFO: LOT001 should go from 10 to 2, LOT002 stays at 5
	DecrementFIFO(tenantID, pid, 8)

	res, err := ListByProduct(tenantID, productID, 1, 50)
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, len(res.Items) == 2, "should have 2 batches")

	// Items are sorted by expiry_date asc, so LOT001 first
	testutil.AssertFloatEqual(t, res.Items[0].Qty, 2, "LOT001 qty after FIFO decrement")
	testutil.AssertFloatEqual(t, res.Items[1].Qty, 5, "LOT002 qty after FIFO decrement")
}

func TestBatch_FIFOCrossBatch(t *testing.T) {
	testutil.CleanAll()
	tenantID, productID := setupProduct(t, 0)
	pid, _ := primitive.ObjectIDFromHex(productID)

	expiry30 := time.Now().AddDate(0, 0, 30).Format("2006-01-02")
	_, err := Create(tenantID, CreateInput{
		ProductID:   productID,
		BatchNumber: "LOT001",
		ExpiryDate:  &expiry30,
		Qty:         10,
		PrixAchat:   100,
	})
	testutil.AssertNoError(t, err)

	expiry60 := time.Now().AddDate(0, 0, 60).Format("2006-01-02")
	_, err = Create(tenantID, CreateInput{
		ProductID:   productID,
		BatchNumber: "LOT002",
		ExpiryDate:  &expiry60,
		Qty:         5,
		PrixAchat:   110,
	})
	testutil.AssertNoError(t, err)

	// First decrement: take 8 from LOT001 (LOT001=2, LOT002=5)
	DecrementFIFO(tenantID, pid, 8)
	// Second decrement: take 4 more, crosses from LOT001(2) into LOT002
	// LOT001: 2-2=0, LOT002: 5-2=3
	DecrementFIFO(tenantID, pid, 4)

	res, err := ListByProduct(tenantID, productID, 1, 50)
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, len(res.Items) == 2, "should have 2 batches")

	testutil.AssertFloatEqual(t, res.Items[0].Qty, 0, "LOT001 qty after cross-batch FIFO")
	testutil.AssertFloatEqual(t, res.Items[1].Qty, 3, "LOT002 qty after cross-batch FIFO")
}

func TestBatch_ListExpiring(t *testing.T) {
	testutil.CleanAll()
	tenantID, productID := setupProduct(t, 0)

	// LOT001 expires in 20 days (within 30-day window)
	expiry20 := time.Now().AddDate(0, 0, 20).Format("2006-01-02")
	_, err := Create(tenantID, CreateInput{
		ProductID:   productID,
		BatchNumber: "LOT001",
		ExpiryDate:  &expiry20,
		Qty:         10,
		PrixAchat:   100,
	})
	testutil.AssertNoError(t, err)

	// LOT002 expires in 60 days (outside 30-day window)
	expiry60 := time.Now().AddDate(0, 0, 60).Format("2006-01-02")
	_, err = Create(tenantID, CreateInput{
		ProductID:   productID,
		BatchNumber: "LOT002",
		ExpiryDate:  &expiry60,
		Qty:         5,
		PrixAchat:   110,
	})
	testutil.AssertNoError(t, err)

	items, err := ListExpiring(tenantID, 30)
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, len(items) >= 1, "should find at least 1 expiring batch")

	found := false
	for _, b := range items {
		if b.BatchNumber == "LOT001" {
			found = true
		}
	}
	testutil.AssertTrue(t, found, "LOT001 should be in expiring list")
}

func TestBatch_Alerts(t *testing.T) {
	testutil.CleanAll()
	// Product with expiry_alert_days=15
	tenantID, productID := setupProduct(t, 15)

	// Batch expiring in 10 days (within 15-day alert window)
	expiry10 := time.Now().AddDate(0, 0, 10).Format("2006-01-02")
	_, err := Create(tenantID, CreateInput{
		ProductID:   productID,
		BatchNumber: "ALERT001",
		ExpiryDate:  &expiry10,
		Qty:         5,
		PrixAchat:   100,
	})
	testutil.AssertNoError(t, err)

	alerts, err := ListAlerts(tenantID)
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, len(alerts) >= 1, "should find at least 1 alert batch")

	found := false
	for _, b := range alerts {
		if b.BatchNumber == "ALERT001" {
			found = true
		}
	}
	testutil.AssertTrue(t, found, "ALERT001 should appear in alerts")
}

func TestBatch_CreateFromPurchase(t *testing.T) {
	testutil.CleanAll()
	tenantID, productID := setupProduct(t, 0)
	pid, _ := primitive.ObjectIDFromHex(productID)

	expiry := time.Now().AddDate(0, 0, 45)

	// CreateFromPurchase does NOT increment stock (purchase validation handles that)
	CreateFromPurchase(tenantID, pid, "Batch Product", "PURCH001", &expiry, 20, 95)

	// Stock should still be 0 (product was created with 0 qty)
	testutil.AssertStock(t, tenantID, productID, 0, "stock not incremented by CreateFromPurchase")

	// But the batch should exist
	res, err := ListByProduct(tenantID, productID, 1, 50)
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, len(res.Items) == 1, "batch should exist after CreateFromPurchase")
	testutil.AssertEqual(t, res.Items[0].BatchNumber, "PURCH001", "batch number")
	testutil.AssertFloatEqual(t, res.Items[0].Qty, 20, "batch qty")
}

func TestBatch_Delete(t *testing.T) {
	testutil.CleanAll()
	tenantID, productID := setupProduct(t, 0)

	expiry := time.Now().AddDate(0, 0, 30).Format("2006-01-02")
	b, err := Create(tenantID, CreateInput{
		ProductID:   productID,
		BatchNumber: "DEL001",
		ExpiryDate:  &expiry,
		Qty:         10,
		PrixAchat:   100,
	})
	testutil.AssertNoError(t, err)

	err = Delete(tenantID, b.ID.Hex())
	testutil.AssertNoError(t, err)

	// Verify batch is gone
	res, err := ListByProduct(tenantID, productID, 1, 50)
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, len(res.Items) == 0, "batch should be deleted")
}
