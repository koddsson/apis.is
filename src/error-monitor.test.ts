import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reportError } from "./error-monitor.ts";

Deno.test("reportError should log error without crashing when not in production", async () => {
  // Create a test error
  const error = new Error("Test error message");
  const request = new Request("https://example.com/test");

  // Ensure we're not in production environment
  const originalDeploymentId = Deno.env.get("DENO_DEPLOYMENT_ID");
  const originalGithubToken = Deno.env.get("GITHUB_TOKEN");
  const originalGithubRepo = Deno.env.get("GITHUB_REPOSITORY");

  try {
    // Clear production environment variables
    if (originalDeploymentId) Deno.env.delete("DENO_DEPLOYMENT_ID");
    if (originalGithubToken) Deno.env.delete("GITHUB_TOKEN");
    if (originalGithubRepo) Deno.env.delete("GITHUB_REPOSITORY");

    // This should not throw an error
    await reportError(error, request);

    // If we reach here, the test passes
    assertEquals(true, true);
  } finally {
    // Restore environment variables
    if (originalDeploymentId) {
      Deno.env.set("DENO_DEPLOYMENT_ID", originalDeploymentId);
    }
    if (originalGithubToken) Deno.env.set("GITHUB_TOKEN", originalGithubToken);
    if (originalGithubRepo) {
      Deno.env.set("GITHUB_REPOSITORY", originalGithubRepo);
    }
  }
});

Deno.test("reportError should handle errors without request object", async () => {
  const error = new Error("Test error without request");

  // Ensure we're not in production environment
  const originalDeploymentId = Deno.env.get("DENO_DEPLOYMENT_ID");

  try {
    if (originalDeploymentId) Deno.env.delete("DENO_DEPLOYMENT_ID");

    // This should not throw an error
    await reportError(error);

    assertEquals(true, true);
  } finally {
    if (originalDeploymentId) {
      Deno.env.set("DENO_DEPLOYMENT_ID", originalDeploymentId);
    }
  }
});

Deno.test("reportError should create GitHub issue with correct API call", async () => {
  const error = new Error("Test API error");
  const request = new Request("https://example.com/api/test");

  // Store original environment and fetch
  const originalDeploymentId = Deno.env.get("DENO_DEPLOYMENT_ID");
  const originalGithubToken = Deno.env.get("GITHUB_TOKEN");
  const originalGithubRepo = Deno.env.get("GITHUB_REPOSITORY");
  const originalFetch = globalThis.fetch;

  try {
    // Set up production environment
    Deno.env.set("DENO_DEPLOYMENT_ID", "test-deployment");
    Deno.env.set("GITHUB_TOKEN", "test-token");
    Deno.env.set("GITHUB_REPOSITORY", "owner/repo");

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
    assertEquals(fetchCalls.length, 2);
    assertStringIncludes(
      fetchCalls[0].url,
      "https://api.github.com/repos/owner/repo/issues?",
    );
    assertStringIncludes(fetchCalls[0].url, "state=open");
    assertStringIncludes(fetchCalls[0].url, "labels=uncaught-error");
    const headers0 = fetchCalls[0].options?.headers as Record<string, string>;
    assertEquals(headers0?.["Authorization"], "Bearer test-token");

    // Verify fetch was called to create issue
    assertEquals(
      fetchCalls[1].url,
      "https://api.github.com/repos/owner/repo/issues",
    );
    assertEquals(fetchCalls[1].options?.method, "POST");
    const headers1 = fetchCalls[1].options?.headers as Record<string, string>;
    assertEquals(headers1?.["Authorization"], "Bearer test-token");

    // Verify issue body contains expected content
    const createBody = JSON.parse(fetchCalls[1].options?.body as string);
    assertStringIncludes(createBody.title, "Test API error");
    assertStringIncludes(createBody.body, "Test API error");
    assertStringIncludes(createBody.body, "https://example.com/api/test");
    assertStringIncludes(createBody.body, "Fingerprint:");
    assertEquals(createBody.labels, ["uncaught-error", "automated", "bug"]);
  } finally {
    // Restore environment and fetch
    globalThis.fetch = originalFetch;
    if (originalDeploymentId) {
      Deno.env.set("DENO_DEPLOYMENT_ID", originalDeploymentId);
    } else {
      Deno.env.delete("DENO_DEPLOYMENT_ID");
    }
    if (originalGithubToken) {
      Deno.env.set("GITHUB_TOKEN", originalGithubToken);
    } else {
      Deno.env.delete("GITHUB_TOKEN");
    }
    if (originalGithubRepo) {
      Deno.env.set("GITHUB_REPOSITORY", originalGithubRepo);
    } else {
      Deno.env.delete("GITHUB_REPOSITORY");
    }
  }
});

Deno.test("reportError should comment on existing issue with same fingerprint", async () => {
  const error = new Error("Duplicate error");
  const request = new Request("https://example.com/api/duplicate");

  // Store original environment and fetch
  const originalDeploymentId = Deno.env.get("DENO_DEPLOYMENT_ID");
  const originalGithubToken = Deno.env.get("GITHUB_TOKEN");
  const originalGithubRepo = Deno.env.get("GITHUB_REPOSITORY");
  const originalFetch = globalThis.fetch;

  try {
    // Set up production environment
    Deno.env.set("DENO_DEPLOYMENT_ID", "test-deployment");
    Deno.env.set("GITHUB_TOKEN", "test-token");
    Deno.env.set("GITHUB_REPOSITORY", "owner/repo");

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
                  body:
                    `Existing issue\n\n**Fingerprint:** \`${capturedFingerprint}\``,
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
    assertEquals(fetchCalls.length, 2);
    assertStringIncludes(fetchCalls[0].url, "/issues?");

    // Verify fetch was called to add comment (not create new issue)
    assertStringIncludes(fetchCalls[1].url, "/issues/42/comments");
    assertEquals(fetchCalls[1].options?.method, "POST");

    // Verify comment body
    const commentBody = JSON.parse(fetchCalls[1].options?.body as string);
    assertStringIncludes(commentBody.body, "Error occurred again");
  } finally {
    // Restore environment and fetch
    globalThis.fetch = originalFetch;
    if (originalDeploymentId) {
      Deno.env.set("DENO_DEPLOYMENT_ID", originalDeploymentId);
    } else {
      Deno.env.delete("DENO_DEPLOYMENT_ID");
    }
    if (originalGithubToken) {
      Deno.env.set("GITHUB_TOKEN", originalGithubToken);
    } else {
      Deno.env.delete("GITHUB_TOKEN");
    }
    if (originalGithubRepo) {
      Deno.env.set("GITHUB_REPOSITORY", originalGithubRepo);
    } else {
      Deno.env.delete("GITHUB_REPOSITORY");
    }
  }
});
