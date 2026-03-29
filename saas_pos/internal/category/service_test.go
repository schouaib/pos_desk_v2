package category

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

func TestCategory_Create(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	cat, err := Create(tenantID, CreateInput{Name: "Electronics"})
	testutil.AssertNoError(t, err)
	testutil.AssertNotEmpty(t, cat.ID.Hex(), "category ID")
	testutil.AssertEqual(t, cat.Name, "Electronics", "category name")
}

func TestCategory_DuplicateName(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	_, err := Create(tenantID, CreateInput{Name: "Food"})
	testutil.AssertNoError(t, err)

	_, err = Create(tenantID, CreateInput{Name: "Food"})
	testutil.AssertError(t, err)
	testutil.AssertErrorContains(t, err, "already exists")
}

func TestCategory_UpdateAndDelete(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	cat, err := Create(tenantID, CreateInput{Name: "Beverages"})
	testutil.AssertNoError(t, err)

	updated, err := Update(tenantID, cat.ID.Hex(), UpdateInput{Name: "Drinks"})
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, updated.Name, "Drinks", "updated category name")

	err = Delete(tenantID, cat.ID.Hex())
	testutil.AssertNoError(t, err)

	// Verify deleted — list should be empty
	list, err := List(tenantID, "", 1, 500)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, list.Total, int64(0), "category count after delete")
}
