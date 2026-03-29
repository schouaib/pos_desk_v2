package adjustment

import (
	"os"
	"testing"
	"time"

	"saas_pos/internal/brand"
	"saas_pos/internal/category"
	"saas_pos/internal/product"
	"saas_pos/internal/testutil"
	"saas_pos/internal/unit"
	"saas_pos/internal/variant"
)

func TestMain(m *testing.M) {
	testutil.Setup()
	code := m.Run()
	testutil.Teardown()
	os.Exit(code)
}

type adjDeps struct {
	TenantID  string
	ProductID string
	UserID    string
	UserEmail string
}

func setupAdjDeps(t *testing.T, qty float64) adjDeps {
	t.Helper()
	tenantID := testutil.CreateTenant(t)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	testutil.AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	testutil.AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	testutil.AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name:         "Adj Test Product",
		CategoryID:   cat.ID.Hex(),
		BrandID:      br.ID.Hex(),
		UnitID:       un.ID.Hex(),
		QtyAvailable: qty,
		PrixAchat:    100,
		PrixVente1:   150,
	})
	testutil.AssertNoError(t, err)

	userID, _ := testutil.CreateUser(t, tenantID, "admin")

	return adjDeps{
		TenantID:  tenantID,
		ProductID: p.ID.Hex(),
		UserID:    userID,
		UserEmail: "admin@test.local",
	}
}

func TestAdjustment_Increase(t *testing.T) {
	testutil.CleanAll()
	d := setupAdjDeps(t, 20)

	adj, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
		ProductID: d.ProductID,
		QtyAfter:  30,
		Reason:    "recount",
	})
	testutil.AssertNoError(t, err)
	testutil.AssertFloatEqual(t, adj.QtyBefore, 20, "qty_before")
	testutil.AssertFloatEqual(t, adj.QtyAfter, 30, "qty_after")
	testutil.AssertStock(t, d.TenantID, d.ProductID, 30, "stock after increase adjustment")
}

func TestAdjustment_AuditTrail(t *testing.T) {
	testutil.CleanAll()
	d := setupAdjDeps(t, 20)

	// First adjustment: set to 30
	_, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
		ProductID: d.ProductID,
		QtyAfter:  30,
		Reason:    "first recount",
	})
	testutil.AssertNoError(t, err)

	// Second adjustment: set to 50
	adj2, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
		ProductID: d.ProductID,
		QtyAfter:  50,
		Reason:    "second recount",
	})
	testutil.AssertNoError(t, err)
	testutil.AssertFloatEqual(t, adj2.QtyBefore, 30, "qty_before should be 30")
	testutil.AssertFloatEqual(t, adj2.QtyAfter, 50, "qty_after should be 50")
}

func TestAdjustment_VariantAdjust(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	testutil.AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	testutil.AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	testutil.AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name:         "Variant Parent",
		CategoryID:   cat.ID.Hex(),
		BrandID:      br.ID.Hex(),
		UnitID:       un.ID.Hex(),
		QtyAvailable: 0,
		PrixAchat:    100,
		PrixVente1:   150,
	})
	testutil.AssertNoError(t, err)

	v, err := variant.Create(tenantID, p.ID.Hex(), variant.CreateInput{
		Attributes:   map[string]string{"color": "Red"},
		QtyAvailable: 10,
		PrixAchat:    100,
		PrixVente1:   150,
	})
	testutil.AssertNoError(t, err)

	userID, _ := testutil.CreateUser(t, tenantID, "admin")

	adj, err := Create(tenantID, userID, "admin@test.local", CreateInput{
		ProductID: p.ID.Hex(),
		VariantID: v.ID.Hex(),
		QtyAfter:  25,
		Reason:    "variant recount",
	})
	testutil.AssertNoError(t, err)
	testutil.AssertFloatEqual(t, adj.QtyBefore, 10, "variant qty_before")
	testutil.AssertFloatEqual(t, adj.QtyAfter, 25, "variant qty_after")

	testutil.AssertVariantStockEqual(t, v.ID.Hex(), 25, "variant stock after adjust")
	testutil.AssertStock(t, tenantID, p.ID.Hex(), 25, "parent stock synced after variant adjust")
}

func TestAdjustment_List(t *testing.T) {
	testutil.CleanAll()
	d := setupAdjDeps(t, 20)

	_, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
		ProductID: d.ProductID,
		QtyAfter:  30,
		Reason:    "recount 1",
	})
	testutil.AssertNoError(t, err)

	_, err = Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
		ProductID: d.ProductID,
		QtyAfter:  25,
		Reason:    "recount 2",
	})
	testutil.AssertNoError(t, err)

	from := time.Now().Add(-1 * time.Hour)
	to := time.Now().Add(1 * time.Hour)
	list, err := List(d.TenantID, "", from, to, 1, 10)
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, list.Total >= 2, "should list at least 2 adjustments")
}

func TestAdjustment_SearchByProduct(t *testing.T) {
	testutil.CleanAll()
	d := setupAdjDeps(t, 20)

	_, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
		ProductID: d.ProductID,
		QtyAfter:  30,
		Reason:    "recount",
	})
	testutil.AssertNoError(t, err)

	from := time.Now().Add(-1 * time.Hour)
	to := time.Now().Add(1 * time.Hour)
	list, err := List(d.TenantID, "Adj Test", from, to, 1, 10)
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, list.Total >= 1, "search by product name should find adjustment")
}
