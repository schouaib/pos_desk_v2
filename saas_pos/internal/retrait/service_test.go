package retrait

import (
	"os"
	"testing"
	"time"

	"saas_pos/internal/testutil"
)

func TestMain(m *testing.M) {
	testutil.Setup()
	code := m.Run()
	testutil.Teardown()
	os.Exit(code)
}

func TestRetrait_Create(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")

	r, err := Create(tenantID, userID, "user@test.local", CreateInput{
		Amount: 500,
		Reason: "petty cash",
	})
	testutil.AssertNoError(t, err)
	testutil.AssertNotEmpty(t, r.ID.Hex(), "retrait ID")
	testutil.AssertFloatEqual(t, r.Amount, 500, "amount")
	testutil.AssertEqual(t, r.Reason, "petty cash", "reason")
}

func TestRetrait_AmountValidation(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")

	_, err := Create(tenantID, userID, "user@test.local", CreateInput{
		Amount: 0,
		Reason: "zero amount",
	})
	testutil.AssertError(t, err)

	_, err = Create(tenantID, userID, "user@test.local", CreateInput{
		Amount: -10,
		Reason: "negative amount",
	})
	testutil.AssertError(t, err)
}

func TestRetrait_List(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")

	_, err := Create(tenantID, userID, "user@test.local", CreateInput{Amount: 500, Reason: "r1"})
	testutil.AssertNoError(t, err)

	_, err = Create(tenantID, userID, "user@test.local", CreateInput{Amount: 300, Reason: "r2"})
	testutil.AssertNoError(t, err)

	from := time.Now().Add(-1 * time.Hour)
	to := time.Now().Add(1 * time.Hour)
	list, err := List(tenantID, from, to, 1, 10)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, list.Total, int64(2), "should list 2 retraits")
}

func TestRetrait_Sum(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")

	_, err := Create(tenantID, userID, "user@test.local", CreateInput{Amount: 500, Reason: "r1"})
	testutil.AssertNoError(t, err)

	_, err = Create(tenantID, userID, "user@test.local", CreateInput{Amount: 300, Reason: "r2"})
	testutil.AssertNoError(t, err)

	from := time.Now().Add(-1 * time.Hour)
	to := time.Now().Add(1 * time.Hour)
	sum, err := SumForPeriod(tenantID, from, to)
	testutil.AssertNoError(t, err)
	testutil.AssertFloatEqual(t, sum, 800, "sum of retraits")
}

func TestRetrait_Delete(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")

	r, err := Create(tenantID, userID, "user@test.local", CreateInput{Amount: 500, Reason: "to delete"})
	testutil.AssertNoError(t, err)

	err = Delete(tenantID, r.ID.Hex())
	testutil.AssertNoError(t, err)

	// Verify removed
	from := time.Now().Add(-1 * time.Hour)
	to := time.Now().Add(1 * time.Hour)
	list, err := List(tenantID, from, to, 1, 10)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, list.Total, int64(0), "list should be empty after delete")
}
