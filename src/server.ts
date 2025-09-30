import { createAppServer } from './app';

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '0.0.0.0';

const port = Number.parseInt(process.env.PORT ?? `${DEFAULT_PORT}`, 10);
const host = process.env.HOST ?? DEFAULT_HOST;

const server = createAppServer();

server.listen({ port, host }, () => {
  console.log({ event: 'server.start', entity: 'server', status: 'listening', meta: { port, host } });
});

server.on('error', (error) => {
  console.error({ event: 'server.start', entity: 'server', status: 'error', meta: { error } });
  process.exit(1);
});
