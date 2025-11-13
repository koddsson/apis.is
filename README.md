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

## Contributing

### Adding a Meetup

You can submit a new meetup to be added to the meetups list! See our
[Contributing Guide](.github/CONTRIBUTING.md) for details.

In short:

1. Create a new issue using the "Add Meetup" template
2. Fill in the meetup details
3. A maintainer will review and approve by adding the `approved-meetup` label
4. The meetup will be automatically added via a pull request
