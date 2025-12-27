import winston, {createLogger, format} from 'winston';
import {getFormattedDate} from "./Helpers";

const myFormat = format.printf((info) => {
    const service = info.service as string || 'General';
    const id = info.id as string || 'N/A';
    return `${getFormattedDate()} [${info.level.padEnd(6, ' ')}] [${service.padEnd(20, ' ')}] [${id.padEnd(36, ' ')}] ${info.message as string}`;
});

export const ApplicationLogger = createLogger({
    level: 'info',
    format: myFormat,
    defaultMeta: {service: 'user-service'},
    transports: [
        new winston.transports.File({filename: 'logs/error.log', level: 'error'}),
        new winston.transports.File({filename: 'logs/combined.log'}),
    ],
});

//
// If we're not in production then log to the `console`
//
if (process.env.NODE_ENV !== 'production') {
    ApplicationLogger.add(new winston.transports.Console({
        format: myFormat,
        level: 'info',
    }));
}