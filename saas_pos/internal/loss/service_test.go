package loss

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

// lossDeps holds IDs for required product dependencies.
type lossDeps struct {
	TenantID  string
	ProductID string
}

func setupLossDeps(t *testing.T, qty float64) lossDeps {
	t.Helper()
	tenantID := testutil.CreateTenant(t)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	testutil.AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	testutil.AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	testutil.AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name:         "Loss Test Product",
		CategoryID:   cat.ID.Hex(),
		BrandID:      br.ID.Hex(),
		UnitID:       un.ID.Hex(),
		QtyAvailable: qty,
		PrixAchat:    100,
		PrixVente1:   150,
	})
	testutil.AssertNoError(t, err)

	return lossDeps{
		TenantID:  tenantID,
		ProductID: p.ID.Hex(),
	}
}

func TestLoss_Vol(t *testing.T) {
	testutil.CleanAll()
	d := setupLossDeps(t, 50)

	_, err := Create(d.TenantID, CreateInput{
		ProductID: d.ProductID,
		Type:      "vol",
		Qty:       3,
		Remark:    "stolen",
	})
	testutil.AssertNoError(t, err)
	testutil.AssertStock(t, d.TenantID, d.ProductID, 47, "stock after vol loss")
}

func TestLoss_Perte(t *testing.T) {
	testutil.CleanAll()
	d := setupLossDeps(t, 50)

	// First loss: vol 3 => 47
	_, err := Create(d.TenantID, CreateInput{
		ProductID: d.ProductID,
		Type:      "vol",
		Qty:       3,
		Remark:    "stolen",
	})
	testutil.AssertNoError(t, err)

	// Second loss: perte 2 => 45
	_, err = Create(d.TenantID, CreateInput{
		ProductID: d.ProductID,
		Type:      "perte",
		Qty:       2,
		Remark:    "expired",
	})
	testutil.AssertNoError(t, err)
	testutil.AssertStock(t, d.TenantID, d.ProductID, 45, "stock after perte loss")
}

func TestLoss_Casse(t *testing.T) {
	testutil.CleanAll()
	d := setupLossDeps(t, 50)

	// vol 3 => 47
	_, err := Create(d.TenantID, CreateInput{ProductID: d.ProductID, Type: "vol", Qty: 3})
	testutil.AssertNoError(t, err)
	// perte 2 => 45
	_, err = Create(d.TenantID, CreateInput{ProductID: d.ProductID, Type: "perte", Qty: 2})
	testutil.AssertNoError(t, err)
	// casse 1 => 44
	_, err = Create(d.TenantID, CreateInput{ProductID: d.ProductID, Type: "casse", Qty: 1, Remark: "broken"})
	testutil.AssertNoError(t, err)

	testutil.AssertStock(t, d.TenantID, d.ProductID, 44, "stock after casse loss")
}

func TestLoss_VariantLoss(t *testing.T) {
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
		Attributes:   map[string]string{"size": "L"},
		QtyAvailable: 20,
		PrixAchat:    100,
		PrixVente1:   150,
	})
	testutil.AssertNoError(t, err)

	_, err = Create(tenantID, CreateInput{
		ProductID: p.ID.Hex(),
		VariantID: v.ID.Hex(),
		Type:      "vol",
		Qty:       5,
		Remark:    "variant loss",
	})
	testutil.AssertNoError(t, err)

	testutil.AssertVariantStockEqual(t, v.ID.Hex(), 15, "variant stock after loss")
	// Parent should be synced to sum of variants
	testutil.AssertStock(t, tenantID, p.ID.Hex(), 15, "parent stock synced after variant loss")
}

func TestLoss_QtyZero(t *testing.T) {
	testutil.CleanAll()
	d := setupLossDeps(t, 50)

	_, err := Create(d.TenantID, CreateInput{
		ProductID: d.ProductID,
		Type:      "vol",
		Qty:       0,
	})
	testutil.AssertError(t, err)
}

func TestLoss_InvalidType(t *testing.T) {
	testutil.CleanAll()
	d := setupLossDeps(t, 50)

	_, err := Create(d.TenantID, CreateInput{
		ProductID: d.ProductID,
		Type:      "invalid",
		Qty:       1,
	})
	testutil.AssertError(t, err)
}

// Reference time vars to keep List call compiling.
var _ = time.Now
