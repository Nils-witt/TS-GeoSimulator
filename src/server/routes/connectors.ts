/*
 * connectors.ts
 * -------------
 * GET    /api/connectors       stored config of all connectors
 * GET    /api/connectors/types required data fields per connector type
 * POST   /api/connectors       create a connector and start it
 * GET    /api/connectors/:id   stored config of one connector
 * PUT    /api/connectors/:id   replace a connector's config and restart it with its vehicles
 * DELETE /api/connectors/:id   stop a connector, delete it and remove it from all vehicles
 *
 * The new connector instance is set up before anything is stored, so a connector that cannot be set up
 * (e.g. an unreachable API) is rejected with 502 and the previous state is kept.
 */

import {randomUUID, UUID} from 'node:crypto';
import {Response, Router} from 'express';
import {GeoSimulator} from '../../GeoSimulator';
import {ConfigStore} from '../../config/ConfigStore';
import {CONNECTOR_TYPES, isUuid, validateConnector} from '../../config/validation';
import {createConnector} from '../../connectors/createConnector';
import {ConnectorConfig} from '../../Types';
import {AbstractConnector} from '../../connectors/AbstractConnector';

export function connectorsRouter(geoSimulator: GeoSimulator, configStore: ConfigStore): Router {
    const router = Router();

    /** Validates a request body and checks that its name is not used by another connector. */
    async function checkBody(body: unknown, ownId?: string): Promise<string[]> {
        const errors = validateConnector(body);
        const name = (body as {name?: unknown} | undefined)?.name;
        const connectors = await configStore.listConnectors();
        if (connectors.some((c) => c.name === name && c.id !== ownId)) {
            errors.push(`Connector: name "${String(name)}" is already taken.`);
        }
        return errors;
    }

    function toConfig(id: UUID, body: ConnectorConfig): ConnectorConfig {
        return {id, name: body.name, connector: body.connector, data: body.data};
    }

    /** Sets up the connector instance; on failure answers 502 and returns null. */
    async function start(config: ConnectorConfig, res: Response): Promise<AbstractConnector | null> {
        try {
            return await createConnector(config);
        } catch (e) {
            res.status(502).json({error: `Could not set up connector: ${e instanceof Error ? e.message : e}`});
            return null;
        }
    }

    /** Stores the config via `persist`, disconnecting the fresh instance again if that fails. */
    async function persist(instance: AbstractConnector, fn: () => Promise<unknown>): Promise<void> {
        try {
            await fn();
        } catch (e) {
            instance.disconnect();
            throw e;
        }
    }

    router.get('/', async (_req, res) => {
        res.json(await configStore.listConnectors());
    });

    router.get('/types', (_req, res) => {
        res.json(CONNECTOR_TYPES);
    });

    router.post('/', async (req, res) => {
        const errors = await checkBody(req.body);
        const id = req.body?.id ?? randomUUID();
        if (!isUuid(id)) {
            errors.push('Connector: ID must be a UUID.');
        } else if (await configStore.getConnector(id)) {
            errors.push(`Connector: ID "${id}" is already taken.`);
        }
        if (errors.length > 0) {
            res.status(400).json({error: 'Invalid connector', details: errors});
            return;
        }
        const config = toConfig(id as UUID, req.body);
        const instance = await start(config, res);
        if (!instance) {
            return;
        }
        await persist(instance, () => configStore.createConnector(config));
        geoSimulator.replaceConnector(instance, []);
        res.status(201).location(`${req.baseUrl}/${id}`).json(config);
    });

    router.get('/:id', async (req, res) => {
        const config = await configStore.getConnector(req.params.id);
        if (!config) {
            res.status(404).json({error: 'Connector not found'});
            return;
        }
        res.json(config);
    });

    router.put('/:id', async (req, res) => {
        const id = req.params.id;
        if (!(await configStore.getConnector(id))) {
            res.status(404).json({error: 'Connector not found'});
            return;
        }
        const errors = await checkBody(req.body, id);
        if (req.body?.id != null && req.body.id !== id) {
            errors.push('Connector: ID in the body does not match the URL.');
        }
        if (errors.length > 0) {
            res.status(400).json({error: 'Invalid connector', details: errors});
            return;
        }
        const config = toConfig(id as UUID, req.body);
        const instance = await start(config, res);
        if (!instance) {
            return;
        }
        await persist(instance, () => configStore.updateConnector(id, config));
        const vehicleIds = (await configStore.listVehicles())
            .filter((v) => v.enabled && v.connectors.includes(id as UUID))
            .map((v) => v.id);
        geoSimulator.replaceConnector(instance, vehicleIds);
        res.json(config);
    });

    router.delete('/:id', async (req, res) => {
        const deleted = await configStore.deleteConnector(req.params.id);
        const stopped = geoSimulator.removeConnector(req.params.id);
        if (!deleted && !stopped) {
            res.status(404).json({error: 'Connector not found'});
            return;
        }
        res.status(204).end();
    });

    return router;
}
