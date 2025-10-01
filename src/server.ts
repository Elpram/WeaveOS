import { createAppServer, createConsoleLogger } from './app';

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '0.0.0.0';

const port = Number.parseInt(process.env.PORT ?? `${DEFAULT_PORT}`, 10);
const host = process.env.HOST ?? DEFAULT_HOST;

const logger = createConsoleLogger();
const server = createAppServer({ logger });

server.listen({ port, host }, () => {
  logger.info({
    event: 'server.start',
    status: 'listening',
    meta: { port, host },
  });
});

server.on('error', (error) => {
  logger.error({ event: 'server.start', status: 'error', error });
  process.exit(1);
});
