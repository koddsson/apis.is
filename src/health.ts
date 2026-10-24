import type { ZodType } from "zod";
import { github } from "./github.ts";
import type { Router } from "./router.ts";

const LABEL = "endpoint-down";

export interface HealthResult {
  endpoint: string;
  problem?: string;
}

const MAX_REPORTED_ISSUES = 5;

export function validate(schema: ZodType, data: unknown): string | undefined {
  const result = schema.safeParse(data);
  if (result.success) return undefined;
  const { issues } = result.error;
  const lines = issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
  if (issues.length > MAX_REPORTED_ISSUES) {
    lines.push(`…and ${issues.length - MAX_REPORTED_ISSUES} more`);
  }
  return lines.join("\n");
}

export function pathFor(
  endpoint: string,
  params: Record<string, string>,
): string {
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
        return { endpoint, problem: validate(health.schema, await res.json()) };
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

function issueBody(endpoint: string, problem: string, seenAt: string): string {
  return `The scheduled health check for \`${endpoint}\` failed.

**Problem** (last seen ${seenAt}):
\`\`\`
${problem}
\`\`\`

${marker(endpoint)}

This issue closes automatically once the health check passes again.`;
}

export async function reportHealth(results: HealthResult[]): Promise<void> {
  console.log("Endpoint health:", results);
  const request = github("apis.is-health-check");
  if (!request) return;

  try {
    const issuesResponse = await request(
      `/issues?state=open&labels=${LABEL}&per_page=100`,
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
        await request("/issues", {
          method: "POST",
          body: {
            title: `🔻 Endpoint down: ${endpoint}`,
            body: issueBody(endpoint, problem, new Date().toISOString()),
            labels: [LABEL, "automated", "bug"],
          },
        });
      } else if (problem && existing && !existing.body.includes(problem)) {
        // Keep the latest failure in the issue without commenting every hour.
        await request(`/issues/${existing.number}`, {
          method: "PATCH",
          body: {
            body: issueBody(endpoint, problem, new Date().toISOString()),
          },
        });
      } else if (!problem && existing) {
        await request(`/issues/${existing.number}/comments`, {
          method: "POST",
          body: { body: `Health check passed at ${new Date().toISOString()}.` },
        });
        await request(`/issues/${existing.number}`, {
          method: "PATCH",
          body: { state: "closed", state_reason: "completed" },
        });
      }
    }
  } catch (error) {
    console.error("Failed to report endpoint health:", error);
  }
}
