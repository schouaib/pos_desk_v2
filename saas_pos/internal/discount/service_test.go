package discount

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

type discountDeps struct {
	TenantID  string
	ProductID string
	ProductOID primitive.ObjectID
}

func setupDiscountDeps(t *testing.T) discountDeps {
	t.Helper()
	tenantID := testutil.CreateTenant(t)

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Cat"})
	testutil.AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Brand"})
	testutil.AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	testutil.AssertNoError(t, err)

	p, err := product.Create(tenantID, product.CreateInput{
		Name:         "Discount Product",
		CategoryID:   cat.ID.Hex(),
		BrandID:      br.ID.Hex(),
		UnitID:       un.ID.Hex(),
		QtyAvailable: 100,
		PrixAchat:    100,
		PrixVente1:   200,
	})
	testutil.AssertNoError(t, err)

	return discountDeps{
		TenantID:   tenantID,
		ProductID:  p.ID.Hex(),
		ProductOID: p.ID,
	}
}

func TestDiscount_Create(t *testing.T) {
	testutil.CleanAll()
	d := setupDiscountDeps(t)

	r, err := Create(d.TenantID, CreateInput{
		ProductID: d.ProductID,
		Type:      "percentage",
		Value:     10,
		MinQty:    5,
	})
	testutil.AssertNoError(t, err)
	testutil.AssertNotEmpty(t, r.ID.Hex(), "discount rule ID")
	testutil.AssertEqual(t, r.Type, "percentage", "type")
	testutil.AssertFloatEqual(t, r.Value, 10, "value")
	testutil.AssertFloatEqual(t, r.MinQty, 5, "min_qty")
	testutil.AssertTrue(t, r.Active, "should be active")
}

func TestDiscount_SecondRule(t *testing.T) {
	testutil.CleanAll()
	d := setupDiscountDeps(t)

	_, err := Create(d.TenantID, CreateInput{
		ProductID: d.ProductID,
		Type:      "percentage",
		Value:     10,
		MinQty:    5,
	})
	testutil.AssertNoError(t, err)

	r2, err := Create(d.TenantID, CreateInput{
		ProductID: d.ProductID,
		Type:      "percentage",
		Value:     15,
		MinQty:    10,
	})
	testutil.AssertNoError(t, err)
	testutil.AssertFloatEqual(t, r2.Value, 15, "second rule value")
	testutil.AssertFloatEqual(t, r2.MinQty, 10, "second rule min_qty")

	// ListByProduct should return 2
	rules, err := ListByProduct(d.TenantID, d.ProductID)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, len(rules), 2, "should have 2 rules")
}

func TestDiscount_GetApplicable_Qty7(t *testing.T) {
	testutil.CleanAll()
	d := setupDiscountDeps(t)

	_, err := Create(d.TenantID, CreateInput{
		ProductID: d.ProductID,
		Type:      "percentage",
		Value:     10,
		MinQty:    5,
	})
	testutil.AssertNoError(t, err)

	_, err = Create(d.TenantID, CreateInput{
		ProductID: d.ProductID,
		Type:      "percentage",
		Value:     15,
		MinQty:    10,
	})
	testutil.AssertNoError(t, err)

	// qty=7 should match rule1 (min_qty=5), not rule2 (min_qty=10)
	rule := GetApplicable(d.TenantID, d.ProductOID, 7, time.Now())
	testutil.AssertTrue(t, rule != nil, "should find applicable rule for qty=7")
	testutil.AssertFloatEqual(t, rule.Value, 10, "should match rule with value=10")
	testutil.AssertFloatEqual(t, rule.MinQty, 5, "should match rule with min_qty=5")
}

func TestDiscount_GetApplicable_Qty12(t *testing.T) {
	testutil.CleanAll()
	d := setupDiscountDeps(t)

	_, err := Create(d.TenantID, CreateInput{
		ProductID: d.ProductID,
		Type:      "percentage",
		Value:     10,
		MinQty:    5,
	})
	testutil.AssertNoError(t, err)

	_, err = Create(d.TenantID, CreateInput{
		ProductID: d.ProductID,
		Type:      "percentage",
		Value:     15,
		MinQty:    10,
	})
	testutil.AssertNoError(t, err)

	// qty=12 should match rule2 (min_qty=10, highest matching)
	rule := GetApplicable(d.TenantID, d.ProductOID, 12, time.Now())
	testutil.AssertTrue(t, rule != nil, "should find applicable rule for qty=12")
	testutil.AssertFloatEqual(t, rule.Value, 15, "should match rule with value=15")
	testutil.AssertFloatEqual(t, rule.MinQty, 10, "should match rule with min_qty=10")
}

func TestDiscount_GetApplicable_Qty3(t *testing.T) {
	testutil.CleanAll()
	d := setupDiscountDeps(t)

	_, err := Create(d.TenantID, CreateInput{
		ProductID: d.ProductID,
		Type:      "percentage",
		Value:     10,
		MinQty:    5,
	})
	testutil.AssertNoError(t, err)

	// qty=3 is below min_qty=5, should return nil
	rule := GetApplicable(d.TenantID, d.ProductOID, 3, time.Now())
	testutil.AssertTrue(t, rule == nil, "should not find applicable rule for qty=3")
}

func TestDiscount_ExpiredRule(t *testing.T) {
	testutil.CleanAll()
	d := setupDiscountDeps(t)

	pastEnd := "2025-01-01"
	_, err := Create(d.TenantID, CreateInput{
		ProductID: d.ProductID,
		Type:      "percentage",
		Value:     10,
		MinQty:    1,
		EndDate:   &pastEnd,
	})
	testutil.AssertNoError(t, err)

	// Rule has ended, should return nil
	rule := GetApplicable(d.TenantID, d.ProductOID, 5, time.Now())
	testutil.AssertTrue(t, rule == nil, "expired rule should not be applicable")
}
