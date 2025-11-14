/**
 * Error monitoring utility for reporting uncaught errors to GitHub Issues
 *
 * This module provides a simple monitoring system that creates GitHub issues
 * for uncaught errors in production. It uses error fingerprinting to avoid
 * creating duplicate issues for the same error.
 */

interface ErrorReport {
  message: string;
  stack?: string;
  timestamp: string;
  url?: string;
  method?: string;
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
    hash = ((hash << 5) - hash) + char;
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
  const githubToken = Deno.env.get("GITHUB_TOKEN");
  const githubRepo = Deno.env.get("GITHUB_REPOSITORY");

  // Only report in production and when GitHub token is available
  if (
    !githubToken || !githubRepo ||
    Deno.env.get("DENO_DEPLOYMENT_ID") === undefined
  ) {
    console.error(
      "Error monitoring: Not in production or missing configuration",
      {
        hasToken: !!githubToken,
        hasRepo: !!githubRepo,
        hasDeploymentId: Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined,
      },
    );
    return;
  }

  const [owner, repo] = githubRepo.split("/");
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;

  try {
    // Check if there's already an open issue with this fingerprint
    const issuesResponse = await fetch(
      `${apiUrl}/issues?state=open&labels=uncaught-error&per_page=100`,
      {
        headers: {
          "Authorization": `Bearer ${githubToken}`,
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "apis.is-error-monitor",
        },
      },
    );

    if (issuesResponse.ok) {
      const issues = await issuesResponse.json();
      const existingIssue = issues.find((issue: { body: string }) =>
        issue.body?.includes(`Fingerprint: \`${fingerprint}\``)
      );

      if (existingIssue) {
        // Add a comment to the existing issue
        await fetch(`${apiUrl}/issues/${existingIssue.number}/comments`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${githubToken}`,
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "apis.is-error-monitor",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            body: `Error occurred again at ${report.timestamp}\n\n` +
              `**Request:** ${report.method} ${report.url}\n\n` +
              `See deployment logs for more details.`,
          }),
        });
        return;
      }
    }

    // Create a new issue
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

**Fingerprint:** \`${fingerprint}\`

This issue was automatically created by the error monitoring system.`;

    await fetch(`${apiUrl}/issues`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${githubToken}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "apis.is-error-monitor",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        body,
        labels: ["uncaught-error", "automated", "bug"],
      }),
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
  };

  // Log the error
  console.error("Uncaught error:", report);

  // Generate fingerprint and create issue
  const fingerprint = generateErrorFingerprint(error, request?.url);
  await createGitHubIssue(report, fingerprint);
}
