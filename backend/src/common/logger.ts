import { format, transports } from 'winston';
import type { LoggerOptions } from 'winston';

export function createLoggerOptions(): LoggerOptions {
  return {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: format.combine(format.timestamp(), format.json()),
    transports: [new transports.Console()],
  };
}
