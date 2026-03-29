package location

import (
	"os"
	"testing"

	"saas_pos/internal/testutil"
)

func TestMain(m *testing.M) {
	testutil.Setup()
	code := m.Run()
	testutil.Teardown()
	os.Exit(code)
}

func TestLocation_Create(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	loc, err := Create(tenantID, CreateInput{Name: "Warehouse A", Address: "123 Main St"})
	testutil.AssertNoError(t, err)
	testutil.AssertNotEmpty(t, loc.ID.Hex(), "location ID")
	testutil.AssertEqual(t, loc.Name, "Warehouse A", "name")
	testutil.AssertTrue(t, loc.IsDefault, "first location should be default")
	testutil.AssertTrue(t, loc.Active, "location should be active")
}

func TestLocation_Second(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	_, err := Create(tenantID, CreateInput{Name: "Warehouse A", Address: "123 Main St"})
	testutil.AssertNoError(t, err)

	loc2, err := Create(tenantID, CreateInput{Name: "Store B", Address: "456 Side St"})
	testutil.AssertNoError(t, err)
	testutil.AssertFalse(t, loc2.IsDefault, "second location should not be default")
}

func TestLocation_CannotDeleteDefault(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	loc, err := Create(tenantID, CreateInput{Name: "Warehouse A", Address: "123 Main St"})
	testutil.AssertNoError(t, err)

	err = Delete(tenantID, loc.ID.Hex())
	testutil.AssertError(t, err)
}

func TestLocation_DeleteNonDefault(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	_, err := Create(tenantID, CreateInput{Name: "Warehouse A", Address: "123 Main St"})
	testutil.AssertNoError(t, err)

	loc2, err := Create(tenantID, CreateInput{Name: "Store B", Address: "456 Side St"})
	testutil.AssertNoError(t, err)

	err = Delete(tenantID, loc2.ID.Hex())
	testutil.AssertNoError(t, err)

	// Verify only 1 location remains
	locs, err := List(tenantID)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, len(locs), 1, "should have 1 location after delete")
}
