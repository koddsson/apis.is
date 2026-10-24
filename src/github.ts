export type GitHubRequest = (
  path: string,
  init?: { method?: string; body?: unknown },
) => Promise<Response>;

// Requests against this repo's GitHub API, or undefined unless running in
// production with a token.
export function github(userAgent: string): GitHubRequest | undefined {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo || process.env.ENVIRONMENT !== "production") {
    return undefined;
  }

  return (path, { method, body } = {}) =>
    fetch(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": userAgent,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}
