/*
 * websocket.ts
 * ------------
 * WebSocket endpoint for live updates: ws://<host>/api/ws
 * Exports: attachWebSocket
 * Purpose: push every LiveStateConnector update to connected clients as {"type": ..., "data": ...} messages.
 * Types: position, status, route, reload.
 */

import * as http from 'node:http';
import {WebSocket, WebSocketServer} from 'ws';
import {LiveStateConnector} from '../connectors/LiveStateConnector';
import {ApplicationLogger} from '../utils/Logger';

export const WEBSOCKET_PATH = '/api/ws';
const HEARTBEAT_INTERVAL_MS = 30000;

/** Browsers always send Origin; reject pages from other sites. Non-browser clients without Origin are allowed. */
function isSameOrigin(req: http.IncomingMessage): boolean {
    const origin = req.headers.origin;
    if (!origin) {
        return true;
    }
    try {
        return new URL(origin).host === req.headers.host;
    } catch {
        return false;
    }
}

export function attachWebSocket(server: http.Server, liveState: LiveStateConnector): WebSocketServer {
    const wss = new WebSocketServer({noServer: true});
    const alive = new WeakMap<WebSocket, boolean>();

    server.on('upgrade', (req, socket, head) => {
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
        if (pathname !== WEBSOCKET_PATH || !isSameOrigin(req)) {
            socket.destroy();
            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    });

    wss.on('connection', (ws) => {
        alive.set(ws, true);
        ws.on('pong', () => alive.set(ws, true));
        ws.on('error', (e) => {
            ApplicationLogger.warn(`WebSocket client error: ${e}`, {service: 'WebSocket', id: 'Main'});
        });
        // The connection is receive-only for clients; incoming messages are ignored.
        const unsubscribe = liveState.subscribe((type, data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({type, data}));
            }
        });
        ws.on('close', unsubscribe);
    });

    // Drop connections that stopped answering pings (e.g. a laptop that went to sleep).
    const heartbeat = setInterval(() => {
        for (const ws of wss.clients) {
            if (!alive.get(ws)) {
                ws.terminate();
                continue;
            }
            alive.set(ws, false);
            ws.ping();
        }
    }, HEARTBEAT_INTERVAL_MS);
    wss.on('close', () => clearInterval(heartbeat));

    return wss;
}
