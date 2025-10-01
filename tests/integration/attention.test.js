const assert = require('node:assert');
const { describe, it } = require('node:test');
const { createAppServer } = require('../../dist/app.js');

describe('Attention Items API', () => {
  it('should create an attention item for a run', async () => {
    const server = createAppServer();
    const port = await new Promise((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        resolve(address.port);
      });
    });

    try {
      const ritualResponse = await fetch(`http://localhost:${port}/rituals`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ritual_key: 'test-ritual',
          name: 'Test Ritual',
          instant_runs: false,
        }),
      });

      assert.strictEqual(ritualResponse.status, 201);

      const runResponse = await fetch(`http://localhost:${port}/rituals/test-ritual/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(runResponse.status, 201);
      const runData = await runResponse.json();
      const runKey = runData.run.run_key;

      const attentionResponse = await fetch(`http://localhost:${port}/attention`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          run_key: runKey,
          type: 'auth_needed',
          message: 'Need to re-authenticate with service',
        }),
      });

      assert.strictEqual(attentionResponse.status, 201);
      const attentionData = await attentionResponse.json();

      assert.ok(attentionData.attention);
      assert.ok(attentionData.attention.attention_id);
      assert.strictEqual(attentionData.attention.run_key, runKey);
      assert.strictEqual(attentionData.attention.type, 'auth_needed');
      assert.strictEqual(attentionData.attention.message, 'Need to re-authenticate with service');
      assert.strictEqual(attentionData.attention.resolved, false);
      assert.ok(attentionData.attention.created_at);
    } finally {
      server.close();
    }
  });

  it('should list attention items for a run', async () => {
    const server = createAppServer();
    const port = await new Promise((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        resolve(address.port);
      });
    });

    try {
      const ritualResponse = await fetch(`http://localhost:${port}/rituals`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ritual_key: 'test-ritual',
          name: 'Test Ritual',
          instant_runs: false,
        }),
      });

      assert.strictEqual(ritualResponse.status, 201);

      const runResponse = await fetch(`http://localhost:${port}/rituals/test-ritual/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(runResponse.status, 201);
      const runData = await runResponse.json();
      const runKey = runData.run.run_key;

      await fetch(`http://localhost:${port}/attention`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          run_key: runKey,
          type: 'auth_needed',
          message: 'First issue',
        }),
      });

      await fetch(`http://localhost:${port}/attention`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          run_key: runKey,
          type: 'missing_draft',
          message: 'Second issue',
        }),
      });

      const listResponse = await fetch(`http://localhost:${port}/runs/${runKey}/attention`);

      assert.strictEqual(listResponse.status, 200);
      const listData = await listResponse.json();

      assert.ok(listData.attention_items);
      assert.strictEqual(listData.attention_items.length, 2);
      assert.strictEqual(listData.attention_items[0].message, 'Second issue');
      assert.strictEqual(listData.attention_items[1].message, 'First issue');
    } finally {
      server.close();
    }
  });

  it('should return 404 when creating attention for non-existent run', async () => {
    const server = createAppServer();
    const port = await new Promise((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        resolve(address.port);
      });
    });

    try {
      const response = await fetch(`http://localhost:${port}/attention`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          run_key: 'non-existent-run',
          type: 'auth_needed',
          message: 'Test message',
        }),
      });

      assert.strictEqual(response.status, 404);
      const data = await response.json();
      assert.strictEqual(data.error, 'run_not_found');
    } finally {
      server.close();
    }
  });

  it('should return 400 for invalid attention type', async () => {
    const server = createAppServer();
    const port = await new Promise((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        resolve(address.port);
      });
    });

    try {
      const ritualResponse = await fetch(`http://localhost:${port}/rituals`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ritual_key: 'test-ritual',
          name: 'Test Ritual',
          instant_runs: false,
        }),
      });

      assert.strictEqual(ritualResponse.status, 201);

      const runResponse = await fetch(`http://localhost:${port}/rituals/test-ritual/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(runResponse.status, 201);
      const runData = await runResponse.json();
      const runKey = runData.run.run_key;

      const response = await fetch(`http://localhost:${port}/attention`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          run_key: runKey,
          type: 'invalid_type',
          message: 'Test message',
        }),
      });

      assert.strictEqual(response.status, 400);
      const data = await response.json();
      assert.strictEqual(data.error, 'invalid_attention_type');
    } finally {
      server.close();
    }
  });

  it('should resolve an attention item and log the event', async () => {
    const server = createAppServer();
    const port = await new Promise((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        resolve(address.port);
      });
    });

    try {
      const ritualResponse = await fetch(`http://localhost:${port}/rituals`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ritual_key: 'test-ritual',
          name: 'Test Ritual',
          instant_runs: false,
        }),
      });

      assert.strictEqual(ritualResponse.status, 201);

      const runResponse = await fetch(`http://localhost:${port}/rituals/test-ritual/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(runResponse.status, 201);
      const runData = await runResponse.json();
      const runKey = runData.run.run_key;

      const attentionResponse = await fetch(`http://localhost:${port}/attention`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          run_key: runKey,
          type: 'auth_needed',
          message: 'Need to re-authenticate',
        }),
      });

      assert.strictEqual(attentionResponse.status, 201);
      const attentionData = await attentionResponse.json();
      const attentionId = attentionData.attention.attention_id;

      const resolveResponse = await fetch(`http://localhost:${port}/attention/${attentionId}/resolve`, {
        method: 'POST',
        headers: { 'X-Household-Role': 'Owner' },
      });

      assert.strictEqual(resolveResponse.status, 200);
      const resolveData = await resolveResponse.json();

      assert.ok(resolveData.attention);
      assert.strictEqual(resolveData.attention.resolved, true);
      assert.ok(resolveData.attention.resolved_at);

      const ritualFetchResponse = await fetch(`http://localhost:${port}/rituals/test-ritual`);
      const ritualFetchData = await ritualFetchResponse.json();
      const run = ritualFetchData.ritual.runs.find((r) => r.run_key === runKey);

      assert.ok(run);
      assert.ok(run.activity_log);
      assert.strictEqual(run.activity_log.length, 1);
      assert.strictEqual(run.activity_log[0].event, 'on_attention_resolved');
      assert.ok(run.activity_log[0].message.includes('auth_needed'));
      assert.ok(run.activity_log[0].metadata);
      assert.strictEqual(run.activity_log[0].metadata.attention_id, attentionId);
    } finally {
      server.close();
    }
  });

  it('should return the same resolution when retried with the same idempotency key', async () => {
    const server = createAppServer();
    const port = await new Promise((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        resolve(address.port);
      });
    });

    try {
      const ritualResponse = await fetch(`http://localhost:${port}/rituals`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ritual_key: 'idem-ritual',
          name: 'Idempotent Ritual',
          instant_runs: false,
        }),
      });

      assert.strictEqual(ritualResponse.status, 201);

      const runResponse = await fetch(`http://localhost:${port}/rituals/idem-ritual/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(runResponse.status, 201);
      const runData = await runResponse.json();
      const runKey = runData.run.run_key;

      const attentionResponse = await fetch(`http://localhost:${port}/attention`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          run_key: runKey,
          type: 'auth_needed',
          message: 'Needs confirmation',
        }),
      });

      assert.strictEqual(attentionResponse.status, 201);
      const attentionData = await attentionResponse.json();
      const attentionId = attentionData.attention.attention_id;

      const idempotencyKey = 'resolve-idem-123';

      const firstResolve = await fetch(`http://localhost:${port}/attention/${attentionId}/resolve`, {
        method: 'POST',
        headers: {
          'X-Household-Role': 'Owner',
          'Idempotency-Key': idempotencyKey,
        },
      });

      assert.strictEqual(firstResolve.status, 200);
      const firstPayload = await firstResolve.json();

      const secondResolve = await fetch(`http://localhost:${port}/attention/${attentionId}/resolve`, {
        method: 'POST',
        headers: {
          'X-Household-Role': 'Owner',
          'Idempotency-Key': idempotencyKey,
        },
      });

      assert.strictEqual(secondResolve.status, 200);
      const secondPayload = await secondResolve.json();

      assert.deepStrictEqual(secondPayload, firstPayload);
    } finally {
      server.close();
    }
  });

  it('should forbid non-owners from resolving auth_needed attention items', async () => {
    const server = createAppServer();
    const port = await new Promise((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        resolve(address.port);
      });
    });

    try {
      const ritualResponse = await fetch(`http://localhost:${port}/rituals`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ritual_key: 'policy-ritual',
          name: 'Policy Ritual',
          instant_runs: false,
        }),
      });

      assert.strictEqual(ritualResponse.status, 201);

      const runResponse = await fetch(`http://localhost:${port}/rituals/policy-ritual/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(runResponse.status, 201);
      const runData = await runResponse.json();
      const runKey = runData.run.run_key;

      const attentionResponse = await fetch(`http://localhost:${port}/attention`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          run_key: runKey,
          type: 'auth_needed',
          message: 'Needs owner action',
        }),
      });

      assert.strictEqual(attentionResponse.status, 201);
      const attentionData = await attentionResponse.json();
      const attentionId = attentionData.attention.attention_id;

      const resolveResponse = await fetch(`http://localhost:${port}/attention/${attentionId}/resolve`, {
        method: 'POST',
        headers: { 'X-Household-Role': 'Adult' },
      });

      assert.strictEqual(resolveResponse.status, 403);
      const resolveData = await resolveResponse.json();
      assert.strictEqual(resolveData.error, 'forbidden_for_role');
    } finally {
      server.close();
    }
  });

  it('should return 404 when resolving non-existent attention item', async () => {
    const server = createAppServer();
    const port = await new Promise((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        resolve(address.port);
      });
    });

    try {
      const response = await fetch(`http://localhost:${port}/attention/non-existent/resolve`, {
        method: 'POST',
        headers: { 'X-Household-Role': 'Owner' },
      });

      assert.strictEqual(response.status, 404);
      const data = await response.json();
      assert.strictEqual(data.error, 'attention_item_not_found');
    } finally {
      server.close();
    }
  });

  it('should return 409 when resolving already resolved attention item', async () => {
    const server = createAppServer();
    const port = await new Promise((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        resolve(address.port);
      });
    });

    try {
      const ritualResponse = await fetch(`http://localhost:${port}/rituals`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ritual_key: 'test-ritual',
          name: 'Test Ritual',
          instant_runs: false,
        }),
      });

      assert.strictEqual(ritualResponse.status, 201);

      const runResponse = await fetch(`http://localhost:${port}/rituals/test-ritual/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.strictEqual(runResponse.status, 201);
      const runData = await runResponse.json();
      const runKey = runData.run.run_key;

      const attentionResponse = await fetch(`http://localhost:${port}/attention`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          run_key: runKey,
          type: 'auth_needed',
          message: 'Test',
        }),
      });

      assert.strictEqual(attentionResponse.status, 201);
      const attentionData = await attentionResponse.json();
      const attentionId = attentionData.attention.attention_id;

      const firstResolve = await fetch(`http://localhost:${port}/attention/${attentionId}/resolve`, {
        method: 'POST',
        headers: { 'X-Household-Role': 'Owner' },
      });

      assert.strictEqual(firstResolve.status, 200);

      const secondResolve = await fetch(`http://localhost:${port}/attention/${attentionId}/resolve`, {
        method: 'POST',
        headers: { 'X-Household-Role': 'Owner' },
      });

      assert.strictEqual(secondResolve.status, 409);
      const data = await secondResolve.json();
      assert.strictEqual(data.error, 'attention_already_resolved');
    } finally {
      server.close();
    }
  });
});
