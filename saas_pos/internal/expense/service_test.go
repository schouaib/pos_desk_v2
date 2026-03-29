package expense

import (
	"math"
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

func TestExpense_Create(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	exp, err := Create(tenantID, CreateInput{
		Label:    "Rent",
		Amount:   3100,
		DateFrom: "2026-03-01",
		DateTo:   "2026-03-31",
	})
	testutil.AssertNoError(t, err)
	testutil.AssertNotEmpty(t, exp.ID.Hex(), "expense ID")
	testutil.AssertEqual(t, exp.Label, "Rent", "label")
	testutil.AssertFloatEqual(t, exp.Amount, 3100, "amount")
	testutil.AssertEqual(t, exp.Days, 31, "days")
	testutil.AssertFloatEqual(t, exp.DailyAmount, 100, "daily_amount")
}

func TestExpense_Update(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	exp, err := Create(tenantID, CreateInput{
		Label:    "Rent",
		Amount:   3100,
		DateFrom: "2026-03-01",
		DateTo:   "2026-03-31",
	})
	testutil.AssertNoError(t, err)

	updated, err := Update(tenantID, exp.ID.Hex(), UpdateInput{
		Label:    "Rent",
		Amount:   6200,
		DateFrom: "2026-03-01",
		DateTo:   "2026-03-31",
	})
	testutil.AssertNoError(t, err)
	testutil.AssertFloatEqual(t, updated.Amount, 6200, "updated amount")
	testutil.AssertFloatEqual(t, updated.DailyAmount, 200, "updated daily_amount")
}

func TestExpense_Delete(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	exp, err := Create(tenantID, CreateInput{
		Label:    "Office supplies",
		Amount:   500,
		DateFrom: "2026-03-01",
		DateTo:   "2026-03-31",
	})
	testutil.AssertNoError(t, err)

	err = Delete(tenantID, exp.ID.Hex())
	testutil.AssertNoError(t, err)

	// Verify gone — listing should return 0
	from, _ := time.Parse("2006-01-02", "2026-03-01")
	to, _ := time.Parse("2006-01-02", "2026-03-31")
	list, err := List(tenantID, "", from, to, 1, 10)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, list.Total, int64(0), "list should be empty after delete")
}

func TestExpense_List(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	_, err := Create(tenantID, CreateInput{
		Label:    "Rent",
		Amount:   3100,
		DateFrom: "2026-03-01",
		DateTo:   "2026-03-31",
	})
	testutil.AssertNoError(t, err)

	_, err = Create(tenantID, CreateInput{
		Label:    "Electricity",
		Amount:   800,
		DateFrom: "2026-03-01",
		DateTo:   "2026-03-31",
	})
	testutil.AssertNoError(t, err)

	from, _ := time.Parse("2006-01-02", "2026-03-01")
	to, _ := time.Parse("2006-01-02", "2026-03-31")
	list, err := List(tenantID, "", from, to, 1, 10)
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, list.Total, int64(2), "should list 2 expenses")
}

func TestExpense_SumFullOverlap(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	_, err := Create(tenantID, CreateInput{
		Label:    "Rent",
		Amount:   3100,
		DateFrom: "2026-03-01",
		DateTo:   "2026-03-31",
	})
	testutil.AssertNoError(t, err)

	from, _ := time.Parse("2006-01-02", "2026-03-01")
	to, _ := time.Parse("2006-01-02", "2026-03-31")
	sum, err := SumForPeriod(tenantID, from, to)
	testutil.AssertNoError(t, err)
	testutil.AssertFloatEqual(t, sum, 3100, "full overlap sum")
}

func TestExpense_SumPartialOverlap(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	_, err := Create(tenantID, CreateInput{
		Label:    "Rent",
		Amount:   3100,
		DateFrom: "2026-03-01",
		DateTo:   "2026-03-31",
	})
	testutil.AssertNoError(t, err)

	// Query Mar 10-20 => 11 days overlap out of 31
	from, _ := time.Parse("2006-01-02", "2026-03-10")
	to, _ := time.Parse("2006-01-02", "2026-03-20")
	sum, err := SumForPeriod(tenantID, from, to)
	testutil.AssertNoError(t, err)

	// dailyAmount = round(3100/31*100)/100 = 100.00
	// partial = 100.00 * 11 = 1100.00
	expected := math.Round((3100.0/31.0)*100) / 100 * 11
	expected = math.Round(expected*100) / 100
	testutil.AssertFloatEqual(t, sum, expected, "partial overlap sum")
}

func TestExpense_InvalidDates(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	_, err := Create(tenantID, CreateInput{
		Label:    "Bad dates",
		Amount:   1000,
		DateFrom: "2026-03-31",
		DateTo:   "2026-03-01",
	})
	testutil.AssertError(t, err)
}

func TestExpense_AmountZero(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	_, err := Create(tenantID, CreateInput{
		Label:    "Free",
		Amount:   0,
		DateFrom: "2026-03-01",
		DateTo:   "2026-03-31",
	})
	testutil.AssertError(t, err)
}
