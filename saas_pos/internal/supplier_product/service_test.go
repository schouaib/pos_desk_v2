package supplier_product

import (
	"os"
	"testing"

	"saas_pos/internal/brand"
	"saas_pos/internal/category"
	"saas_pos/internal/product"
	"saas_pos/internal/supplier"
	"saas_pos/internal/testutil"
	"saas_pos/internal/unit"
)

func TestMain(m *testing.M) {
	testutil.Setup()
	code := m.Run()
	testutil.Teardown()
	os.Exit(code)
}

// spDeps holds pre-created IDs for supplier_product tests.
type spDeps struct {
	TenantID   string
	SupplierID string
	ProductID  string
}

func setupSPDeps(t *testing.T) spDeps {
	t.Helper()
	tenantID := testutil.CreateTenant(t)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "SP Cat"})
	testutil.AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "SP Brand"})
	testutil.AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "SP Unit"})
	testutil.AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name:       "SP Product",
		CategoryID: cat.ID.Hex(),
		BrandID:    br.ID.Hex(),
		UnitID:     un.ID.Hex(),
		PrixVente1: 100,
	})
	testutil.AssertNoError(t, err)

	s, err := supplier.Create(tenantID, supplier.CreateInput{
		Name:  "SP Supplier",
		Phone: "0550000000",
	})
	testutil.AssertNoError(t, err)

	return spDeps{
		TenantID:   tenantID,
		SupplierID: s.ID.Hex(),
		ProductID:  p.ID.Hex(),
	}
}

func TestSupplierProduct_Link(t *testing.T) {
	testutil.CleanAll()
	d := setupSPDeps(t)

	sp, err := Create(d.TenantID, CreateInput{
		SupplierID:    d.SupplierID,
		ProductID:     d.ProductID,
		SupplierRef:   "REF-001",
		SupplierPrice: 80,
	})
	testutil.AssertNoError(t, err)
	testutil.AssertNotEmpty(t, sp.ID.Hex(), "supplier_product ID")
	testutil.AssertEqual(t, sp.SupplierRef, "REF-001", "supplier ref")
	testutil.AssertFloatEqual(t, sp.SupplierPrice, 80, "supplier price")
}

func TestSupplierProduct_ListBySupplier(t *testing.T) {
	testutil.CleanAll()
	d := setupSPDeps(t)

	_, err := Create(d.TenantID, CreateInput{
		SupplierID:    d.SupplierID,
		ProductID:     d.ProductID,
		SupplierPrice: 80,
	})
	testutil.AssertNoError(t, err)

	list, err := ListBySupplier(d.TenantID, d.SupplierID, 1, 10)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, list.Total, int64(1), "list by supplier count")
	testutil.AssertEqual(t, list.Items[0].ProductName, "SP Product", "product name in listing")
}

func TestSupplierProduct_ListByProduct(t *testing.T) {
	testutil.CleanAll()
	d := setupSPDeps(t)

	_, err := Create(d.TenantID, CreateInput{
		SupplierID:    d.SupplierID,
		ProductID:     d.ProductID,
		SupplierPrice: 90,
	})
	testutil.AssertNoError(t, err)

	items, err := ListByProduct(d.TenantID, d.ProductID)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, len(items), 1, "list by product count")
	testutil.AssertEqual(t, items[0].SupplierName, "SP Supplier", "supplier name in listing")
}

func TestSupplierProduct_Upsert(t *testing.T) {
	testutil.CleanAll()
	d := setupSPDeps(t)

	// First create
	sp1, err := Create(d.TenantID, CreateInput{
		SupplierID:    d.SupplierID,
		ProductID:     d.ProductID,
		SupplierRef:   "REF-V1",
		SupplierPrice: 80,
	})
	testutil.AssertNoError(t, err)

	// Second create with same supplier+product should upsert (update, not duplicate)
	sp2, err := Create(d.TenantID, CreateInput{
		SupplierID:    d.SupplierID,
		ProductID:     d.ProductID,
		SupplierRef:   "REF-V2",
		SupplierPrice: 85,
	})
	testutil.AssertNoError(t, err)

	// Should be same document (same ID)
	testutil.AssertEqual(t, sp1.ID, sp2.ID, "upsert should keep same ID")
	testutil.AssertEqual(t, sp2.SupplierRef, "REF-V2", "upsert should update ref")
	testutil.AssertFloatEqual(t, sp2.SupplierPrice, 85, "upsert should update price")

	// Only one link should exist
	list, err := ListBySupplier(d.TenantID, d.SupplierID, 1, 10)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, list.Total, int64(1), "should have exactly 1 link after upsert")
}

func TestSupplierProduct_Delete(t *testing.T) {
	testutil.CleanAll()
	d := setupSPDeps(t)

	sp, err := Create(d.TenantID, CreateInput{
		SupplierID:    d.SupplierID,
		ProductID:     d.ProductID,
		SupplierPrice: 75,
	})
	testutil.AssertNoError(t, err)

	err = Delete(d.TenantID, sp.ID.Hex())
	testutil.AssertNoError(t, err)

	// Verify gone
	list, err := ListBySupplier(d.TenantID, d.SupplierID, 1, 10)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, list.Total, int64(0), "link count after delete")
}
