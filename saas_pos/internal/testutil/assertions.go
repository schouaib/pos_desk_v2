package testutil

import (
	"math"
	"testing"
)

// AssertNoError fails the test if err is not nil.
func AssertNoError(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// AssertError fails the test if err is nil.
func AssertError(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("expected an error but got nil")
	}
}

// AssertErrorContains fails the test if err is nil or does not contain substr.
func AssertErrorContains(t *testing.T, err error, substr string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error containing %q but got nil", substr)
	}
	if !contains(err.Error(), substr) {
		t.Fatalf("expected error containing %q, got: %v", substr, err)
	}
}

// AssertEqual fails if got != want.
func AssertEqual[T comparable](t *testing.T, got, want T, msg string) {
	t.Helper()
	if got != want {
		t.Fatalf("%s: got %v, want %v", msg, got, want)
	}
}

// AssertFloatEqual compares two floats with tolerance for rounding.
func AssertFloatEqual(t *testing.T, got, want float64, msg string) {
	t.Helper()
	if math.Abs(got-want) > 0.011 {
		t.Fatalf("%s: got %.2f, want %.2f", msg, got, want)
	}
}

// AssertTrue fails if v is false.
func AssertTrue(t *testing.T, v bool, msg string) {
	t.Helper()
	if !v {
		t.Fatalf("expected true: %s", msg)
	}
}

// AssertFalse fails if v is true.
func AssertFalse(t *testing.T, v bool, msg string) {
	t.Helper()
	if v {
		t.Fatalf("expected false: %s", msg)
	}
}

// AssertNotEmpty fails if s is the zero value.
func AssertNotEmpty(t *testing.T, s string, msg string) {
	t.Helper()
	if s == "" {
		t.Fatalf("expected non-empty string: %s", msg)
	}
}

// AssertNil fails if v is not nil.
func AssertNil(t *testing.T, v interface{}, msg string) {
	t.Helper()
	if v != nil {
		t.Fatalf("expected nil: %s, got %v", msg, v)
	}
}

// AssertStock is a convenience that reads product stock and asserts it equals want.
func AssertStock(t *testing.T, tenantID, productID string, want float64, msg string) {
	t.Helper()
	got := GetProductStock(t, tenantID, productID)
	AssertFloatEqual(t, got, want, msg)
}

// AssertVariantStockEqual reads variant stock and asserts it equals want.
func AssertVariantStockEqual(t *testing.T, variantID string, want float64, msg string) {
	t.Helper()
	got := GetVariantStock(t, variantID)
	AssertFloatEqual(t, got, want, msg)
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && searchString(s, sub)
}

func searchString(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
