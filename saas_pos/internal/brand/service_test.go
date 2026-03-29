package brand

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

func TestBrand_Create(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	b, err := Create(tenantID, CreateInput{Name: "Samsung"})
	testutil.AssertNoError(t, err)
	testutil.AssertNotEmpty(t, b.ID.Hex(), "brand ID")
	testutil.AssertEqual(t, b.Name, "Samsung", "brand name")
}

func TestBrand_DuplicateName(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	_, err := Create(tenantID, CreateInput{Name: "Apple"})
	testutil.AssertNoError(t, err)

	_, err = Create(tenantID, CreateInput{Name: "Apple"})
	testutil.AssertError(t, err)
	testutil.AssertErrorContains(t, err, "already exists")
}

func TestBrand_UpdateAndDelete(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	b, err := Create(tenantID, CreateInput{Name: "Sony"})
	testutil.AssertNoError(t, err)

	updated, err := Update(tenantID, b.ID.Hex(), UpdateInput{Name: "Sony Corp"})
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, updated.Name, "Sony Corp", "updated brand name")

	err = Delete(tenantID, b.ID.Hex())
	testutil.AssertNoError(t, err)

	list, err := List(tenantID, "", 1, 500)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, list.Total, int64(0), "brand count after delete")
}
