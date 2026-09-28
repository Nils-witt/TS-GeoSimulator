/*
 * app.ts
 * ------
 * Express application of the simulator.
 * Exports: createApp
 * Purpose: serve the web UI from /public and the JSON API under /api (live updates: see websocket.ts).
 */

import * as path from 'node:path';
import express, {NextFunction, Request, Response} from 'express';
import {GeoSimulator} from '../GeoSimulator';
import {ConfigStore} from '../config/ConfigStore';
import {ApplicationLogger} from '../utils/Logger';
import {connectorsRouter} from './routes/connectors';
import {vehiclesRouter} from './routes/vehicles';

const PUBLIC_DIR = path.resolve(__dirname, '..', '..', 'public');

export function createApp(simulator: GeoSimulator, configStore: ConfigStore): express.Express {
    const app = express();
    app.disable('x-powered-by');

    const api = express.Router();
    api.use(express.json({limit: '1mb'}));
    api.use((_req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });
    api.use('/connectors', connectorsRouter(simulator, configStore));
    api.use('/vehicles', vehiclesRouter(simulator, configStore));
    api.use((_req, res) => {
        res.status(404).json({error: 'Not found'});
    });

    app.use('/api', api);
    app.use(express.static(PUBLIC_DIR));

    // Express needs all four parameters to recognise an error handler.
    app.use((err: Error & {status?: number}, req: Request, res: Response, _next: NextFunction) => {
        const status = err.status ?? 500;
        if (status >= 500) {
            ApplicationLogger.error(`${req.method} ${req.path} failed: ${err.stack ?? err}`, {
                service: 'Server',
                id: 'Main',
            });
        }
        res.status(status).json({error: status >= 500 ? 'Internal server error' : err.message});
    });

    return app;
}
