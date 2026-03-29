package transfer

import (
	"os"
	"testing"

	"saas_pos/internal/brand"
	"saas_pos/internal/category"
	"saas_pos/internal/location"
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

type transferDeps struct {
	TenantID  string
	LocAID    string
	LocBID    string
	ProductID string
	UserID    string
	UserEmail string
}

func setupTransferDeps(t *testing.T) transferDeps {
	t.Helper()
	tenantID := testutil.CreateTenant(t)

	locA, err := location.Create(tenantID, location.CreateInput{Name: "Warehouse A", Address: "A"})
	testutil.AssertNoError(t, err)
	locB, err := location.Create(tenantID, location.CreateInput{Name: "Store B", Address: "B"})
	testutil.AssertNoError(t, err)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	testutil.AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	testutil.AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	testutil.AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name:         "Transfer Product",
		CategoryID:   cat.ID.Hex(),
		BrandID:      br.ID.Hex(),
		UnitID:       un.ID.Hex(),
		QtyAvailable: 100,
		PrixAchat:    50,
		PrixVente1:   80,
	})
	testutil.AssertNoError(t, err)

	userID, _ := testutil.CreateUser(t, tenantID, "admin")

	return transferDeps{
		TenantID:  tenantID,
		LocAID:    locA.ID.Hex(),
		LocBID:    locB.ID.Hex(),
		ProductID: p.ID.Hex(),
		UserID:    userID,
		UserEmail: "admin@test.local",
	}
}

func TestTransfer_Create(t *testing.T) {
	testutil.CleanAll()
	d := setupTransferDeps(t)

	tr, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
		FromLocationID: d.LocAID,
		ToLocationID:   d.LocBID,
		Lines: []TransferLineInput{
			{ProductID: d.ProductID, Qty: 5},
		},
	})
	testutil.AssertNoError(t, err)
	testutil.AssertNotEmpty(t, tr.ID.Hex(), "transfer ID")
	testutil.AssertEqual(t, tr.Status, StatusDraft, "status should be draft")
	testutil.AssertEqual(t, len(tr.Lines), 1, "line count")
}

func TestTransfer_Complete(t *testing.T) {
	testutil.CleanAll()
	d := setupTransferDeps(t)

	tr, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
		FromLocationID: d.LocAID,
		ToLocationID:   d.LocBID,
		Lines: []TransferLineInput{
			{ProductID: d.ProductID, Qty: 5},
		},
	})
	testutil.AssertNoError(t, err)

	completed, err := Complete(d.TenantID, tr.ID.Hex())
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, completed.Status, StatusCompleted, "status should be completed")
}

func TestTransfer_SameLocation(t *testing.T) {
	testutil.CleanAll()
	d := setupTransferDeps(t)

	_, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
		FromLocationID: d.LocAID,
		ToLocationID:   d.LocAID,
		Lines: []TransferLineInput{
			{ProductID: d.ProductID, Qty: 5},
		},
	})
	testutil.AssertError(t, err)
}

func TestTransfer_Delete(t *testing.T) {
	testutil.CleanAll()
	d := setupTransferDeps(t)

	tr, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
		FromLocationID: d.LocAID,
		ToLocationID:   d.LocBID,
		Lines: []TransferLineInput{
			{ProductID: d.ProductID, Qty: 5},
		},
	})
	testutil.AssertNoError(t, err)

	err = Delete(d.TenantID, tr.ID.Hex())
	testutil.AssertNoError(t, err)

	// Verify removed
	list, err := List(d.TenantID, 1, 10)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, list.Total, int64(0), "list should be empty after delete")
}
