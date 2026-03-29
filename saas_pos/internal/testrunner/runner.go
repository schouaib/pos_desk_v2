package testrunner

import (
	"bufio"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// TestResult holds a single test outcome.
type TestResult struct {
	Suite    string  `json:"suite"`
	Name     string  `json:"name"`
	Status   string  `json:"status"` // "pass" | "fail" | "skip"
	Duration float64 `json:"duration_ms"`
	Output   string  `json:"output,omitempty"`
}

// SuiteResult groups tests by package/suite.
type SuiteResult struct {
	Name     string       `json:"name"`
	Status   string       `json:"status"` // "pass" | "fail"
	Tests    []TestResult `json:"tests"`
	Duration float64      `json:"duration_ms"`
}

// RunResult is the top-level response.
type RunResult struct {
	Total    int           `json:"total"`
	Passed   int           `json:"passed"`
	Failed   int           `json:"failed"`
	Skipped  int           `json:"skipped"`
	Duration float64       `json:"duration_ms"`
	Suites   []SuiteResult `json:"suites"`
}

// goTestEvent matches the JSON emitted by `go test -json`.
type goTestEvent struct {
	Time    time.Time `json:"Time"`
	Action  string    `json:"Action"`  // run, pass, fail, skip, output, pause, cont
	Package string    `json:"Package"`
	Test    string    `json:"Test"`
	Output  string    `json:"Output"`
	Elapsed float64   `json:"Elapsed"` // seconds
}

// suiteNameMap translates Go package paths to human-readable suite names.
var suiteNameMap = map[string]string{
	"saas_pos/internal/category":         "A. Categories",
	"saas_pos/internal/brand":            "A. Brands",
	"saas_pos/internal/unit":             "A. Units",
	"saas_pos/internal/product":          "B. Products",
	"saas_pos/internal/variant":          "C. Variants",
	"saas_pos/internal/supplier":         "D. Suppliers",
	"saas_pos/internal/supplier_product": "D. Supplier-Product Links",
	"saas_pos/internal/purchase":         "E. Purchases",
	"saas_pos/internal/batch":            "F. Batches / FIFO",
	"saas_pos/internal/caisse":           "G/U. Caisse",
	"saas_pos/internal/sale":             "H/I/V. Sales",
	"saas_pos/internal/sale_return":      "J. Sale Returns",
	"saas_pos/internal/client":           "K. Clients",
	"saas_pos/internal/facturation":      "L. Facturation",
	"saas_pos/internal/expense":          "M. Expenses",
	"saas_pos/internal/retrait":          "N. Retraits",
	"saas_pos/internal/loss":             "O. Losses",
	"saas_pos/internal/adjustment":       "P. Adjustments",
	"saas_pos/internal/location":         "Q. Locations",
	"saas_pos/internal/transfer":         "Q. Transfers",
	"saas_pos/internal/discount":         "R. Discounts",
	"saas_pos/internal/user":             "T. Users",
	"saas_pos/internal/testutil":         "W/X/Y. E2E & Edge Cases",
}

func suiteName(pkg string) string {
	if n, ok := suiteNameMap[pkg]; ok {
		return n
	}
	// Fallback: last path segment
	parts := strings.Split(pkg, "/")
	return parts[len(parts)-1]
}

// projectRoot returns the absolute path to the Go module root (saas_pos/).
// It first tries runtime.Caller (works in dev), then falls back to scanning
// the working directory and its parents for go.mod.
func projectRoot() string {
	// Try runtime.Caller first (works when running from source)
	_, file, _, ok := runtime.Caller(0)
	if ok && file != "" {
		candidate := filepath.Join(filepath.Dir(file), "..", "..")
		if _, err := os.Stat(filepath.Join(candidate, "go.mod")); err == nil {
			return candidate
		}
	}

	// Fallback: walk up from current working directory looking for go.mod
	dir, _ := os.Getwd()
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		// Check saas_pos subdirectory
		sub := filepath.Join(dir, "saas_pos")
		if _, err := os.Stat(filepath.Join(sub, "go.mod")); err == nil {
			return sub
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	// Last resort
	return "."
}

// Run executes `go test -json` against all internal packages and parses results.
// suiteFilter is an optional -run regex to filter tests.
func Run(suiteFilter string) (*RunResult, error) {
	start := time.Now()

	args := []string{"test", "-json", "-count=1", "-p", "1", "-timeout=180s", "./internal/..."}
	if suiteFilter != "" {
		args = append(args, "-run", suiteFilter)
	}

	cmd := exec.Command("go", args...)
	cmd.Dir = projectRoot()
	cmd.Env = append(cmd.Environ(),
		"MONGO_DB=pos_test",
	)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	// Collect events
	type testKey struct{ pkg, test string }
	outputs := map[testKey]string{}
	results := map[testKey]*TestResult{}
	suiteStatus := map[string]string{}
	suiteDuration := map[string]float64{}

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)

	for scanner.Scan() {
		var ev goTestEvent
		if err := json.Unmarshal(scanner.Bytes(), &ev); err != nil {
			continue
		}

		if ev.Test == "" {
			// Package-level event
			switch ev.Action {
			case "pass", "fail":
				suiteStatus[ev.Package] = ev.Action
				suiteDuration[ev.Package] = ev.Elapsed * 1000
			}
			continue
		}

		key := testKey{ev.Package, ev.Test}

		switch ev.Action {
		case "output":
			outputs[key] += ev.Output
		case "pass", "fail", "skip":
			results[key] = &TestResult{
				Suite:    suiteName(ev.Package),
				Name:     ev.Test,
				Status:   ev.Action,
				Duration: ev.Elapsed * 1000,
			}
			if ev.Action == "fail" {
				results[key].Output = outputs[key]
			}
		}
	}

	// Wait for process to finish (ignore exit code — failures are in results)
	_ = cmd.Wait()

	// Group by suite
	suiteMap := map[string]*SuiteResult{}
	var suiteOrder []string

	for key, tr := range results {
		sn := suiteName(key.pkg)
		if _, exists := suiteMap[sn]; !exists {
			suiteMap[sn] = &SuiteResult{
				Name:     sn,
				Status:   suiteStatus[key.pkg],
				Duration: suiteDuration[key.pkg],
			}
			suiteOrder = append(suiteOrder, sn)
		}
		suiteMap[sn].Tests = append(suiteMap[sn].Tests, *tr)
	}

	// Build final result
	result := &RunResult{
		Duration: float64(time.Since(start).Milliseconds()),
	}

	for _, name := range suiteOrder {
		s := suiteMap[name]
		if s.Status == "" {
			s.Status = "pass"
			for _, t := range s.Tests {
				if t.Status == "fail" {
					s.Status = "fail"
					break
				}
			}
		}
		result.Suites = append(result.Suites, *s)
		for _, t := range s.Tests {
			result.Total++
			switch t.Status {
			case "pass":
				result.Passed++
			case "fail":
				result.Failed++
			case "skip":
				result.Skipped++
			}
		}
	}

	return result, nil
}
