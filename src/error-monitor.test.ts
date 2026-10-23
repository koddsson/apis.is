import { assert, test, vi } from "vitest";
import { reportError } from "./error-monitor.ts";

test("reportError should log error without crashing when not in production", async () => {
  // Create a test error
  const error = new Error("Test error message");
  const request = new Request("https://example.com/test");

  // This should not throw an error
  await reportError(error, request);

  // If we reach here, the test passes
  assert.deepEqual(true, true);
});

test("reportError should handle errors without request object", async () => {
  const error = new Error("Test error without request");

  // This should not throw an error
  await reportError(error);

  assert.deepEqual(true, true);
});

test("reportError should handle errors without stack trace", async () => {
  // Create an error without stack trace
  const error = new Error("Error without stack");
  delete error.stack;

  const originalFetch = globalThis.fetch;

  try {
    vi.stubEnv("ENVIRONMENT", "production");
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");

    let issueBody = "";

    globalThis.fetch = (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/issues?")) {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      if (url.endsWith("/issues") && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        issueBody = body.body;
        return Promise.resolve(
          new Response(JSON.stringify({ number: 1 }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    };

    await reportError(error);

    // Verify that "No stack trace available" is in the body
    assert.include(issueBody, "No stack trace available");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reportError should handle missing request method and url", async () => {
  const error = new Error("Test error");
  // Test without passing a request to verify N/A fallbacks

  const originalFetch = globalThis.fetch;

  try {
    vi.stubEnv("ENVIRONMENT", "production");
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");

    let issueBody = "";

    globalThis.fetch = (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/issues?")) {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      if (url.endsWith("/issues") && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        issueBody = body.body;
        return Promise.resolve(
          new Response(JSON.stringify({ number: 1 }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    };

    // Report error without request to test N/A fallbacks
    await reportError(error);

    // Verify that "N/A" is used for missing method/url
    assert.include(issueBody, "Method: N/A");
    assert.include(issueBody, "URL: N/A");
    assert.include(issueBody, "Ray ID: N/A");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reportError should handle GitHub API errors gracefully", async () => {
  const error = new Error("Test error");
  const request = new Request("https://example.com/test");

  const originalFetch = globalThis.fetch;

  try {
    vi.stubEnv("ENVIRONMENT", "production");
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");

    // Mock fetch to throw an error
    globalThis.fetch = (): Promise<Response> => {
      throw new Error("Network error");
    };

    // Should not throw, even though fetch fails
    await reportError(error, request);

    assert.deepEqual(true, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reportError should create GitHub issue with correct API call", async () => {
  const error = new Error("Test API error");
  const request = new Request("https://example.com/api/test", {
    headers: { "cf-ray": "8d1f2a3b4c5d6e7f-KEF" },
  });

  // Store original fetch
  const originalFetch = globalThis.fetch;

  try {
    // Simulate production
    vi.stubEnv("ENVIRONMENT", "production");
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");

    // Track fetch calls
    const fetchCalls: Array<{ url: string; options?: RequestInit }> = [];

    // Mock fetch
    globalThis.fetch = (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      fetchCalls.push({ url, options: init });

      // Mock response for listing issues (no existing issues)
      if (url.includes("/issues?")) {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      // Mock response for creating issue
      if (url.endsWith("/issues")) {
        return Promise.resolve(
          new Response(JSON.stringify({ number: 1 }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    };

    await reportError(error, request);

    // Verify fetch was called to list issues
    assert.deepEqual(fetchCalls.length, 2);
    assert.include(
      fetchCalls[0].url,
      "https://api.github.com/repos/owner/repo/issues?",
    );
    assert.include(fetchCalls[0].url, "state=open");
    assert.include(fetchCalls[0].url, "labels=uncaught-error");
    const headers0 = fetchCalls[0].options?.headers as Record<string, string>;
    assert.deepEqual(headers0?.Authorization, "Bearer test-token");

    // Verify fetch was called to create issue
    assert.deepEqual(
      fetchCalls[1].url,
      "https://api.github.com/repos/owner/repo/issues",
    );
    assert.deepEqual(fetchCalls[1].options?.method, "POST");
    const headers1 = fetchCalls[1].options?.headers as Record<string, string>;
    assert.deepEqual(headers1?.Authorization, "Bearer test-token");

    // Verify issue body contains expected content
    const createBody = JSON.parse(fetchCalls[1].options?.body as string);
    assert.include(createBody.title, "Test API error");
    assert.include(createBody.body, "Test API error");
    assert.include(createBody.body, "https://example.com/api/test");
    assert.include(createBody.body, "Fingerprint:");
    assert.include(createBody.body, "Ray ID: 8d1f2a3b4c5d6e7f-KEF");
    assert.deepEqual(createBody.labels, ["uncaught-error", "automated", "bug"]);
  } finally {
    // Restore fetch
    globalThis.fetch = originalFetch;
  }
});

test("reportError should comment on existing issue with same fingerprint", async () => {
  const error = new Error("Duplicate error");
  const request = new Request("https://example.com/api/duplicate", {
    headers: { "cf-ray": "9e8d7c6b5a4f3e2d-KEF" },
  });

  // Store original fetch
  const originalFetch = globalThis.fetch;

  try {
    // Simulate production
    vi.stubEnv("ENVIRONMENT", "production");
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");

    // Track fetch calls and capture fingerprint
    const fetchCalls: Array<{ url: string; options?: RequestInit }> = [];
    let capturedFingerprint = "";

    // Mock fetch
    globalThis.fetch = (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      fetchCalls.push({ url, options: init });

      // Mock response for creating comment (must be checked before /issues endpoint)
      if (url.includes("/issues/42/comments")) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 1 }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      // Mock response for listing issues (return existing issue with captured fingerprint)
      if (url.includes("/issues?")) {
        if (capturedFingerprint) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  number: 42,
                  body: `Existing issue\n\n**Fingerprint:** \`${capturedFingerprint}\``,
                },
              ]),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            ),
          );
        }
        // First time, no existing issues
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      // Capture fingerprint from issue creation
      if (url.endsWith("/issues") && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        const fingerprintMatch = body.body.match(
          /\*\*Fingerprint:\*\* `([^`]+)`/,
        );
        if (fingerprintMatch) {
          capturedFingerprint = fingerprintMatch[1];
        }
        return Promise.resolve(
          new Response(JSON.stringify({ number: 42 }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    };

    // First call to create issue and establish fingerprint
    await reportError(error, request);

    // Second call with same error should comment on existing issue
    fetchCalls.length = 0; // Clear previous calls
    await reportError(error, request);

    // Verify fetch was called to list issues
    assert.deepEqual(fetchCalls.length, 2);
    assert.include(fetchCalls[0].url, "/issues?");

    // Verify fetch was called to add comment (not create new issue)
    assert.include(fetchCalls[1].url, "/issues/42/comments");
    assert.deepEqual(fetchCalls[1].options?.method, "POST");

    // Verify comment body
    const commentBody = JSON.parse(fetchCalls[1].options?.body as string);
    assert.include(commentBody.body, "Error occurred again");
    assert.include(commentBody.body, "**Ray ID:** 9e8d7c6b5a4f3e2d-KEF");
  } finally {
    // Restore fetch
    globalThis.fetch = originalFetch;
  }
});
