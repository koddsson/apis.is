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

## Issue Management

Issues created by the error monitoring system:

- Have the title format: `🚨 Uncaught Error: [error message]`
- Are labeled with: `uncaught-error`, `automated`, `bug`
- Include:
  - Error message and stack trace
  - Request method and URL
  - Timestamp
  - Cloudflare Ray ID, for finding the request in Workers Logs
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

```markdown
🚨 Uncaught Error: Cannot read property 'data' of undefined

**Error Message:**
```

Cannot read property 'data' of undefined

```
**Stack Trace:**
```

Error: Cannot read property 'data' of undefined at gengi
(file:///src/endpoints/gengi.ts:35:25) at Router.route
(file:///src/router.ts:39:42)

```
**Request Details:**
- Method: GET
- URL: https://apis.is/x/gengi/USD
- Timestamp: 2025-11-14T11:23:37.000Z

**Fingerprint:** `error-a1b2c3d4`

This issue was automatically created by the error monitoring system.
```

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
