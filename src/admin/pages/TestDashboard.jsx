import { useState } from 'preact/compat'
import { saApi } from '../api'

const STATUS_COLORS = {
  pass: 'badge-success',
  fail: 'badge-error',
  skip: 'badge-warning',
}

const STATUS_TEXT = {
  pass: 'PASS',
  fail: 'FAIL',
  skip: 'SKIP',
}

function formatDuration(ms) {
  if (!ms && ms !== 0) return '-'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function TestDashboard() {
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [suiteFilter, setSuiteFilter] = useState('')
  const [expandedSuites, setExpandedSuites] = useState({})
  const [expandedTests, setExpandedTests] = useState({})

  async function runTests() {
    setRunning(true)
    setError('')
    setResult(null)
    try {
      const data = await saApi.runTests(suiteFilter)
      setResult(data)
    } catch (e) {
      setError(e.message || 'Failed to run tests')
    } finally {
      setRunning(false)
    }
  }

  function toggleSuite(name) {
    setExpandedSuites((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  function toggleTest(key) {
    setExpandedTests((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const passRate = result ? (result.total > 0 ? Math.round((result.passed / result.total) * 100) : 0) : 0

  // Find E2E suite for stock timeline
  const e2eSuite = result?.suites?.find((s) => s.name?.includes('E2E'))

  return (
    <div class="space-y-6">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold">Integration Tests</h2>
          <p class="text-sm text-base-content/80">
            Runs 227 tests against an isolated test database (pos_test)
          </p>
        </div>
        <div class="flex items-center gap-2">
          <input
            type="text"
            class="input input-bordered input-sm w-48"
            placeholder="Filter (e.g. TestSale)"
            value={suiteFilter}
            onInput={(e) => setSuiteFilter(e.target.value)}
          />
          <button
            class={`btn btn-primary btn-sm ${running ? 'loading' : ''}`}
            onClick={runTests}
            disabled={running}
          >
            {running ? 'Running...' : 'Run All Tests'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div class="alert alert-error text-sm">
          <span>{error}</span>
        </div>
      )}

      {/* Running indicator */}
      {running && (
        <div class="flex flex-col items-center justify-center py-16 gap-4">
          <span class="loading loading-spinner loading-lg text-primary"></span>
          <p class="text-base-content/80">Running tests against pos_test database...</p>
          <p class="text-xs text-base-content/70">This may take 30-60 seconds</p>
        </div>
      )}

      {/* Results */}
      {result && !running && (
        <>
          {/* Summary Cards */}
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div class="stat bg-base-100 rounded-lg border border-base-300 p-3">
              <div class="stat-title text-xs">Total</div>
              <div class="stat-value text-2xl">{result.total}</div>
            </div>
            <div class="stat bg-base-100 rounded-lg border border-success/30 p-3">
              <div class="stat-title text-xs text-success">Passed</div>
              <div class="stat-value text-2xl text-success">{result.passed}</div>
            </div>
            <div class="stat bg-base-100 rounded-lg border border-error/30 p-3">
              <div class="stat-title text-xs text-error">Failed</div>
              <div class="stat-value text-2xl text-error">{result.failed}</div>
            </div>
            <div class="stat bg-base-100 rounded-lg border border-warning/30 p-3">
              <div class="stat-title text-xs text-warning">Skipped</div>
              <div class="stat-value text-2xl text-warning">{result.skipped}</div>
            </div>
            <div class="stat bg-base-100 rounded-lg border border-base-300 p-3">
              <div class="stat-title text-xs">Duration</div>
              <div class="stat-value text-2xl">{formatDuration(result.duration)}</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div class="w-full">
            <div class="flex justify-between text-xs mb-1">
              <span>{result.passed}/{result.total} passed</span>
              <span>{passRate}%</span>
            </div>
            <progress
              class={`progress w-full ${result.failed > 0 ? 'progress-error' : 'progress-success'}`}
              value={result.passed}
              max={result.total}
            ></progress>
          </div>

          {/* Suite List */}
          <div class="space-y-2">
            {result.suites?.map((suite) => {
              const isExpanded = expandedSuites[suite.name]
              const suitePassed = suite.tests?.filter((t) => t.status === 'pass').length || 0
              const suiteTotal = suite.tests?.length || 0
              const suiteFailed = suite.status === 'fail'

              return (
                <div
                  key={suite.name}
                  class={`border rounded-lg ${suiteFailed ? 'border-error/40' : 'border-base-300'}`}
                >
                  {/* Suite Header */}
                  <button
                    class="w-full flex items-center justify-between p-3 hover:bg-base-200/50 transition-colors rounded-lg"
                    onClick={() => toggleSuite(suite.name)}
                  >
                    <div class="flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                      <span class={`badge badge-xs ${suiteFailed ? STATUS_COLORS.fail : STATUS_COLORS.pass}`}></span>
                      <span class="font-medium text-sm">{suite.name}</span>
                    </div>
                    <div class="flex items-center gap-3 text-xs text-base-content/80">
                      <span>
                        {suitePassed}/{suiteTotal}
                      </span>
                      <span>{formatDuration(suite.duration)}</span>
                    </div>
                  </button>

                  {/* Suite Tests */}
                  {isExpanded && (
                    <div class="border-t border-base-300">
                      {suite.tests?.map((test, idx) => {
                        const testKey = `${suite.name}-${idx}`
                        const isTestExpanded = expandedTests[testKey]
                        return (
                          <div key={testKey} class="border-b border-base-300 last:border-b-0">
                            <div
                              class="flex items-center justify-between px-4 py-2 hover:bg-base-200/30 cursor-pointer"
                              onClick={() => test.output && toggleTest(testKey)}
                            >
                              <div class="flex items-center gap-2">
                                <span class={`badge badge-xs ${STATUS_COLORS[test.status]}`}>
                                  {STATUS_TEXT[test.status]}
                                </span>
                                <span class="text-sm font-mono">{test.name}</span>
                              </div>
                              <span class="text-xs text-base-content/70">
                                {formatDuration(test.duration)}
                              </span>
                            </div>
                            {isTestExpanded && test.output && (
                              <pre class="mx-4 mb-2 p-2 bg-base-200 rounded text-xs overflow-x-auto max-h-48 whitespace-pre-wrap">
                                {test.output}
                              </pre>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* E2E Stock Timeline */}
          {e2eSuite && (
            <div class="border border-base-300 rounded-lg p-4">
              <h3 class="font-bold text-sm mb-3">E2E Stock Timeline (Suite W)</h3>
              <div class="flex items-end gap-1 h-32">
                {[0, 10, 8, 5, 6, 10, 9, 12, 5, 7].map((val, i) => {
                  const labels = [
                    'Create', 'Purchase', 'Sell 2', 'Sell 3', 'Return 1',
                    'Purchase 4', 'Loss 1', 'Adjust', 'Sell 7', 'Return 2',
                  ]
                  const maxVal = 12
                  const h = Math.max(4, (val / maxVal) * 100)
                  return (
                    <div key={i} class="flex flex-col items-center flex-1 gap-1">
                      <span class="text-[10px] font-mono font-bold">{val}</span>
                      <div
                        class="w-full bg-primary/80 rounded-t transition-all"
                        style={{ height: `${h}%` }}
                      ></div>
                      <span class="text-[8px] text-base-content/70 truncate w-full text-center">
                        {labels[i]}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!result && !running && !error && (
        <div class="flex flex-col items-center justify-center py-20 text-base-content/70">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <p class="text-lg font-medium">No test results yet</p>
          <p class="text-sm mt-1">Click "Run All Tests" to start</p>
        </div>
      )}
    </div>
  )
}
