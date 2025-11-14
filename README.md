# apis.is

A collection of Icelandic-specific APIs

## Development

### Running Tests

This project uses Deno's built-in test framework. To run the tests:

```bash
# Run all unit tests
deno test --allow-env

# Run tests with live API calls (integration tests)
deno test --allow-net --allow-env src/endpoints/live.test.ts

# Skip live tests (useful for CI)
SKIP_LIVE_TESTS=true deno test --allow-env
```

### Test Structure

- **Unit Tests**: Fast, isolated tests with mocked external dependencies
  - `src/utils.test.ts` - Utility function tests
  - `src/router.test.ts` - Router functionality tests
  - `src/endpoints/*.test.ts` - Individual endpoint tests with mocked APIs

- **Live Tests**: Integration tests that call real external APIs
  - `src/endpoints/live.test.ts` - Validates external API availability and
    format
  - Run automatically daily via GitHub Actions as a watchdog
  - Can be skipped with `SKIP_LIVE_TESTS=true` environment variable

### Linting and Formatting

```bash
# Check code formatting
deno fmt --check

# Format code
deno fmt

# Lint code
deno lint

# Type check
deno check src/index.ts
```

### Middleware System

The router supports middleware for processing requests. Middleware functions are
executed in order before the route handler.

```typescript
import { Router } from "./router.ts";
import type { Middleware } from "./router.ts";

const router = new Router();

// Define middleware
const myMiddleware: Middleware = async (req, next) => {
  // Do something before the handler
  console.log(`Request: ${req.method} ${req.url}`);

  // Call next to continue the chain
  const response = await next();

  // Do something after the handler
  console.log(`Response status: ${response.status}`);

  return response;
};

// Add middleware to router
router.use(myMiddleware);

// Add routes
router.add("GET", "/", () => new Response("Hello!"));
```

#### Built-in Middleware

- **commonLogMiddleware**: Logs all requests in Common Log Format (CLF)

## Contributing

### Adding a Meetup

You can submit a new meetup to be added to the meetups list! See our
[Contributing Guide](.github/CONTRIBUTING.md) for details.

In short:

1. Create a new issue using the "Add Meetup" template
2. Fill in the meetup details
3. A maintainer will review and approve by adding the `approved-meetup` label
4. The meetup will be automatically added via a pull request
