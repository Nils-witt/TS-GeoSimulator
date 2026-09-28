import {ConnectorConfig} from '../Types';
import {ApplicationLogger} from '../utils/Logger';
import {AbstractConnector} from './AbstractConnector';
import {ApiConnector} from './ApiConnector';
import {SqliteConnector} from './SqliteConnector';
import {WebSocketConnector} from './WebSocketConnector';

type Data = ConnectorConfig['data'];

const FACTORIES: Record<string, (id: string, data: Data) => AbstractConnector> = {
    WebSocketConnector: (id, data) => new WebSocketConnector(data['url'] as string, data['token'] as string, true, id),
    SqliteConnector: (id, data) => new SqliteConnector(id, data['databasePath'] as string),
    ApiConnector: (id, data) => new ApiConnector(id, data['url'] as string, data['token'] as string),
};

/** Creates and sets up the connector instance for a connector config. Rejects if the setup fails. */
export async function createConnector(conn: ConnectorConfig): Promise<AbstractConnector> {
    const factory = FACTORIES[conn.connector];
    if (!factory) {
        throw new Error(`Unknown connector type: ${conn.connector}`);
    }
    const connector = factory(conn.id, conn.data);
    await connector.setup();
    ApplicationLogger.info(`${conn.connector} "${conn.name}" configured.`, {service: 'createConnector', id: conn.id});
    return connector;
}
