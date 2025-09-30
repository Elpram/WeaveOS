const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppServer } = require('../../dist/app.js');

const listen = (server, options) =>
  new Promise((resolve, reject) => {
    server.listen(options, () => resolve(server));
    server.on('error', reject);
  });

const close = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

test('GET /health returns ok', async () => {
  const server = createAppServer();
  await listen(server, { port: 0, host: '127.0.0.1' });
  const address = server.address();
  assert.ok(address, 'server should have an address after listen');

  const url = `http://${address.address}:${address.port}/health`;
  const response = await fetch(url);

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, { status: 'ok' });

  await close(server);
});
