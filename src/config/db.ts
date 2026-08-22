import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

const isDev = process.env.NODE_ENV !== 'production';

export const prisma = new PrismaClient({
  log: isDev
    ? [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ]
    : [{ emit: 'event', level: 'error' }],
});

if (isDev) {
  // @ts-ignore
  prisma.$on('query', (e: any) => {
    const isLockQuery = e.query.includes('FOR UPDATE');
    const isBoilerplate = e.query.startsWith('COMMIT') || e.query.startsWith('BEGIN') || e.query.startsWith('DEALLOCATE');
    const isSlow = e.duration > 300;

    if (isLockQuery || (isSlow && !isBoilerplate)) {
      logger.race(`Prisma Query: ${e.query.slice(0, 150)}...`, {
        durationMs: e.duration,
        params: e.params,
      });
    }
  });

  // @ts-ignore
  prisma.$on('warn', (e: any) => {
    logger.warn(`Prisma Warning: ${e.message}`);
  });
}

// @ts-ignore
prisma.$on('error', (e: any) => {
  logger.error(`Prisma DB Error: ${e.message}`);
});
