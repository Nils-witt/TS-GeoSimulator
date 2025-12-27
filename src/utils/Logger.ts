import winston, {createLogger, format} from 'winston';
import {getFormattedDate} from "./Helpers";


export const ApplicationLogger = createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: {service: 'user-service'},
    transports: [
        //
        // - Write all logs with importance level of `error` or higher to `error.log`
        //   (i.e., error, fatal, but not other levels)
        //
        new winston.transports.File({filename: 'logs/error.log', level: 'error'}),
        //
        // - Write all logs with importance level of `info` or higher to `combined.log`
        //   (i.e., fatal, error, warn, and info, but not trace)
        //
        new winston.transports.File({filename: 'logs/combined.log'}),
    ],
});



const myFormat = format.printf((info) => {
    const service = info.service as string || 'General';
    return `${getFormattedDate()} [${info.level.padEnd(6, ' ')}] [${service.padEnd(20, ' ')}] ${info.message as string}`;
});


//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== 'production') {
    ApplicationLogger.add(new winston.transports.Console({
        format: myFormat,
        level: 'info',
    }));
}