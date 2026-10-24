/**
 * Error monitoring utility for reporting uncaught errors to GitHub Issues
 *
 * This module provides a simple monitoring system that creates GitHub issues
 * for uncaught errors in production. It uses error fingerprinting to avoid
 * creating duplicate issues for the same error.
 */

import { github } from "./github.ts";

interface ErrorReport {
  message: string;
  stack?: string;
  timestamp: string;
  url?: string;
  method?: string;
  rayId?: string;
}

/**
 * Generates a fingerprint for an error to identify duplicate errors
 */
function generateErrorFingerprint(error: Error, _url?: string): string {
  // Create a fingerprint from error message and first few lines of stack
  const stackLines = error.stack?.split("\n").slice(0, 3).join("\n") || "";
  const fingerprint = `${error.name}:${error.message}:${stackLines}`;

  // Create a simple hash
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return `error-${Math.abs(hash).toString(16)}`;
}

/**
 * Creates a GitHub issue for an uncaught error
 */
async function createGitHubIssue(
  report: ErrorReport,
  fingerprint: string,
): Promise<void> {
  const request = github("apis.is-error-monitor");
  if (!request) {
    console.error(
      "Error monitoring: Not in production or missing configuration",
    );
    return;
  }

  try {
    // Check if there's already an open issue with this fingerprint
    const issuesResponse = await request(
      "/issues?state=open&labels=uncaught-error&per_page=100",
    );

    if (issuesResponse.ok) {
      const issues =
        await issuesResponse.json<Array<{ number: number; body: string }>>();
      const existingIssue = issues.find((issue) =>
        issue.body?.includes(`**Fingerprint:** \`${fingerprint}\``),
      );

      if (existingIssue) {
        await request(`/issues/${existingIssue.number}/comments`, {
          method: "POST",
          body: {
            body:
              `Error occurred again at ${report.timestamp}\n\n` +
              `**Request:** ${report.method} ${report.url}\n\n` +
              `**Ray ID:** ${report.rayId || "N/A"}\n\n` +
              `See deployment logs for more details.`,
          },
        });
        return;
      }
    }

    const title = `🚨 Uncaught Error: ${report.message.substring(0, 80)}`;
    const body = `An uncaught error occurred in production.

**Error Message:**
\`\`\`
${report.message}
\`\`\`

**Stack Trace:**
\`\`\`
${report.stack || "No stack trace available"}
\`\`\`

**Request Details:**
- Method: ${report.method || "N/A"}
- URL: ${report.url || "N/A"}
- Timestamp: ${report.timestamp}
- Ray ID: ${report.rayId || "N/A"}
- Commit: ${process.env.GIT_SHA || "N/A"}

**Fingerprint:** \`${fingerprint}\`

This issue was automatically created by the error monitoring system.`;

    await request("/issues", {
      method: "POST",
      body: { title, body, labels: ["uncaught-error", "automated", "bug"] },
    });
  } catch (error) {
    // Don't let error reporting errors crash the app
    console.error("Failed to create GitHub issue:", error);
  }
}

/**
 * Reports an uncaught error to the monitoring system
 */
export async function reportError(
  error: Error,
  request?: Request,
): Promise<void> {
  const report: ErrorReport = {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    url: request?.url,
    method: request?.method,
    rayId: request?.headers.get("cf-ray") ?? undefined,
  };

  // Log the error
  console.error("Uncaught error:", report);

  // Generate fingerprint and create issue
  const fingerprint = generateErrorFingerprint(error, request?.url);
  await createGitHubIssue(report, fingerprint);
}
