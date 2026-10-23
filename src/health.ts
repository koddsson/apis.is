import type { Router } from "./router.ts";

const LABEL = "endpoint-down";

export interface HealthResult {
  endpoint: string;
  problem?: string;
}

export function expectNonEmptyArray(data: unknown): string | undefined {
  if (!Array.isArray(data)) return "Expected an array";
  if (data.length === 0) return "Expected at least one item, got none";
  return undefined;
}

function pathFor(endpoint: string, params: Record<string, string>): string {
  let path = endpoint;
  for (const [name, value] of Object.entries(params)) {
    path = path.replace(`{${name}}`, value);
  }
  return path.replace(/\/\{[^}]+\}/g, "");
}

export function checkEndpoints(router: Router): Promise<HealthResult[]> {
  return Promise.all(
    router.getHealthChecks().map(async ({ endpoint, handler, health }) => {
      const params = health.params ?? {};
      try {
        const res = await handler(
          new Request(`https://health.check${pathFor(endpoint, params)}`),
          params,
        );
        if (!res.ok) return { endpoint, problem: `HTTP ${res.status}` };
        return { endpoint, problem: health.check(await res.json()) };
      } catch (error) {
        return {
          endpoint,
          problem:
            error instanceof Error
              ? `${error.name}: ${error.message}`
              : String(error),
        };
      }
    }),
  );
}

function marker(endpoint: string): string {
  return `**Endpoint:** \`${endpoint}\``;
}

export async function reportHealth(results: HealthResult[]): Promise<void> {
  console.log("Endpoint health:", results);
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPOSITORY;
  if (!githubToken || !githubRepo || process.env.ENVIRONMENT !== "production") {
    return;
  }

  const apiUrl = `https://api.github.com/repos/${githubRepo}`;
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "apis.is-health-check",
    "Content-Type": "application/json",
  };

  try {
    const issuesResponse = await fetch(
      `${apiUrl}/issues?state=open&labels=${LABEL}&per_page=100`,
      { headers },
    );
    if (!issuesResponse.ok) {
      throw new Error(`Listing issues failed: ${issuesResponse.status}`);
    }
    const openIssues =
      await issuesResponse.json<Array<{ number: number; body: string }>>();

    for (const { endpoint, problem } of results) {
      const existing = openIssues.find((issue) =>
        issue.body?.includes(marker(endpoint)),
      );

      if (problem && !existing) {
        await fetch(`${apiUrl}/issues`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            title: `🔻 Endpoint down: ${endpoint}`,
            body: `The scheduled health check for \`${endpoint}\` failed.

**Problem:**
\`\`\`
${problem}
\`\`\`

${marker(endpoint)}

This issue closes automatically once the health check passes again.`,
            labels: [LABEL, "automated", "bug"],
          }),
        });
      } else if (!problem && existing) {
        await fetch(`${apiUrl}/issues/${existing.number}/comments`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            body: `Health check passed at ${new Date().toISOString()}.`,
          }),
        });
        await fetch(`${apiUrl}/issues/${existing.number}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ state: "closed", state_reason: "completed" }),
        });
      }
    }
  } catch (error) {
    console.error("Failed to report endpoint health:", error);
  }
}
