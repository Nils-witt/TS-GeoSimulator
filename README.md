# TS GeoSimulator (minimal scaffold)

This is a minimal TypeScript project scaffold.

Quick start

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Run (built):

```bash
npm start
```

Run (dev):

```bash
npm run dev
```

Configuration

Connectors and vehicles are stored in an SQLite database (`DB_PATH`, default `./data/geosimulator.sqlite`) and
edited in the web UI under **Config**. On the first start with an empty database, an existing `config.json`
(`CONFIG_PATH`, default `./data/config.json`) is imported once; afterwards the file is no longer read. Saving the
config in the web UI stores it and restarts all simulations.

Web UI

While the simulator runs, a web UI is served at http://127.0.0.1:8080/. It shows every vehicle's live position,
status and current route on a map, plus a per-vehicle history of status changes, routes and positions. The history
is stored in the same database (same tables as the `SqliteConnector`), so it survives restarts. Configure it via
`.env`:

- `WEBUI_ENABLED` (default `true`)
- `WEBUI_HOST` (default `127.0.0.1`; use `0.0.0.0` to expose it on the network. There is no authentication, and
  anyone who can open the page can read and change the config, including API tokens.)
- `WEBUI_PORT` (default `8080`)

JSON endpoints: `GET /api/vehicles`, `GET /api/vehicles/:id`, `GET /api/vehicles/:id/history`, `GET /api/config`,
`PUT /api/config` (validates, saves and applies), and a Server-Sent-Events stream at `GET /api/events`.
