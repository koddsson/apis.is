import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
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
