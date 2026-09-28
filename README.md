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

Web UI

While the simulator runs, a web UI is served at http://127.0.0.1:8080/. It shows every vehicle's live position,
status and current route on a map, plus a per-vehicle history of status changes, routes and positions. The
history is stored in SQLite (same tables as the `SqliteConnector`), so it survives restarts. Configure it via `.env`:

- `WEBUI_ENABLED` (default `true`)
- `WEBUI_HOST` (default `127.0.0.1`; use `0.0.0.0` to expose it on the network, there is no authentication)
- `WEBUI_PORT` (default `8080`)
- `WEBUI_DB_PATH` (default `./data/webui.sqlite`)

JSON endpoints: `GET /api/vehicles`, `GET /api/vehicles/:id`, `GET /api/vehicles/:id/history`, and a
Server-Sent-Events stream at `GET /api/events`.
