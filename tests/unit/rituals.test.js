const test = require('node:test');
const assert = require('node:assert/strict');
const { __testing } = require('../../dist/app.js');

test('createRitualRecord stores a ritual with cloned inputs and timestamps', () => {
  const state = __testing.createInitialState();
  const inputs = [
    { type: 'external_link', value: 'https://city.local/trash', label: 'City schedule' },
  ];
  const ritual = __testing.createRitualRecord(
    state,
    {
      ritual_key: 'trash-day',
      name: 'Trash Day',
      instant_runs: true,
      cadence: 'Fridays 7am',
      inputs,
    },
    () => new Date('2024-06-01T12:00:00.000Z'),
  );

  assert.equal(state.rituals.size, 1);
  assert.equal(state.rituals.get('trash-day'), ritual);
  assert.equal(ritual.created_at, '2024-06-01T12:00:00.000Z');
  assert.equal(ritual.updated_at, '2024-06-01T12:00:00.000Z');
  assert.deepEqual(ritual.inputs, inputs);
  assert.notStrictEqual(ritual.inputs[0], inputs[0], 'inputs should be cloned for safety');
  inputs[0].value = 'https://city.local/recycling';
  assert.equal(
    ritual.inputs[0].value,
    'https://city.local/trash',
    'mutating the original input should not affect the stored ritual',
  );
  assert.equal(ritual.cadence, 'Fridays 7am');
  assert.deepEqual(ritual.runs, []);
});

test('normalizeRitualForResponse returns deep copies of runs and inputs', () => {
  const state = __testing.createInitialState();
  const ritual = __testing.createRitualRecord(
    state,
    {
      ritual_key: 'weekly-review',
      name: 'Weekly Review',
      instant_runs: false,
      cadence: 'Mondays 8pm',
      inputs: [{ type: 'external_link', value: 'https://family.local/plan' }],
    },
    () => new Date('2024-06-02T09:00:00.000Z'),
  );

  const run = __testing.createRunRecord(
    state,
    ritual,
    { runKey: 'run-123', now: () => new Date('2024-06-02T09:05:00.000Z') },
  );

  const normalized = __testing.normalizeRitualForResponse(ritual);

  assert.notStrictEqual(normalized, ritual);
  assert.notStrictEqual(normalized.inputs[0], ritual.inputs[0]);
  assert.notStrictEqual(normalized.runs[0], ritual.runs[0]);
  assert.equal(normalized.cadence, 'Mondays 8pm');

  normalized.inputs[0].value = 'https://changed.local';
  normalized.runs[0].status = 'complete';
  normalized.runs[0].inputs[0].value = 'https://altered.local';

  assert.equal(ritual.inputs[0].value, 'https://family.local/plan');
  assert.equal(run.status, 'planned');
  assert.equal(run.inputs[0].value, 'https://family.local/plan');
});
