# AGENTS.md

## Code style

- TypeScript strict mode

## Review Checklist

- Make sure to include any changes from `deno fmt .`
- `deno check src/` must pass.
- `deno lint` must pass.
- Add new tests for any new feature or bug fix.
- `SKIP_LIVE_TESTS=true deno test --allow-env --coverage=coverage` must pass
- `deno coverage coverage | deno run scripts/check-coverage.ts 85 95` must pass
