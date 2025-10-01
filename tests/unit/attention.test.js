const test = require('node:test');
const assert = require('node:assert/strict');
const { __testing } = require('../../dist/app.js');

test('attention items can be created and resolved with activity log entries', () => {
  const state = __testing.createInitialState();
  const ritual = __testing.createRitualRecord(
    state,
    {
      ritual_key: 'holiday-prep',
      name: 'Holiday Prep',
      instant_runs: false,
      inputs: [],
    },
    () => new Date('2024-06-05T08:00:00.000Z'),
  );

  const run = __testing.createRunRecord(
    state,
    ritual,
    { runKey: 'run-holiday', now: () => new Date('2024-06-05T09:00:00.000Z') },
  );

  const attention = __testing.createAttentionItemRecord(
    state,
    run,
    { type: 'auth_needed', message: 'Please re-authenticate with the city portal' },
    () => new Date('2024-06-05T09:30:00.000Z'),
  );

  assert.equal(attention.resolved, false);
  assert.equal(attention.created_at, '2024-06-05T09:30:00.000Z');
  assert.equal(state.attentionItems.get(attention.attention_id), attention);

  const resolved = __testing.resolveAttentionItemRecord(
    state,
    attention,
    () => new Date('2024-06-05T10:00:00.000Z'),
  );

  assert.equal(resolved.resolved, true);
  assert.equal(resolved.resolved_at, '2024-06-05T10:00:00.000Z');
  assert.equal(run.updated_at, '2024-06-05T10:00:00.000Z');
  assert.equal(run.activity_log.length, 1);
  assert.deepEqual(run.activity_log[0], {
    timestamp: '2024-06-05T10:00:00.000Z',
    event: 'on_attention_resolved',
    message: 'Attention item resolved: auth_needed',
    metadata: {
      attention_id: attention.attention_id,
      attention_type: 'auth_needed',
      original_message: 'Please re-authenticate with the city portal',
    },
  });
});
