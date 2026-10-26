# apis.is

Icelandic data as clean JSON. apis.is serves data that is otherwise only
available as web pages, XML feeds, or undocumented APIs: currency rates,
weather, road conditions, flights, air quality, population figures, tech
meetups, and more.

Open [apis.is](https://apis.is) in a browser to explore the endpoints and try
them out. Requested programmatically, `/` returns the endpoint list as JSON.
Add `?pretty=true` to any request for indented output.

Some Icelandic data already has a good official API, so we link to it instead
of wrapping it:

- **Earthquakes:** Veðurstofa Íslands'
  [quakes API](https://api.vedur.is/) (`https://api.vedur.is/quakes/events`)
- **Weather warnings:** Veðurstofa Íslands'
  [CAP API](https://api.vedur.is/)
  (`https://api.vedur.is/cap/capbroker/active/detailed/all`), which returns
  `204 No Content` when no warnings are active

## Contributing

- **Add a meetup:** open an issue with the "Add Meetup" template. See the
  [Contributing Guide](.github/CONTRIBUTING.md).
- **Propose an endpoint:** open an issue with the "New Endpoint" template.
  We only wrap a source when it adds something: data with no API, an awkward
  format, several sources combined, or caching for a slow upstream.

## Development

The API runs on Cloudflare Workers. Tests run in workerd, the Workers runtime.

```bash
npm install

npm run dev            # run locally
npm run lint           # Biome lint and format check (npm run format to fix)
npm run typecheck
npm test               # unit tests, with upstream APIs mocked
npm run test:coverage  # what CI runs; enforces coverage thresholds
```

Every merge to `main` deploys. In production, uncaught errors and failing
hourly endpoint health checks open GitHub issues automatically; see
[docs/ERROR_MONITORING.md](docs/ERROR_MONITORING.md).
