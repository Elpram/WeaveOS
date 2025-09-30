import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';

export interface AppOptions {
  logger?: boolean;
}

const sendJson = (response: ServerResponse, statusCode: number, payload: unknown): void => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(payload));
};

const handleRequest = (request: IncomingMessage, response: ServerResponse): void => {
  const method = (request.method ?? 'GET').toUpperCase();
  const url = request.url ?? '/';

  if (method === 'GET' && url === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  sendJson(response, 404, { status: 'not_found' });
};

export const createAppServer = (_options: AppOptions = {}): Server => {
  const server = createServer((request, response) => {
    try {
      handleRequest(request, response);
    } catch (error) {
      sendJson(response, 500, { status: 'error' });
    }
  });

  return server;
};
