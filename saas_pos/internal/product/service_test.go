package product

import (
	"context"
	"os"
	"testing"
	"time"

	"saas_pos/internal/brand"
	"saas_pos/internal/category"
	"saas_pos/internal/database"
	"saas_pos/internal/testutil"
	"saas_pos/internal/unit"

	"go.mongodb.org/mongo-driver/bson"
)

func TestMain(m *testing.M) {
	testutil.Setup()
	code := m.Run()
	testutil.Teardown()
	os.Exit(code)
}

// productDeps holds IDs for required category, brand, unit.
type productDeps struct {
	TenantID   string
	CategoryID string
	BrandID    string
	UnitID     string
}

func setupProductDeps(t *testing.T) productDeps {
	t.Helper()
	tenantID := testutil.CreateTenant(t)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Test Category"})
	testutil.AssertNoError(t, err)

	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Test Brand"})
	testutil.AssertNoError(t, err)

	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	testutil.AssertNoError(t, err)

	return productDeps{
		TenantID:   tenantID,
		CategoryID: cat.ID.Hex(),
		BrandID:    br.ID.Hex(),
		UnitID:     un.ID.Hex(),
	}
}

func baseInput(d productDeps) CreateInput {
	return CreateInput{
		Name:       "Test Product",
		CategoryID: d.CategoryID,
		BrandID:    d.BrandID,
		UnitID:     d.UnitID,
		PrixAchat:  100,
		PrixVente1: 150,
		PrixVente2: 140,
		PrixVente3: 130,
		VAT:        19,
	}
}

func TestProduct_Create(t *testing.T) {
	testutil.CleanAll()
	d := setupProductDeps(t)

	in := baseInput(d)
	in.QtyAvailable = 50
	p, err := Create(d.TenantID, in)
	testutil.AssertNoError(t, err)
	testutil.AssertNotEmpty(t, p.ID.Hex(), "product ID")
	testutil.AssertEqual(t, p.Name, "Test Product", "product name")
	testutil.AssertFloatEqual(t, p.QtyAvailable, 50, "qty_available")
	testutil.AssertEqual(t, p.VAT, 19, "VAT")
}

func TestProduct_AutoBarcode(t *testing.T) {
	testutil.CleanAll()
	d := setupProductDeps(t)

	in := baseInput(d)
	in.Barcodes = nil // no barcodes provided
	p, err := Create(d.TenantID, in)
	testutil.AssertNoError(t, err)
	// Barcodes should be an empty slice (no auto-generation in service)
	// The service sets nil barcodes to []string{}
	testutil.AssertTrue(t, p.Barcodes != nil, "barcodes should not be nil")
}

func TestProduct_ExplicitBarcodes(t *testing.T) {
	testutil.CleanAll()
	d := setupProductDeps(t)

	in := baseInput(d)
	in.Barcodes = []string{"1234567890"}
	p, err := Create(d.TenantID, in)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, len(p.Barcodes), 1, "barcode count")
	testutil.AssertEqual(t, p.Barcodes[0], "1234567890", "barcode value")
}

func TestProduct_Service(t *testing.T) {
	testutil.CleanAll()
	d := setupProductDeps(t)

	in := baseInput(d)
	in.IsService = true
	p, err := Create(d.TenantID, in)
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, p.IsService, "is_service should be true")
}

func TestProduct_Bundle(t *testing.T) {
	testutil.CleanAll()
	d := setupProductDeps(t)

	// Create two component products
	in1 := baseInput(d)
	in1.Name = "Component A"
	p1, err := Create(d.TenantID, in1)
	testutil.AssertNoError(t, err)

	in2 := baseInput(d)
	in2.Name = "Component B"
	p2, err := Create(d.TenantID, in2)
	testutil.AssertNoError(t, err)

	// Create bundle
	bundleIn := baseInput(d)
	bundleIn.Name = "Bundle Product"
	bundleIn.IsBundle = true
	bundleIn.BundleItems = []BundleItem{
		{ProductID: p1.ID, ProductName: "Component A", Qty: 2},
		{ProductID: p2.ID, ProductName: "Component B", Qty: 1},
	}
	bundle, err := Create(d.TenantID, bundleIn)
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, bundle.IsBundle, "is_bundle")
	testutil.AssertEqual(t, len(bundle.BundleItems), 2, "bundle items count")
}

func TestProduct_Weighable(t *testing.T) {
	testutil.CleanAll()
	d := setupProductDeps(t)

	in := baseInput(d)
	in.Name = "Weighable Item"
	in.IsWeighable = true
	in.LFCode = 1001
	in.WeightUnit = 4 // Kg
	in.Tare = 0.05
	in.ShelfLife = 30
	p, err := Create(d.TenantID, in)
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, p.IsWeighable, "is_weighable")
	testutil.AssertEqual(t, p.LFCode, 1001, "lfcode")
	testutil.AssertEqual(t, p.WeightUnit, 4, "weight_unit")
	testutil.AssertFloatEqual(t, p.Tare, 0.05, "tare")
	testutil.AssertEqual(t, p.ShelfLife, 30, "shelf_life")
}

func TestProduct_UpdateName(t *testing.T) {
	testutil.CleanAll()
	d := setupProductDeps(t)

	in := baseInput(d)
	p, err := Create(d.TenantID, in)
	testutil.AssertNoError(t, err)

	upd := UpdateInput{
		Name:       "Updated Name",
		CategoryID: d.CategoryID,
		BrandID:    d.BrandID,
		UnitID:     d.UnitID,
		PrixAchat:  in.PrixAchat,
		PrixVente1: in.PrixVente1,
		PrixVente2: in.PrixVente2,
		PrixVente3: in.PrixVente3,
		VAT:        in.VAT,
	}
	updated, err := Update(d.TenantID, p.ID.Hex(), upd)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, updated.Name, "Updated Name", "updated name")
}

