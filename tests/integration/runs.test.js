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

test('GET /runs/{run_id} returns run details with attention and triggers', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const ritualPayload = {
      ritual_key: 'laundry-day',
      name: 'Laundry day Saturday 9am',
      instant_runs: false,
      inputs: [
        {
          type: 'external_link',
          value: 'https://household.local/laundry-guide',
          label: 'Laundry guide',
        },
      ],
    };

    const createRitualResponse = await fetch(`${baseUrl}/rituals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ritualPayload),
    });
    assert.equal(createRitualResponse.status, 201);

    const createRunResponse = await fetch(`${baseUrl}/rituals/${ritualPayload.ritual_key}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(createRunResponse.status, 201);
    const createRunBody = await createRunResponse.json();
    const { run } = createRunBody;
    assert.ok(run?.run_key, 'run should include a run_key');

    const initialGetResponse = await fetch(`${baseUrl}/runs/${encodeURIComponent(run.run_key)}`);
    assert.equal(initialGetResponse.status, 200);
    const initialPayload = await initialGetResponse.json();

    assert.equal(initialPayload.run.run_key, run.run_key);
    assert.equal(initialPayload.ritual.ritual_key, ritualPayload.ritual_key);
    assert.ok(Array.isArray(initialPayload.next_triggers));
    assert.ok(initialPayload.next_triggers.length > 0, 'next_triggers should include mock entries');
    assert.deepEqual(initialPayload.run.inputs, ritualPayload.inputs);
    assert.deepEqual(initialPayload.attention_items, []);

    const attentionRequest = {
      run_key: run.run_key,
      type: 'auth_needed',
      message: 'Re-authenticate the washer app',
    };

    const createAttentionResponse = await fetch(`${baseUrl}/attention`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(attentionRequest),
    });
    assert.equal(createAttentionResponse.status, 201);
    const attentionBody = await createAttentionResponse.json();
    const attentionId = attentionBody.attention.attention_id;
    assert.ok(attentionId);

    const getAfterAttention = await fetch(`${baseUrl}/runs/${encodeURIComponent(run.run_key)}`);
    assert.equal(getAfterAttention.status, 200);
    const attentionPayload = await getAfterAttention.json();
    assert.equal(attentionPayload.attention_items.length, 1);
    assert.equal(attentionPayload.attention_items[0].attention_id, attentionId);
    assert.equal(attentionPayload.attention_items[0].resolved, false);

    const resolveResponse = await fetch(`${baseUrl}/attention/${encodeURIComponent(attentionId)}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(resolveResponse.status, 200);

    const getAfterResolve = await fetch(`${baseUrl}/runs/${encodeURIComponent(run.run_key)}`);
    assert.equal(getAfterResolve.status, 200);
    const resolvedPayload = await getAfterResolve.json();
    assert.equal(resolvedPayload.attention_items.length, 1);
    assert.equal(resolvedPayload.attention_items[0].resolved, true);
    assert.ok(Array.isArray(resolvedPayload.run.activity_log));
    assert.ok(
      resolvedPayload.run.activity_log.some((entry) => entry.event === 'on_attention_resolved'),
      'activity log should include resolution entry',
    );
  } finally {
    await close(server);
  }
});

test('GET /runs/{run_id} returns 404 for unknown run', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/runs/non-existent-run`);
    assert.equal(response.status, 404);
  } finally {
    await close(server);
  }
});
