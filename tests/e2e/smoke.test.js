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

test('household ritual smoke test', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const ritualRequest = {
      ritual_key: 'trash-day',
      name: 'Trash day',
      instant_runs: true,
      cadence: 'Fridays 7am',
      inputs: [
        {
          type: 'external_link',
          value: 'https://city.local/trash-schedule',
          label: 'City trash pickup schedule',
        },
      ],
    };

    const createRitualResponse = await fetch(`${baseUrl}/rituals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ritualRequest),
    });
    assert.equal(createRitualResponse.status, 201, 'ritual creation should succeed');
    const { ritual } = await createRitualResponse.json();
    assert.equal(ritual.ritual_key, ritualRequest.ritual_key);
    assert.equal(ritual.instant_runs, true);
    assert.equal(ritual.cadence, ritualRequest.cadence);

    const createRunResponse = await fetch(`${baseUrl}/rituals/${ritual.ritual_key}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(createRunResponse.status, 201, 'run creation should succeed');
    const { run } = await createRunResponse.json();
    assert.equal(run.ritual_key, ritual.ritual_key);
    assert.equal(run.status, 'complete', 'instant run should auto-complete');

    const runDetailsResponse = await fetch(`${baseUrl}/runs/${encodeURIComponent(run.run_key)}`);
    assert.equal(runDetailsResponse.status, 200, 'run details should be fetchable');
    const runDetails = await runDetailsResponse.json();
    assert.equal(runDetails.run.status, 'complete');
    assert.equal(runDetails.ritual.ritual_key, ritual.ritual_key);
    assert.equal(runDetails.ritual.cadence, ritualRequest.cadence);
    assert.deepEqual(runDetails.run.inputs, ritualRequest.inputs);
    assert.ok(Array.isArray(runDetails.next_triggers));
    assert.ok(
      runDetails.next_triggers.some((trigger) => trigger.event === 'on_run_complete'),
      'completed run should surface a wrap-up trigger',
    );

    const invocationRequest = {
      capability_id: 'notify.trash-reminder',
      payload: {
        ritual_key: ritual.ritual_key,
        run_key: run.run_key,
        summary: 'Trash day ritual completed',
      },
    };

    const invocationResponse = await fetch(`${baseUrl}/invocations/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(invocationRequest),
    });
    assert.equal(invocationResponse.status, 200, 'invocation request should return a mock URL');
    const invocation = await invocationResponse.json();
    assert.equal(invocation.capability_id, invocationRequest.capability_id);
    assert.equal(invocation.status, 'pending');
    assert.ok(invocation.invocation_id.startsWith('inv_'));
    assert.ok(invocation.idempotency_key.startsWith('idem_'));
    assert.ok(invocation.invocation_url.startsWith('https://api.example.com/v1/invocations/'));
  } finally {
    await close(server);
  }
});
