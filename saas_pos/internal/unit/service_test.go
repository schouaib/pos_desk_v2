package unit

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

func TestUnit_Create(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	u, err := Create(tenantID, CreateInput{Name: "Kilogram"})
	testutil.AssertNoError(t, err)
	testutil.AssertNotEmpty(t, u.ID.Hex(), "unit ID")
	testutil.AssertEqual(t, u.Name, "Kilogram", "unit name")
}

func TestUnit_DuplicateName(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	_, err := Create(tenantID, CreateInput{Name: "Piece"})
	testutil.AssertNoError(t, err)

	_, err = Create(tenantID, CreateInput{Name: "Piece"})
	testutil.AssertError(t, err)
	testutil.AssertErrorContains(t, err, "already exists")
}

func TestUnit_UpdateAndDelete(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	u, err := Create(tenantID, CreateInput{Name: "Liter"})
	testutil.AssertNoError(t, err)

	updated, err := Update(tenantID, u.ID.Hex(), UpdateInput{Name: "Litre"})
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, updated.Name, "Litre", "updated unit name")

	err = Delete(tenantID, u.ID.Hex())
	testutil.AssertNoError(t, err)

	list, err := List(tenantID, "", 1, 500)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, list.Total, int64(0), "unit count after delete")
}
