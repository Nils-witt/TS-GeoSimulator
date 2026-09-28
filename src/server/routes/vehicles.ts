/*
 * vehicles.ts
 * -----------
 * GET    /api/vehicles               live state of all running vehicles
 * GET    /api/vehicles/configs       stored config of all vehicles, including disabled ones
 * GET    /api/vehicles/types         required position fields per simulator type
 * POST   /api/vehicles               create a vehicle (stored config) and start it if enabled
 * GET    /api/vehicles/:id           live state and stored config of one vehicle
 * PUT    /api/vehicles/:id           replace a vehicle's config and restart it
 * DELETE /api/vehicles/:id           stop a vehicle and delete its config
 * GET    /api/vehicles/:id/history   stored positions, status changes and routes of one vehicle
 * DELETE /api/vehicles/:id/history   delete the stored history of one vehicle
 */

import {randomUUID, UUID} from 'node:crypto';
import {Router} from 'express';
import {GeoSimulator} from '../../GeoSimulator';
import {ConfigStore} from '../../config/ConfigStore';
import {isUuid, SIMULATOR_TYPES, validateVehicle} from '../../config/validation';
import {VehicleConfig} from '../../Types';

export function vehiclesRouter(geoSimulator: GeoSimulator, configStore: ConfigStore): Router {
    const router = Router();
    const liveState = geoSimulator.getLiveState();

    /** Validates a request body against the stored connectors and the names of the other vehicles. */
    async function checkBody(body: unknown, ownId?: string): Promise<string[]> {
        const connectorIds = new Set((await configStore.listConnectors()).map((c) => c.id));
        const errors = validateVehicle(body, connectorIds);
        const name = (body as {name?: unknown} | undefined)?.name;
        const vehicles = await configStore.listVehicles();
        if (vehicles.some((v) => v.name === name && v.id !== ownId)) {
            errors.push(`Vehicle: name "${String(name)}" is already taken.`);
        }
        return errors;
    }

    function toConfig(id: UUID, body: VehicleConfig): VehicleConfig {
        return {
            id,
            name: body.name,
            enabled: body.enabled,
            simulator: body.simulator,
            data: body.data,
            connectors: body.connectors,
        };
    }

    router.get('/', (_req, res) => {
        res.json(liveState.getVehicles());
    });

    router.get('/configs', async (_req, res) => {
        res.json(await configStore.listVehicles());
    });

    router.get('/types', (_req, res) => {
        res.json(SIMULATOR_TYPES);
    });

    router.post('/', async (req, res) => {
        const errors = await checkBody(req.body);
        const id = req.body?.id ?? randomUUID();
        if (!isUuid(id)) {
            errors.push('Vehicle: ID must be a UUID.');
        } else if (await configStore.getVehicleById(id)) {
            errors.push(`Vehicle: ID "${id}" is already taken.`);
        }
        if (errors.length > 0) {
            res.status(400).json({error: 'Invalid vehicle', details: errors});
            return;
        }
        const config = toConfig(id as UUID, req.body);
        await configStore.createVehicle(config);
        if (config.enabled) {
            await geoSimulator.launchVehicle(config);
        }
        res.status(201).location(`${req.baseUrl}/${id}`).json(config);
    });

    router.get('/:id', async (req, res) => {
        const config = await configStore.getVehicleById(req.params.id);
        const live = liveState.getVehicle(req.params.id);
        if (!config && !live) {
            res.status(404).json({error: 'Vehicle not found'});
            return;
        }
        res.json({...live, config: config ?? null});
    });

    router.put('/:id', async (req, res) => {
        const id = req.params.id;
        if (!(await configStore.getVehicleById(id))) {
            res.status(404).json({error: 'Vehicle not found'});
            return;
        }
        const errors = await checkBody(req.body, id);
        if (req.body?.id != null && req.body.id !== id) {
            errors.push('Vehicle: ID in the body does not match the URL.');
        }
        if (errors.length > 0) {
            res.status(400).json({error: 'Invalid vehicle', details: errors});
            return;
        }
        const config = toConfig(id as UUID, req.body);
        await configStore.updateVehicleById(id, config);
        geoSimulator.removeVehicle(id);
        if (config.enabled) {
            await geoSimulator.launchVehicle(config);
        }
        res.json(config);
    });

    router.delete('/:id', async (req, res) => {
        const deleted = await configStore.deleteVehicleById(req.params.id);
        const stopped = geoSimulator.removeVehicle(req.params.id);
        if (!deleted && !stopped) {
            res.status(404).json({error: 'Vehicle not found'});
            return;
        }
        res.status(204).end();
    });

    router.get('/:id/history', async (req, res) => {
        if (!liveState.getVehicle(req.params.id)) {
            res.status(404).json({error: 'Vehicle not found'});
            return;
        }
        res.json(await liveState.getHistory(req.params.id));
    });

    router.delete('/:id/history', async (req, res) => {
        const id = req.params.id;
        if (!liveState.getVehicle(id) && !(await configStore.getVehicleById(id))) {
            res.status(404).json({error: 'Vehicle not found'});
            return;
        }
        await liveState.clearHistory(id);
        res.status(204).end();
    });

    return router;
}
