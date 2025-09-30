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

const isIsoDateString = (value) => {
  if (typeof value !== 'string') {
    return false;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
};

const startServer = async () => {
  const server = createAppServer();
  await listen(server, { port: 0, host: '127.0.0.1' });
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'server should have an address after listen');

  const baseUrl = `http://${address.address}:${address.port}`;
  return { server, baseUrl };
};

test('instant rituals auto-complete runs immediately', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const ritualRequestBody = {
      ritual_key: 'trash-day',
      name: 'Trash day pickup',
      instant_runs: true,
      inputs: [
        {
          type: 'external_link',
          value: 'https://city.local/trash',
          label: 'City schedule',
        },
      ],
    };

    const createResponse = await fetch(`${baseUrl}/rituals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ritualRequestBody),
    });

    assert.equal(createResponse.status, 201);
    const createPayload = await createResponse.json();
    assert.equal(createPayload.ritual.ritual_key, ritualRequestBody.ritual_key);
    assert.equal(createPayload.ritual.name, ritualRequestBody.name);
    assert.equal(createPayload.ritual.instant_runs, ritualRequestBody.instant_runs);
    assert.equal(createPayload.ritual.inputs.length, 1);
    assert.ok(isIsoDateString(createPayload.ritual.created_at));
    assert.ok(isIsoDateString(createPayload.ritual.updated_at));
    assert.deepEqual(createPayload.ritual.runs, []);

    const listResponse = await fetch(`${baseUrl}/rituals`);
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.equal(listPayload.rituals.length, 1);
    assert.equal(listPayload.rituals[0].ritual_key, ritualRequestBody.ritual_key);

    const getResponse = await fetch(`${baseUrl}/rituals/${ritualRequestBody.ritual_key}`);
    assert.equal(getResponse.status, 200);
    const getPayload = await getResponse.json();
    assert.equal(getPayload.ritual.ritual_key, ritualRequestBody.ritual_key);
    assert.deepEqual(getPayload.ritual.runs, []);

    const runResponse = await fetch(`${baseUrl}/rituals/${ritualRequestBody.ritual_key}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(runResponse.status, 201);
    const runPayload = await runResponse.json();
    assert.equal(runPayload.run.ritual_key, ritualRequestBody.ritual_key);
    assert.equal(runPayload.run.status, 'complete');
    assert.ok(isIsoDateString(runPayload.run.run_key));
    assert.ok(isIsoDateString(runPayload.run.created_at));
    assert.ok(isIsoDateString(runPayload.run.updated_at));
    assert.ok(
      Date.parse(runPayload.run.updated_at) >= Date.parse(runPayload.run.created_at),
      'completed runs should not have an updated_at before created_at',
    );

    const ritualAfterRunResponse = await fetch(`${baseUrl}/rituals/${ritualRequestBody.ritual_key}`);
    assert.equal(ritualAfterRunResponse.status, 200);
    const ritualAfterRunPayload = await ritualAfterRunResponse.json();
    assert.equal(ritualAfterRunPayload.ritual.runs.length, 1);
    assert.equal(ritualAfterRunPayload.ritual.runs[0].status, 'complete');
    assert.equal(ritualAfterRunPayload.ritual.runs[0].run_key, runPayload.run.run_key);
  } finally {
    await close(server);
  }
});

test('non-instant rituals create planned runs', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const ritualRequestBody = {
      ritual_key: 'saturday-groceries',
      name: 'Saturday grocery run',
      instant_runs: false,
      inputs: [],
    };

    const createResponse = await fetch(`${baseUrl}/rituals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ritualRequestBody),
    });

    assert.equal(createResponse.status, 201);

    const runResponse = await fetch(`${baseUrl}/rituals/${ritualRequestBody.ritual_key}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });

    assert.equal(runResponse.status, 201);
    const runPayload = await runResponse.json();
    assert.equal(runPayload.run.status, 'planned');
    assert.equal(runPayload.run.ritual_key, ritualRequestBody.ritual_key);
    assert.ok(isIsoDateString(runPayload.run.run_key));
    assert.ok(isIsoDateString(runPayload.run.created_at));
    assert.ok(isIsoDateString(runPayload.run.updated_at));
    assert.equal(runPayload.run.created_at, runPayload.run.updated_at);

    const ritualAfterRunResponse = await fetch(`${baseUrl}/rituals/${ritualRequestBody.ritual_key}`);
    assert.equal(ritualAfterRunResponse.status, 200);
    const ritualAfterRunPayload = await ritualAfterRunResponse.json();
    assert.equal(ritualAfterRunPayload.ritual.runs.length, 1);
    assert.equal(ritualAfterRunPayload.ritual.runs[0].status, 'planned');
  } finally {
    await close(server);
  }
});
