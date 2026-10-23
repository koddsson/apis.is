# apis.is

A collection of Icelandic-specific APIs

## Development

### Running Tests

Tests use Vitest and run inside workerd, the Cloudflare Workers runtime:

```bash
npm install

# Run all unit tests
npm test

# Run tests with live API calls (integration tests)
npm run test:live
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
  - Not part of `npm test`; they have their own config, `vitest.live.config.ts`

### Linting and Formatting

```bash
# Check linting and formatting (Biome)
npm run lint

# Fix formatting and safe lint issues
npm run format

# Type check
npm run typecheck
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
