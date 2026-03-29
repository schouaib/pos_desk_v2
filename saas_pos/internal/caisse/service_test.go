package caisse

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

func TestCaisse_Open(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")

	sess, err := Open(tenantID, userID, "user@test.local", OpenInput{
		OpeningAmount: 5000,
		Notes:         "morning open",
	})
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, sess.Status, "open", "status")
	testutil.AssertFloatEqual(t, sess.OpeningAmount, 5000, "opening_amount")
	testutil.AssertNotEmpty(t, sess.ID.Hex(), "session ID")
}

func TestCaisse_RejectDoubleOpen(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")

	_, err := Open(tenantID, userID, "user@test.local", OpenInput{OpeningAmount: 5000})
	testutil.AssertNoError(t, err)

	_, err = Open(tenantID, userID, "user@test.local", OpenInput{OpeningAmount: 3000})
	testutil.AssertError(t, err)
}

func TestCaisse_GetCurrent(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")

	_, err := Open(tenantID, userID, "user@test.local", OpenInput{OpeningAmount: 5000})
	testutil.AssertNoError(t, err)

	sess, err := GetCurrent(tenantID, userID)
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, sess != nil, "current session should not be nil")
	testutil.AssertEqual(t, sess.Status, "open", "status")
	testutil.AssertFloatEqual(t, sess.OpeningAmount, 5000, "opening_amount")
}

func TestCaisse_Close(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")

	_, err := Open(tenantID, userID, "user@test.local", OpenInput{OpeningAmount: 5000})
	testutil.AssertNoError(t, err)

	sess, err := Close(tenantID, userID, CloseInput{
		ClosingAmount: 8000,
		Notes:         "end of day",
	})
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, sess.Status, "closed", "status")
	testutil.AssertTrue(t, sess.ClosingAmount != nil, "closing_amount should be set")
	testutil.AssertFloatEqual(t, *sess.ClosingAmount, 8000, "closing_amount")
}

func TestCaisse_GetCurrentAfterClose(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")

	_, err := Open(tenantID, userID, "user@test.local", OpenInput{OpeningAmount: 5000})
	testutil.AssertNoError(t, err)

	_, err = Close(tenantID, userID, CloseInput{ClosingAmount: 8000})
	testutil.AssertNoError(t, err)

	sess, err := GetCurrent(tenantID, userID)
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, sess == nil, "no open session after close")
}

func TestCaisse_History(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")

	_, err := Open(tenantID, userID, "user@test.local", OpenInput{OpeningAmount: 5000})
	testutil.AssertNoError(t, err)

	_, err = Close(tenantID, userID, CloseInput{ClosingAmount: 8000})
	testutil.AssertNoError(t, err)

	items, total, err := ListHistory(tenantID, 1, 10)
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, total >= 1, "history total >= 1")
	testutil.AssertTrue(t, len(items) >= 1, "history items >= 1")
	testutil.AssertEqual(t, items[0].Status, "closed", "first history item status")
}

func TestCaisse_SumAmounts(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")

	_, err := Open(tenantID, userID, "user@test.local", OpenInput{OpeningAmount: 5000})
	testutil.AssertNoError(t, err)

	_, err = Close(tenantID, userID, CloseInput{ClosingAmount: 8000})
	testutil.AssertNoError(t, err)

	from := time.Now().Add(-1 * time.Hour)
	to := time.Now().Add(1 * time.Hour)

	totals, err := SumAmounts(tenantID, from, to)
	testutil.AssertNoError(t, err)
	testutil.AssertFloatEqual(t, totals.Opening, 5000, "sum opening")
	testutil.AssertFloatEqual(t, totals.Closing, 8000, "sum closing")
}

func TestCaisse_OpenNewAfterClose(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)
	userID, _ := testutil.CreateUser(t, tenantID, "admin")

	_, err := Open(tenantID, userID, "user@test.local", OpenInput{OpeningAmount: 5000})
	testutil.AssertNoError(t, err)

	_, err = Close(tenantID, userID, CloseInput{ClosingAmount: 8000})
	testutil.AssertNoError(t, err)

	sess, err := Open(tenantID, userID, "user@test.local", OpenInput{
		OpeningAmount: 3000,
		Notes:         "second shift",
	})
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, sess.Status, "open", "new session status")
	testutil.AssertFloatEqual(t, sess.OpeningAmount, 3000, "new opening_amount")
}
