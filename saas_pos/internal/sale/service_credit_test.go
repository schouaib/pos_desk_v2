package sale

import (
	"testing"
	"time"

	"saas_pos/internal/brand"
	"saas_pos/internal/caisse"
	"saas_pos/internal/category"
	"saas_pos/internal/client"
	"saas_pos/internal/discount"
	"saas_pos/internal/product"
	"saas_pos/internal/testutil"
	"saas_pos/internal/unit"
	"saas_pos/internal/variant"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// specialDeps holds IDs for credit/bundle/service/variant/discount tests.
type specialDeps struct {
	TenantID     string
	UserID       string
	UserEmail    string
	CaisseID     string
	ClientID     string
	RegularID    string // regular product (A), qty=100, prix_achat=100, prix_vente1=150, VAT=19
	ServiceID    string // is_service=true product
	ComponentAID string // bundle component A, qty=100
	ComponentBID string // bundle component B, qty=100
	BundleID     string // bundle with A*2 + B*1
	VariantProdID string // product with variants
	VariantMID    string // variant "M" with qty=50
}

func setupSpecialDeps(t *testing.T) specialDeps {
	t.Helper()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")
	userEmail := "cashier@test.local"

	cat, err := category.Create(tenantID, category.CreateInput{Name: "Test Category"})
	testutil.AssertNoError(t, err)
	br, err := brand.Create(tenantID, brand.CreateInput{Name: "Test Brand"})
	testutil.AssertNoError(t, err)
	un, err := unit.Create(tenantID, unit.CreateInput{Name: "Piece"})
	testutil.AssertNoError(t, err)

	catID := cat.ID.Hex()
	brID := br.ID.Hex()
	unID := un.ID.Hex()

	// Regular product
	regular, err := product.Create(tenantID, product.CreateInput{
		Name: "Regular A", CategoryID: catID, BrandID: brID, UnitID: unID,
		QtyAvailable: 100, PrixAchat: 100, PrixVente1: 150, VAT: 19,
	})
	testutil.AssertNoError(t, err)

	// Service product
	svc, err := product.Create(tenantID, product.CreateInput{
		Name: "Service Prod", CategoryID: catID, BrandID: brID, UnitID: unID,
		QtyAvailable: 10, PrixAchat: 0, PrixVente1: 200, VAT: 19, IsService: true,
	})
	testutil.AssertNoError(t, err)

	// Bundle components
	compA, err := product.Create(tenantID, product.CreateInput{
		Name: "Component A", CategoryID: catID, BrandID: brID, UnitID: unID,
		QtyAvailable: 100, PrixAchat: 30, PrixVente1: 50, VAT: 19,
	})
	testutil.AssertNoError(t, err)

	compB, err := product.Create(tenantID, product.CreateInput{
		Name: "Component B", CategoryID: catID, BrandID: brID, UnitID: unID,
		QtyAvailable: 100, PrixAchat: 20, PrixVente1: 40, VAT: 19,
	})
	testutil.AssertNoError(t, err)

	// Bundle product (A*2, B*1)
	bundle, err := product.Create(tenantID, product.CreateInput{
		Name: "Bundle AB", CategoryID: catID, BrandID: brID, UnitID: unID,
		QtyAvailable: 0, PrixAchat: 80, PrixVente1: 130, VAT: 19,
		IsBundle: true,
		BundleItems: []product.BundleItem{
			{ProductID: compA.ID, ProductName: "Component A", Qty: 2},
			{ProductID: compB.ID, ProductName: "Component B", Qty: 1},
		},
	})
	testutil.AssertNoError(t, err)

	// Product with variants
	varProd, err := product.Create(tenantID, product.CreateInput{
		Name: "Variant Product", CategoryID: catID, BrandID: brID, UnitID: unID,
		QtyAvailable: 0, PrixAchat: 100, PrixVente1: 150, VAT: 19,
	})
	testutil.AssertNoError(t, err)

	// Create variant M
	varM, err := variant.Create(tenantID, varProd.ID.Hex(), variant.CreateInput{
		Attributes:   map[string]string{"size": "M"},
		QtyAvailable: 50,
		PrixAchat:    100,
		PrixVente1:   150,
	})
	testutil.AssertNoError(t, err)

	// Create client
	cl, err := client.Create(tenantID, client.ClientInput{Name: "Test Client"})
	testutil.AssertNoError(t, err)

	// Open caisse
	sess, err := caisse.Open(tenantID, userID, userEmail, caisse.OpenInput{OpeningAmount: 10000})
	testutil.AssertNoError(t, err)

	return specialDeps{
		TenantID:      tenantID,
		UserID:        userID,
		UserEmail:     userEmail,
		CaisseID:      sess.ID.Hex(),
		ClientID:      cl.ID.Hex(),
		RegularID:     regular.ID.Hex(),
		ServiceID:     svc.ID.Hex(),
		ComponentAID:  compA.ID.Hex(),
		ComponentBID:  compB.ID.Hex(),
		BundleID:      bundle.ID.Hex(),
		VariantProdID: varProd.ID.Hex(),
		VariantMID:    varM.ID.Hex(),
	}
}

func TestSaleSpecialCases(t *testing.T) {
	testutil.CleanAll()
	d := setupSpecialDeps(t)

	// ---------- Credit sale ----------

	var creditSale *Sale

	t.Run("credit_sale", func(t *testing.T) {
		s, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			Lines: []SaleLineInput{
				{ProductID: d.RegularID, Qty: 2, UnitPrice: 150},
			},
			PaymentMethod: "cash",
			AmountPaid:    0,
			SaleType:      "credit",
			ClientID:      d.ClientID,
			CaisseID:      d.CaisseID,
		})
		testutil.AssertNoError(t, err)
		testutil.AssertEqual(t, s.SaleType, "credit", "sale_type")
		creditSale = s
	})

	t.Run("client_balance_increased", func(t *testing.T) {
		bal := testutil.GetClientBalance(t, d.TenantID, d.ClientID)
		testutil.AssertFloatEqual(t, bal, creditSale.Total, "client balance = sale total TTC")
	})

	t.Run("credit_no_client_error", func(t *testing.T) {
		_, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			Lines: []SaleLineInput{
				{ProductID: d.RegularID, Qty: 1, UnitPrice: 150},
			},
			PaymentMethod: "cash",
			AmountPaid:    0,
			SaleType:      "credit",
			ClientID:      "",
			CaisseID:      d.CaisseID,
		})
		testutil.AssertError(t, err)
	})

	// ---------- Service product ----------

	t.Run("sell_service", func(t *testing.T) {
		stockBefore := testutil.GetProductStock(t, d.TenantID, d.ServiceID)
		_, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			Lines: []SaleLineInput{
				{ProductID: d.ServiceID, Qty: 2, UnitPrice: 200},
			},
			PaymentMethod: "cash",
			AmountPaid:    500,
			CaisseID:      d.CaisseID,
		})
		testutil.AssertNoError(t, err)
		stockAfter := testutil.GetProductStock(t, d.TenantID, d.ServiceID)
		testutil.AssertFloatEqual(t, stockAfter, stockBefore, "service stock unchanged")
	})

	// ---------- Bundle product ----------

	t.Run("sell_bundle", func(t *testing.T) {
		compABefore := testutil.GetProductStock(t, d.TenantID, d.ComponentAID)
		compBBefore := testutil.GetProductStock(t, d.TenantID, d.ComponentBID)

		_, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			Lines: []SaleLineInput{
				{ProductID: d.BundleID, Qty: 3, UnitPrice: 130},
			},
			PaymentMethod: "cash",
			AmountPaid:    500,
			CaisseID:      d.CaisseID,
		})
		testutil.AssertNoError(t, err)

		// Component A: qty -= 3 * 2 = 6
		testutil.AssertStock(t, d.TenantID, d.ComponentAID, compABefore-6, "compA stock after bundle sale")
		// Component B: qty -= 3 * 1 = 3
		testutil.AssertStock(t, d.TenantID, d.ComponentBID, compBBefore-3, "compB stock after bundle sale")
	})

	// ---------- Variant ----------

	t.Run("sell_variant", func(t *testing.T) {
		varStockBefore := testutil.GetVariantStock(t, d.VariantMID)

		_, err := Create(d.TenantID, d.UserID, d.UserEmail, CreateInput{
			Lines: []SaleLineInput{
				{ProductID: d.VariantProdID, VariantID: d.VariantMID, Qty: 2, UnitPrice: 150},
			},
			PaymentMethod: "cash",
			AmountPaid:    400,
			CaisseID:      d.CaisseID,
		})
		testutil.AssertNoError(t, err)

		varStockAfter := testutil.GetVariantStock(t, d.VariantMID)
		testutil.AssertFloatEqual(t, varStockAfter, varStockBefore-2, "variant M stock decreased by 2")
	})

	// ---------- Discount tests (via discount.GetApplicable) ----------
	// Discounts are applied at the frontend level; the backend provides GetApplicable
	// to determine which rule applies. We test that function directly.

	var discountProductID string

	t.Run("discount_auto_apply", func(t *testing.T) {
		// Use the regular product for discount tests
		discountProductID = d.RegularID
		pid, _ := primitive.ObjectIDFromHex(discountProductID)

		// Create a discount rule: min_qty=5, percentage, value=10
		_, err := discount.Create(d.TenantID, discount.CreateInput{
			ProductID: discountProductID,
			Type:      "percentage",
			Value:     10,
			MinQty:    5,
		})
		testutil.AssertNoError(t, err)

		rule := discount.GetApplicable(d.TenantID, pid, 6, time.Now())
		testutil.AssertTrue(t, rule != nil, "discount rule should be applicable for qty=6")
		testutil.AssertFloatEqual(t, rule.Value, 10, "discount value = 10")
		testutil.AssertEqual(t, rule.Type, "percentage", "discount type")
	})

	t.Run("discount_not_met", func(t *testing.T) {
		pid, _ := primitive.ObjectIDFromHex(discountProductID)
		rule := discount.GetApplicable(d.TenantID, pid, 3, time.Now())
		testutil.AssertTrue(t, rule == nil, "no discount for qty=3 (min_qty=5)")
	})

	t.Run("discount_expired", func(t *testing.T) {
		// Create a product for this specific test to avoid rule conflicts
		cat, _ := category.Create(d.TenantID, category.CreateInput{Name: "Disc Cat"})
		br, _ := brand.Create(d.TenantID, brand.CreateInput{Name: "Disc Brand"})
		un, _ := unit.Create(d.TenantID, unit.CreateInput{Name: "Disc Unit"})
		expProd, err := product.Create(d.TenantID, product.CreateInput{
			Name: "Expired Disc Prod", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(), UnitID: un.ID.Hex(),
			QtyAvailable: 100, PrixAchat: 100, PrixVente1: 150, VAT: 19,
		})
		testutil.AssertNoError(t, err)

		pastStart := "2024-01-01"
		pastEnd := "2024-06-01"
		_, err = discount.Create(d.TenantID, discount.CreateInput{
			ProductID: expProd.ID.Hex(),
			Type:      "percentage",
			Value:     15,
			MinQty:    1,
			StartDate: &pastStart,
			EndDate:   &pastEnd,
		})
		testutil.AssertNoError(t, err)

		rule := discount.GetApplicable(d.TenantID, expProd.ID, 6, time.Now())
		testutil.AssertTrue(t, rule == nil, "expired discount should not apply")
	})

	t.Run("discount_active_date", func(t *testing.T) {
		cat, _ := category.Create(d.TenantID, category.CreateInput{Name: "Active Disc Cat"})
		br, _ := brand.Create(d.TenantID, brand.CreateInput{Name: "Active Disc Brand"})
		un, _ := unit.Create(d.TenantID, unit.CreateInput{Name: "Active Disc Unit"})
		actProd, err := product.Create(d.TenantID, product.CreateInput{
			Name: "Active Disc Prod", CategoryID: cat.ID.Hex(), BrandID: br.ID.Hex(), UnitID: un.ID.Hex(),
			QtyAvailable: 100, PrixAchat: 100, PrixVente1: 150, VAT: 19,
		})
		testutil.AssertNoError(t, err)

		pastStart := "2024-01-01"
		futureEnd := "2099-12-31"
		_, err = discount.Create(d.TenantID, discount.CreateInput{
			ProductID: actProd.ID.Hex(),
			Type:      "fixed",
			Value:     20,
			MinQty:    1,
			StartDate: &pastStart,
			EndDate:   &futureEnd,
		})
		testutil.AssertNoError(t, err)

		rule := discount.GetApplicable(d.TenantID, actProd.ID, 5, time.Now())
		testutil.AssertTrue(t, rule != nil, "active discount should apply")
		testutil.AssertFloatEqual(t, rule.Value, 20, "active discount value = 20")
		testutil.AssertEqual(t, rule.Type, "fixed", "active discount type = fixed")
	})
}
