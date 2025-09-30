const assert = require('node:assert');
const { describe, it } = require('node:test');
const { createAppServer } = require('../../dist/app.js');

describe('Automations API', () => {
  it('should create an automation for a ritual', async () => {
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

      const automationResponse = await fetch(`http://localhost:${port}/automations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ritual_key: 'test-ritual',
          trigger: 'on_run_start',
          call: {
            capability_id: 'notify.send',
            payload_template: {
              message: 'Run started',
              channel: 'slack',
            },
            connection_id: 'conn_123',
            target_id: 'target_456',
          },
        }),
      });

      assert.strictEqual(automationResponse.status, 201);
      const automationData = await automationResponse.json();

      assert.ok(automationData.automation);
      assert.ok(automationData.automation.automation_id);
      assert.strictEqual(automationData.automation.ritual_key, 'test-ritual');
      assert.strictEqual(automationData.automation.trigger, 'on_run_start');
      assert.strictEqual(automationData.automation.call.capability_id, 'notify.send');
      assert.strictEqual(automationData.automation.call.connection_id, 'conn_123');
      assert.strictEqual(automationData.automation.call.target_id, 'target_456');
      assert.ok(automationData.automation.call.payload_template);
      assert.strictEqual(automationData.automation.call.payload_template.message, 'Run started');
    } finally {
      server.close();
    }
  });

  it('should create a global automation without ritual_key', async () => {
    const server = createAppServer();
    const port = await new Promise((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        resolve(address.port);
      });
    });

    try {
      const automationResponse = await fetch(`http://localhost:${port}/automations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          trigger: 'on_attention_resolved',
          call: {
            capability_id: 'log.event',
            payload_template: {
              event: 'attention_resolved',
            },
          },
        }),
      });

      assert.strictEqual(automationResponse.status, 201);
      const automationData = await automationResponse.json();

      assert.ok(automationData.automation);
      assert.ok(automationData.automation.automation_id);
      assert.strictEqual(automationData.automation.ritual_key, undefined);
      assert.strictEqual(automationData.automation.trigger, 'on_attention_resolved');
    } finally {
      server.close();
    }
  });

  it('should return 404 for non-existent ritual', async () => {
    const server = createAppServer();
    const port = await new Promise((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        resolve(address.port);
      });
    });

    try {
      const automationResponse = await fetch(`http://localhost:${port}/automations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ritual_key: 'non-existent',
          trigger: 'on_run_start',
          call: {
            capability_id: 'test.capability',
            payload_template: {},
          },
        }),
      });

      assert.strictEqual(automationResponse.status, 404);
      const data = await automationResponse.json();
      assert.strictEqual(data.error, 'ritual_not_found');
    } finally {
      server.close();
    }
  });

  it('should return 400 for invalid trigger type', async () => {
    const server = createAppServer();
    const port = await new Promise((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        resolve(address.port);
      });
    });

    try {
      const automationResponse = await fetch(`http://localhost:${port}/automations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          trigger: 'invalid_trigger',
          call: {
            capability_id: 'test.capability',
            payload_template: {},
          },
        }),
      });

      assert.strictEqual(automationResponse.status, 400);
      const data = await automationResponse.json();
      assert.strictEqual(data.error, 'invalid_trigger_type');
    } finally {
      server.close();
    }
  });

  it('should return 400 when call is missing', async () => {
    const server = createAppServer();
    const port = await new Promise((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        resolve(address.port);
      });
    });

    try {
      const automationResponse = await fetch(`http://localhost:${port}/automations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          trigger: 'on_run_start',
        }),
      });

      assert.strictEqual(automationResponse.status, 400);
      const data = await automationResponse.json();
      assert.strictEqual(data.error, 'call_required');
    } finally {
      server.close();
    }
  });
});

describe('Invocations API', () => {
  it('should request an invocation URL', async () => {
    const server = createAppServer();
    const port = await new Promise((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        resolve(address.port);
      });
    });

    try {
      const invocationResponse = await fetch(`http://localhost:${port}/invocations/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          capability_id: 'roomba.start',
          payload: {
            room: 'living_room',
            mode: 'deep_clean',
          },
        }),
      });

      assert.strictEqual(invocationResponse.status, 200);
      const invocationData = await invocationResponse.json();

      assert.ok(invocationData.invocation_id);
      assert.ok(invocationData.invocation_url);
      assert.ok(invocationData.idempotency_key);
      assert.strictEqual(invocationData.capability_id, 'roomba.start');
      assert.strictEqual(invocationData.status, 'pending');
      assert.ok(invocationData.invocation_url.includes(invocationData.invocation_id));
    } finally {
      server.close();
    }
  });

  it('should return 400 when capability_id is missing', async () => {
    const server = createAppServer();
    const port = await new Promise((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        resolve(address.port);
      });
    });

    try {
      const invocationResponse = await fetch(`http://localhost:${port}/invocations/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          payload: {
            test: 'data',
          },
        }),
      });

      assert.strictEqual(invocationResponse.status, 400);
      const data = await invocationResponse.json();
      assert.strictEqual(data.error, 'capability_id_required');
    } finally {
      server.close();
    }
  });

  it('should return 400 when payload is missing', async () => {
    const server = createAppServer();
    const port = await new Promise((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        resolve(address.port);
      });
    });

    try {
      const invocationResponse = await fetch(`http://localhost:${port}/invocations/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          capability_id: 'test.capability',
        }),
      });

      assert.strictEqual(invocationResponse.status, 400);
      const data = await invocationResponse.json();
      assert.strictEqual(data.error, 'payload_must_be_object');
    } finally {
      server.close();
    }
  });
});
