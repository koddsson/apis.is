# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

apis.is is a collection of Icelandic-specific public APIs built with **Deno**
(TypeScript). It aggregates data from external sources (Borgun currency rates,
island.is vehicle lookup, hlaupadagskra.is race calendar) and serves
community-maintained meetup data. Deployed on **Cloudflare Workers**.

## Commands

```bash
# Type check
deno check src/index.ts

# Lint and format
deno lint
deno fmt --check        # check only
deno fmt                # auto-fix

# Run all unit tests (skipping live/integration tests)
SKIP_LIVE_TESTS=true deno test --allow-env

# Run a single test file
deno test --allow-env src/endpoints/gengi.test.ts

# Run live/integration tests (hits real external APIs)
deno test --allow-net --allow-env src/endpoints/live.test.ts

# Run locally with Deno
deno serve --allow-net --allow-env src/index.ts

# Run locally in the Workers runtime (bundles via `deno bundle` first)
npx wrangler dev

# Coverage (branch: 85%, line: 95% thresholds)
deno test --coverage=coverage --allow-env
deno coverage coverage | deno run scripts/check-coverage.ts 85 95
```

## Architecture

**Request flow:** default-exported `fetch` handler → Router (URLPattern-based) →
Middleware chain → Endpoint handler → Response

- `src/index.ts` — Entry point, registers routes and exports the `fetch`
  handler. Runs under both `deno serve` and Cloudflare Workers, so endpoint code
  must stick to web-standard APIs (no `Deno.*`, no runtime WASM compilation).
  `wrangler.jsonc` bundles it with `deno bundle` before deploying.
- `src/router.ts` — Custom router using native `URLPattern` API, supports path
  params (e.g., `/x/car/{number}?`)
- `src/middleware.ts` — Middleware system; currently has Common Log Format
  logger
- `src/error-monitor.ts` — Auto-creates GitHub issues for uncaught errors in
  production (deduplicates via fingerprinting)
- `src/endpoints/` — One file per API endpoint (gengi, meetups, car,
  race-calendar, meta)
- `src/data/meetups.json` — Static meetup data (community-maintained via GitHub
  issues + automated workflow)
- `src/rss.ts` — RSS 2.0 feed generator used by meetups endpoint

## Code Quality Requirements

- TypeScript strict mode
- All changes must pass: `deno fmt`, `deno lint`, `deno check src/`
- New features/fixes require tests
- Coverage thresholds enforced in CI: 85% branch, 95% line
- **Always verify coverage** after writing or modifying tests by running the
  coverage commands above. CI will fail if thresholds are not met.
