import crypto from 'crypto';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'RACE';

interface LogContext {
  reqId?: string | undefined;
  durationMs?: number | undefined;
  [key: string]: any;
}

const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

const getTimestamp = (): string => {
  const d = new Date();
  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

const formatMessage = (level: LogLevel, message: string, context?: LogContext): string => {
  const time = getTimestamp();
  const reqIdPart = context?.reqId ? ` [${colors.cyan}${context.reqId.slice(0, 8)}${colors.reset}]` : '';
  const durationPart = context?.durationMs !== undefined ? ` (${colors.yellow}${context.durationMs}ms${colors.reset})` : '';

  let levelColor = colors.green;
  if (level === 'DEBUG') levelColor = colors.dim;
  if (level === 'WARN') levelColor = colors.yellow;
  if (level === 'ERROR') levelColor = colors.red;
  if (level === 'RACE') levelColor = `${colors.magenta}${colors.bright}`;

  const restContext = { ...context };
  delete restContext.reqId;
  delete restContext.durationMs;
  const hasExtra = Object.keys(restContext).length > 0;
  const extraPart = hasExtra ? ` ${colors.dim}${JSON.stringify(restContext)}${colors.reset}` : '';

  return `${colors.dim}[${time}]${colors.reset} ${levelColor}[${level}]${colors.reset}${reqIdPart} ${message}${durationPart}${extraPart}`;
};

export const logger = {
  debug: (message: string, context?: LogContext) => {
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG) {
      console.log(formatMessage('DEBUG', message, context));
    }
  },
  info: (message: string, context?: LogContext) => {
    console.log(formatMessage('INFO', message, context));
  },
  warn: (message: string, context?: LogContext) => {
    console.warn(formatMessage('WARN', message, context));
  },
  error: (message: string, error?: any, context?: LogContext) => {
    const errorMsg = error instanceof Error ? `${error.message}\n${error.stack}` : error ? String(error) : '';
    console.error(formatMessage('ERROR', `${message} ${errorMsg}`, context));
  },
  race: (message: string, context?: LogContext) => {
    console.log(formatMessage('RACE', `⚡ [CONCURRENCY] ${message}`, context));
  },
};
