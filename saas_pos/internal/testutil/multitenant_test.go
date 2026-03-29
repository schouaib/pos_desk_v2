package testutil

import (
	"testing"
	"time"

	"saas_pos/internal/client"
	"saas_pos/internal/product"
	"saas_pos/internal/sale"
	"saas_pos/internal/supplier"
)

// ---------- Test 1: Product isolation ----------

func TestMultiTenant_ProductIsolation(t *testing.T) {
	Setup()
	CleanAll()

	tenantA := CreateTenant(t)
	tenantB := CreateTenant(t)

	// Create a product in tenant A
	_, err := product.Create(tenantA, product.CreateInput{
		Name:       "Tenant A Product",
		PrixAchat:  50,
		PrixVente1: 100,
	})
	AssertNoError(t, err)

	// List products for tenant B should return 0 items
	result, err := product.List(tenantB, "", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, result.Total, int64(0), "tenant B should have 0 products")
	AssertEqual(t, len(result.Items), 0, "tenant B product list should be empty")
}

// ---------- Test 2: Sale isolation ----------

func TestMultiTenant_SaleIsolation(t *testing.T) {
	Setup()
	CleanAll()

	tenantA := CreateTenant(t)
	tenantB := CreateTenant(t)
	userA, _ := CreateUser(t, tenantA, "admin")

	// Create product in tenant A and sell it
	p, err := product.Create(tenantA, product.CreateInput{
		Name:         "Tenant A Item",
		PrixAchat:    10,
		PrixVente1:   20,
		QtyAvailable: 50,
	})
	AssertNoError(t, err)

	_, err = sale.Create(tenantA, userA, "a@test.local", sale.CreateInput{
		Lines: []sale.SaleLineInput{
			{ProductID: p.ID.Hex(), Qty: 1, UnitPrice: 20},
		},
		PaymentMethod: "cash",
		AmountPaid:    20,
		SaleType:      "cash",
	})
	AssertNoError(t, err)

	// List sales for tenant B should return 0
	now := time.Now()
	from := now.Add(-24 * time.Hour)
	to := now.Add(24 * time.Hour)
	result, err := sale.List(tenantB, from, to, 1, 10, "")
	AssertNoError(t, err)
	AssertEqual(t, result.Total, int64(0), "tenant B should have 0 sales")
}

// ---------- Test 3: Client isolation ----------

func TestMultiTenant_ClientIsolation(t *testing.T) {
	Setup()
	CleanAll()

	tenantA := CreateTenant(t)
	tenantB := CreateTenant(t)

	// Create client in tenant A
	cl, err := client.Create(tenantA, client.ClientInput{
		Name:  "Client in A",
		Phone: "0555222222",
	})
	AssertNoError(t, err)

	// GetByID with tenant B should fail
	_, err = client.GetByID(tenantB, cl.ID.Hex())
	AssertError(t, err)
}

// ---------- Test 4: Supplier isolation ----------

func TestMultiTenant_SupplierIsolation(t *testing.T) {
	Setup()
	CleanAll()

	tenantA := CreateTenant(t)
	tenantB := CreateTenant(t)

	// Create supplier in tenant A
	_, err := supplier.Create(tenantA, supplier.CreateInput{
		Name:  "Supplier in A",
		Phone: "0555333333",
	})
	AssertNoError(t, err)

	// List suppliers for tenant B should return 0
	result, err := supplier.List(tenantB, "", 1, 10)
	AssertNoError(t, err)
	AssertEqual(t, result.Total, int64(0), "tenant B should have 0 suppliers")
	AssertEqual(t, len(result.Items), 0, "tenant B supplier list should be empty")
}
