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

const startServer = async () => {
  const server = createAppServer();
  await listen(server, { port: 0, host: '127.0.0.1' });
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'server should have an address after listen');
  return { server, baseUrl: `http://${address.address}:${address.port}` };
};

test('GET /runs/{run_id}/artifacts returns 501 not implemented', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const createRitualResponse = await fetch(`${baseUrl}/rituals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ritual_key: 'artifact-test', name: 'Artifact Test' }),
    });
    assert.equal(createRitualResponse.status, 201);

    const createRunResponse = await fetch(`${baseUrl}/rituals/artifact-test/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(createRunResponse.status, 201);
    const { run } = await createRunResponse.json();
    assert.ok(run?.run_key, 'expected a run_key in the response');

    const response = await fetch(`${baseUrl}/runs/${encodeURIComponent(run.run_key)}/artifacts`);
    assert.equal(response.status, 501);
    const payload = await response.json();
    assert.deepEqual(payload, { error: 'not_implemented' });
  } finally {
    await close(server);
  }
});

test('POST /artifacts returns 501 not implemented', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/artifacts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context: 'run', run_key: 'sample', type: 'note' }),
    });
    assert.equal(response.status, 501);
    const payload = await response.json();
    assert.deepEqual(payload, { error: 'not_implemented' });
  } finally {
    await close(server);
  }
});