func TestProduct_UpdatePrice(t *testing.T) {
	testutil.CleanAll()
	d := setupProductDeps(t)

	in := baseInput(d)
	in.PrixVente1 = 150
	p, err := Create(d.TenantID, in)
	testutil.AssertNoError(t, err)

	upd := UpdateInput{
		Name:       in.Name,
		CategoryID: d.CategoryID,
		BrandID:    d.BrandID,
		UnitID:     d.UnitID,
		PrixAchat:  in.PrixAchat,
		PrixVente1: 200,
		PrixVente2: in.PrixVente2,
		PrixVente3: in.PrixVente3,
		VAT:        in.VAT,
	}
	updated, err := Update(d.TenantID, p.ID.Hex(), upd)
	testutil.AssertNoError(t, err)
	testutil.AssertFloatEqual(t, updated.PrixVente1, 200, "updated prix_vente_1")

	// Verify price_history has a record
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	count, err := database.Col("price_history").CountDocuments(ctx, bson.M{
		"product_id": p.ID,
	})
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, count > 0, "price_history should have at least one record")
}

func TestProduct_Archive(t *testing.T) {
	testutil.CleanAll()
	d := setupProductDeps(t)

	in := baseInput(d)
	p, err := Create(d.TenantID, in)
	testutil.AssertNoError(t, err)

	err = Archive(d.TenantID, p.ID.Hex())
	testutil.AssertNoError(t, err)

	// Verify archived flag via GetByID
	got, err := GetByID(d.TenantID, p.ID.Hex())
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, got.Archived, "product should be archived")
}

func TestProduct_ListExcludesArchived(t *testing.T) {
	testutil.CleanAll()
	d := setupProductDeps(t)

	in := baseInput(d)
	p, err := Create(d.TenantID, in)
	testutil.AssertNoError(t, err)

	err = Archive(d.TenantID, p.ID.Hex())
	testutil.AssertNoError(t, err)

	list, err := List(d.TenantID, "", 1, 10)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, list.Total, int64(0), "active list should exclude archived")
}

func TestProduct_ListArchivedProducts(t *testing.T) {
	testutil.CleanAll()
	d := setupProductDeps(t)

	in := baseInput(d)
	p, err := Create(d.TenantID, in)
	testutil.AssertNoError(t, err)

	err = Archive(d.TenantID, p.ID.Hex())
	testutil.AssertNoError(t, err)

	archived, err := ListArchived(d.TenantID, "", 1, 10)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, archived.Total, int64(1), "archived list should have 1 product")
}

func TestProduct_Unarchive(t *testing.T) {
	testutil.CleanAll()
	d := setupProductDeps(t)

	in := baseInput(d)
	p, err := Create(d.TenantID, in)
	testutil.AssertNoError(t, err)

	err = Archive(d.TenantID, p.ID.Hex())
	testutil.AssertNoError(t, err)

	err = Unarchive(d.TenantID, p.ID.Hex())
	testutil.AssertNoError(t, err)

	list, err := List(d.TenantID, "", 1, 10)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, list.Total, int64(1), "product should be back in active list")
}

func TestProduct_VATClamp(t *testing.T) {
	testutil.CleanAll()
	d := setupProductDeps(t)

	in := baseInput(d)
	in.VAT = 200
	p, err := Create(d.TenantID, in)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, p.VAT, 100, "VAT should be clamped to 100")
}

func TestProduct_DuplicateBarcode(t *testing.T) {
	testutil.CleanAll()
	d := setupProductDeps(t)

	in1 := baseInput(d)
	in1.Name = "Product One"
	in1.Barcodes = []string{"DUPE123"}
	_, err := Create(d.TenantID, in1)
	testutil.AssertNoError(t, err)

	in2 := baseInput(d)
	in2.Name = "Product Two"
	in2.Barcodes = []string{"DUPE123"}
	_, err = Create(d.TenantID, in2)
	testutil.AssertError(t, err)
	testutil.AssertErrorContains(t, err, "barcodes already exist")
}

func TestProduct_NameRequired(t *testing.T) {
	testutil.CleanAll()
	d := setupProductDeps(t)

	in := baseInput(d)
	in.Name = ""
	_, err := Create(d.TenantID, in)
	testutil.AssertError(t, err)
	testutil.AssertErrorContains(t, err, "name is required")
}

func TestProduct_PlanLimit(t *testing.T) {
	testutil.CleanAll()

	// Create tenant with max 1 product
	tenantID := testutil.CreateTenantWithLimits(t, 1, 0, 0)

	// Create supporting entities under this limited tenant
	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	testutil.AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	testutil.AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Unit"})
	testutil.AssertNoError(t, err)

	in := CreateInput{
		Name:       "First Product",
		CategoryID: cat.ID.Hex(),
		BrandID:    br.ID.Hex(),
		UnitID:     un.ID.Hex(),
		PrixVente1: 100,
	}
	_, err = Create(tenantID, in)
	testutil.AssertNoError(t, err)

	in.Name = "Second Product"
	_, err = Create(tenantID, in)
	testutil.AssertError(t, err)
	testutil.AssertErrorContains(t, err, "product limit")
}

