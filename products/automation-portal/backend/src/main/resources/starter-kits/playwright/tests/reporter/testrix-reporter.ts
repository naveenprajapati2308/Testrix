import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';

/**
 * Pushes execution lifecycle events to Testrix. Every call is fire-and-forget — a Testrix outage
 * must never fail or block the actual test run, so failures are only logged, never thrown.
 */
function sendEvent(eventType: string, data: Record<string, unknown>): void {
  const portalUrl = process.env.PORTAL_URL;
  const apiKey = process.env.PORTAL_API_KEY;
  const executionId = process.env.EXECUTION_ID;
  if (!portalUrl || !apiKey || !executionId || !portalUrl.startsWith('http') || portalUrl.includes('{{')) {
    // Skipping reporter push when Testrix portal connection is not configured or still has template placeholders
    return;
  }

  fetch(`${portalUrl}/api/events/execution`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ executionId, eventType, timestamp: new Date().toISOString(), data }),
  }).catch((err) => {
    console.error(`[Testrix] Failed to send ${eventType}:`, err instanceof Error ? err.message : err);
  });
}

export default class TestrixReporter implements Reporter {
  onBegin(): void {
    sendEvent('SUITE_STARTED', {});
  }

  onTestBegin(test: TestCase): void {
    const className = test.location ? test.location.file.split(/[\\/]/).pop() || 'Playwright' : 'Playwright';
    sendEvent('TEST_STARTED', {
      testName: test.title,
      className,
      methodName: test.title,
      displayName: test.title,
    });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const eventType = result.status === 'passed' ? 'TEST_PASSED'
      : result.status === 'skipped' ? 'TEST_SKIPPED'
      : 'TEST_FAILED';
    const className = test.location ? test.location.file.split(/[\\/]/).pop() || 'Playwright' : 'Playwright';
    const data: Record<string, unknown> = {
      testName: test.title,
      className,
      methodName: test.title,
      status: result.status === 'passed' ? 'PASS' : result.status === 'skipped' ? 'SKIP' : 'FAIL',
      durationMs: result.duration,
    };
    if (result.error) {
      data.exceptionMessage = result.error.message || '';
      data.stackTrace = result.error.stack || '';
      data.exceptionType = 'PlaywrightError';
    }
    sendEvent(eventType, data);
  }

  onEnd(result: FullResult): void {
    sendEvent('SUITE_COMPLETED', { status: result.status });
  }
}
