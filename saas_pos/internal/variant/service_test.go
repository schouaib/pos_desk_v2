package variant

import (
	"os"
	"testing"

	"saas_pos/internal/brand"
	"saas_pos/internal/category"
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

// createParentProduct sets up a tenant with category/brand/unit and a parent product.
func createParentProduct(t *testing.T) (tenantID, productID string) {
	t.Helper()
	tenantID = testutil.CreateTenant(t)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "VCat"})
	testutil.AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "VBrand"})
	testutil.AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "VUnit"})
	testutil.AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name:       "Parent Product",
		CategoryID: cat.ID.Hex(),
		BrandID:    br.ID.Hex(),
		UnitID:     un.ID.Hex(),
		PrixVente1: 100,
	})
	testutil.AssertNoError(t, err)
	return tenantID, p.ID.Hex()
}

func TestVariant_Create(t *testing.T) {
	testutil.CleanAll()
	tenantID, productID := createParentProduct(t)

	v, err := Create(tenantID, productID, CreateInput{
		Attributes: map[string]string{"size": "L"},
		PrixVente1: 120,
	})
	testutil.AssertNoError(t, err)
	testutil.AssertNotEmpty(t, v.ID.Hex(), "variant ID")
	testutil.AssertEqual(t, v.Attributes["size"], "L", "variant size attribute")
	testutil.AssertTrue(t, v.IsActive, "variant should be active by default")
}

func TestVariant_MultipleVariants(t *testing.T) {
	testutil.CleanAll()
	tenantID, productID := createParentProduct(t)

	for _, size := range []string{"S", "M", "L"} {
		_, err := Create(tenantID, productID, CreateInput{
			Attributes: map[string]string{"size": size},
			PrixVente1: 100,
		})
		testutil.AssertNoError(t, err)
	}

	list, err := ListByProduct(tenantID, productID)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, len(list), 3, "variant count")
}

func TestVariant_IndependentPricing(t *testing.T) {
	testutil.CleanAll()
	tenantID, productID := createParentProduct(t)

	v1, err := Create(tenantID, productID, CreateInput{
		Attributes: map[string]string{"size": "S"},
		PrixVente1: 80,
	})
	testutil.AssertNoError(t, err)

	v2, err := Create(tenantID, productID, CreateInput{
		Attributes: map[string]string{"size": "XL"},
		PrixVente1: 150,
	})
	testutil.AssertNoError(t, err)

	testutil.AssertFloatEqual(t, v1.PrixVente1, 80, "variant S price")
	testutil.AssertFloatEqual(t, v2.PrixVente1, 150, "variant XL price")
}

func TestVariant_BarcodeUnique(t *testing.T) {
	testutil.CleanAll()
	tenantID, productID := createParentProduct(t)

	_, err := Create(tenantID, productID, CreateInput{
		Attributes: map[string]string{"size": "S"},
		Barcodes:   []string{"VARBC001"},
	})
	testutil.AssertNoError(t, err)

	_, err = Create(tenantID, productID, CreateInput{
		Attributes: map[string]string{"size": "M"},
		Barcodes:   []string{"VARBC001"},
	})
	testutil.AssertError(t, err)
	testutil.AssertErrorContains(t, err, "barcodes already exist")
}

func TestVariant_UpdatePricing(t *testing.T) {
	testutil.CleanAll()
	tenantID, productID := createParentProduct(t)

	v, err := Create(tenantID, productID, CreateInput{
		Attributes: map[string]string{"color": "Red"},
		PrixVente1: 100,
	})
	testutil.AssertNoError(t, err)

	updated, err := Update(tenantID, v.ID.Hex(), UpdateInput{
		Attributes: map[string]string{"color": "Red"},
		PrixVente1: 200,
		IsActive:   true,
	})
	testutil.AssertNoError(t, err)
	testutil.AssertFloatEqual(t, updated.PrixVente1, 200, "updated prix_vente_1")
}

func TestVariant_AdjustStock(t *testing.T) {
	testutil.CleanAll()
	tenantID, productID := createParentProduct(t)

	v, err := Create(tenantID, productID, CreateInput{
		Attributes:   map[string]string{"size": "M"},
		QtyAvailable: 0,
	})
	testutil.AssertNoError(t, err)

	err = AdjustStock(tenantID, v.ID.Hex(), 10)
	testutil.AssertNoError(t, err)

	testutil.AssertVariantStockEqual(t, v.ID.Hex(), 10, "variant stock after +10")
}

func TestVariant_ParentStockSync(t *testing.T) {
	testutil.CleanAll()
	tenantID, productID := createParentProduct(t)

	_, err := Create(tenantID, productID, CreateInput{
		Attributes:   map[string]string{"size": "S"},
		QtyAvailable: 5,
	})
	testutil.AssertNoError(t, err)

	_, err = Create(tenantID, productID, CreateInput{
		Attributes:   map[string]string{"size": "M"},
		QtyAvailable: 10,
	})
	testutil.AssertNoError(t, err)

	_, err = Create(tenantID, productID, CreateInput{
		Attributes:   map[string]string{"size": "L"},
		QtyAvailable: 15,
	})
	testutil.AssertNoError(t, err)

	// Parent stock should be sum: 5 + 10 + 15 = 30
	testutil.AssertStock(t, tenantID, productID, 30, "parent stock = sum of variants")
}

func TestVariant_Delete(t *testing.T) {
	testutil.CleanAll()
	tenantID, productID := createParentProduct(t)

	v1, err := Create(tenantID, productID, CreateInput{
		Attributes:   map[string]string{"size": "S"},
		QtyAvailable: 10,
	})
	testutil.AssertNoError(t, err)

	_, err = Create(tenantID, productID, CreateInput{
		Attributes:   map[string]string{"size": "M"},
		QtyAvailable: 20,
	})
	testutil.AssertNoError(t, err)

	// Parent stock should be 30
	testutil.AssertStock(t, tenantID, productID, 30, "parent stock before delete")

	// Delete variant S (qty=10)
	err = Delete(tenantID, v1.ID.Hex())
	testutil.AssertNoError(t, err)

	// Parent stock should now be 20
	testutil.AssertStock(t, tenantID, productID, 20, "parent stock after deleting S variant")
}

func TestVariant_FindByBarcode(t *testing.T) {
	testutil.CleanAll()
	tenantID, productID := createParentProduct(t)

	v, err := Create(tenantID, productID, CreateInput{
		Attributes: map[string]string{"size": "L"},
		Barcodes:   []string{"FINDME999"},
		PrixVente1: 100,
	})
	testutil.AssertNoError(t, err)

	found, err := FindByBarcode(tenantID, "FINDME999")
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, found.ID, v.ID, "found variant ID matches")
}

func TestVariant_Deactivate(t *testing.T) {
	testutil.CleanAll()
	tenantID, productID := createParentProduct(t)

	v, err := Create(tenantID, productID, CreateInput{
		Attributes: map[string]string{"size": "XS"},
		PrixVente1: 90,
	})
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, v.IsActive, "variant should start active")

	updated, err := Update(tenantID, v.ID.Hex(), UpdateInput{
		Attributes: map[string]string{"size": "XS"},
		PrixVente1: 90,
		IsActive:   false,
	})
	testutil.AssertNoError(t, err)
	testutil.AssertFalse(t, updated.IsActive, "variant should be deactivated")
}
