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

Architecture

The application is an Express server (`src/index.ts`) that runs the simulations in-process:

- `src/GeoSimulator.ts` owns the running connectors and vehicles and wires them together.
- `src/config/` stores the config in SQLite (`ConfigStore.ts`) and validates API input (`validation.ts`).
- `src/simulator/` contains the simulators. `RouteSimulator` drives one OSRM route; `RandomRouteSimulator` and
  `EmergencyDispatchSimulator` build on `MultiRouteSimulator`, which chains routes. `createSimulator.ts` maps a
  vehicle config to its simulator.
- `src/connectors/` forwards vehicle updates to external systems; `createConnector.ts` maps a connector config to
  its connector. `LiveStateConnector.ts` is attached to every vehicle. It keeps the live state, stores the history
  in SQLite and publishes updates to the WebSocket (`src/server/websocket.ts`).
- `src/server/app.ts` and `src/server/routes/` define the HTTP API; the web UI is served from `public/`.
- `src/utils/` contains geo math (`Geo.ts`), the event emitter shared by entities and simulators, and logging.

Server settings (`.env`):

- `HOST` (default `127.0.0.1`; use `0.0.0.0` to expose it on the network. There is no authentication, and anyone
  who can open the page can read and change the config, including API tokens.)
- `PORT` (default `8080`)
- `DB_PATH` (default `./data/geosimulator.sqlite`)

Configuration

Connectors and vehicles are stored in the database and edited in the web UI under **Config**. Each change is
applied immediately: only the affected connector or vehicle is restarted. Disabled vehicles are stored but not run.

Web UI

Open http://127.0.0.1:8080/. It shows every vehicle's live position, status and current route on a map, plus a
per-vehicle history of status changes, routes and positions (kept in the database, so it survives restarts).

API

- `GET /api/vehicles`: live state of all running vehicles; `GET /api/vehicles/configs`: stored configs
- `GET /api/vehicles/types`, `GET /api/connectors/types`: required data fields per simulator/connector type
- `POST /api/vehicles`, `GET|PUT|DELETE /api/vehicles/:id`: create, read (live state and config), replace or
  delete a vehicle. Creating or replacing an enabled vehicle (re)starts it
- `GET|DELETE /api/vehicles/:id/history`: stored positions, status changes and routes
- `GET|POST /api/connectors`, `GET|PUT|DELETE /api/connectors/:id`: list, add, read, replace or delete a
  connector. Connectors are identified by a UUID `id` that the server assigns on `POST`; vehicles reference
  connectors by it, and the editable `name` is only a label. A connector that cannot be set up is rejected with
  `502`. Deleting also removes it from all vehicles
- `ws://<host>/api/ws`: WebSocket with live updates as `{"type": ..., "data": ...}` messages, where `type` is
  `position`, `status`, `route` or `reload`. Connections from other websites (foreign `Origin`) are rejected.
