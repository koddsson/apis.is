# Error Monitoring

This application includes a simple error monitoring system that automatically
creates GitHub issues for uncaught errors in production.

## How It Works

When an uncaught error occurs in a request handler, the system:

1. **Captures the error** - The router wraps all handler execution in a
   try-catch block
2. **Generates a fingerprint** - Creates a unique identifier based on the error
   message and stack trace
3. **Creates a GitHub issue** - Opens a new issue with error details, or
   comments on an existing issue if one already exists for the same error
4. **Returns error response** - Sends a 500 Internal Server Error response to
   the client

## Configuration

The error monitoring system requires the following environment variables to be
set in production:

- `GITHUB_TOKEN` - A GitHub personal access token with `repo` scope
- `GITHUB_REPOSITORY` - The repository in format `owner/repo` (e.g.,
  `koddsson/apis.is`)
- `ENVIRONMENT` - Must be `production` for issues to be created

### Setting Up on Cloudflare Workers

`ENVIRONMENT` and `GITHUB_REPOSITORY` are set as `vars` in `wrangler.jsonc`. The
token is a secret:

```bash
npx wrangler secret put GITHUB_TOKEN
```

Generate a [personal access token](https://github.com/settings/tokens) with
`repo` scope.

## Endpoint Health Checks

Errors only get reported when someone hits an endpoint, and a scraper that
stops matching returns `200 []` without erroring. To catch both, the Worker
has an hourly Cron Trigger (`triggers.crons` in `wrangler.jsonc`) that runs
`src/health.ts`:

- Every endpoint handler with a `health` property is called directly (not
  through the router, so failures don't also file `uncaught-error` issues)
  with the declared `params`, and its JSON is validated against
  `health.schema`, a Zod schema for a healthy response. Violations are
  reported with the path of each failing field.
- A failing endpoint gets one `endpoint-down` issue. It isn't commented on
  while it stays down, but if the failure message changes the issue's problem
  section is rewritten with the latest one. It is closed automatically once
  the check passes.

Like error issues, these are only filed when `ENVIRONMENT` is `production` and
`GITHUB_TOKEN` is set.

## Source-Mapped Stack Traces

The Worker runs a bundle, so `error.stack` points into `index.js`. To get
source locations back into issues:

1. The deploy job in `ci.yml` passes the commit SHA to the Worker as `GIT_SHA`
   and saves `index.js.map` as a `worker-sourcemap-<sha>` artifact (kept 90
   days).
2. The error monitor writes that SHA into the issue as `- Commit: <sha>`.
3. `remap-error-trace.yml` runs when the issue is opened, downloads the
   matching source map, and rewrites the stack trace using
   `scripts/remap-stack.ts`. The bundled trace is kept in a collapsed section.

Errors from deployments whose artifact has expired keep the bundled trace.

## Issue Management

Issues created by the error monitoring system:

- Have the title format: `🚨 Uncaught Error: [error message]`
- Are labeled with: `uncaught-error`, `automated`, `bug`
- Include:
  - Error message and stack trace
  - Request method and URL
  - Timestamp
  - Cloudflare Ray ID, for finding the request in Workers Logs
  - Commit SHA of the deployment, used to source-map the stack trace
  - Error fingerprint for tracking duplicates

### Duplicate Handling

If the same error occurs multiple times, the system will:

- Find the existing open issue with the same fingerprint
- Add a comment with the new occurrence timestamp
- Avoid creating duplicate issues

## Local Development

During local development and testing:

- Error monitoring is disabled (no GitHub issues are created)
- Errors are logged to the console for debugging
- The system requires all three environment variables and will not create issues
  if any are missing

## Example Error Issue

````markdown
**Error Message:**
```
Cannot read properties of undefined (reading 'publicVehicleSearch')
```

**Stack Trace:**
```
TypeError: Cannot read properties of undefined (reading 'publicVehicleSearch')
    at car (src/endpoints/car.ts:48:15)
    at handler (src/router.ts:62:32)
```

**Request Details:**
- Method: GET
- URL: https://apis.is/x/car/ABC12
- Timestamp: 2026-10-23T11:23:37.000Z
- Ray ID: <cf-ray of the request>
- Commit: <full SHA of the deployed commit>

**Fingerprint:** `error-a1b2c3d4`

This issue was automatically created by the error monitoring system.
````

## Testing

The error monitoring system includes comprehensive tests:

```bash
# Run all tests
npm test

# Test error monitoring specifically
npx vitest run src/error-monitor.test.ts

# Test router error handling
npx vitest run src/router.test.ts
```

## Disabling Error Monitoring

To disable error monitoring in production (not recommended):

- Remove or unset the `GITHUB_TOKEN` environment variable
- Errors will still be logged to the console but no GitHub issues will be
  created
