const test = require('node:test');
const assert = require('node:assert/strict');
const { __testing } = require('../../dist/app.js');

test('createRunRecord creates planned runs for scheduled rituals', () => {
  const state = __testing.createInitialState();
  const ritual = __testing.createRitualRecord(
    state,
    {
      ritual_key: 'grocery-run',
      name: 'Saturday Groceries',
      instant_runs: false,
      inputs: [{ type: 'external_link', value: 'https://grocer.local/list' }],
    },
    () => new Date('2024-06-03T10:00:00.000Z'),
  );

  const run = __testing.createRunRecord(
    state,
    ritual,
    { runKey: 'run-grocery', now: () => new Date('2024-06-03T11:00:00.000Z') },
  );

  assert.equal(run.status, 'planned');
  assert.equal(run.created_at, '2024-06-03T11:00:00.000Z');
  assert.equal(run.updated_at, '2024-06-03T11:00:00.000Z');
  assert.equal(state.runs.get('run-grocery'), run);
  assert.equal(ritual.runs.length, 1);
  assert.equal(ritual.runs[0], run);
  assert.notStrictEqual(run.inputs[0], ritual.inputs[0]);

  run.inputs[0].value = 'https://grocer.local/updated-list';
  assert.equal(ritual.inputs[0].value, 'https://grocer.local/list');
});

test('createRunRecord completes instant runs immediately', () => {
  const state = __testing.createInitialState();
  const ritual = __testing.createRitualRecord(
    state,
    {
      ritual_key: 'take-meds',
      name: 'Take Morning Medication',
      instant_runs: true,
      inputs: [],
    },
    () => new Date('2024-06-04T06:55:00.000Z'),
  );

  const run = __testing.createRunRecord(state, ritual, {
    runKey: 'run-meds',
    now: () => new Date('2024-06-04T07:00:00.000Z'),
    completionTime: () => new Date('2024-06-04T07:00:05.000Z'),
  });

  assert.equal(run.status, 'complete');
  assert.equal(run.created_at, '2024-06-04T07:00:00.000Z');
  assert.equal(run.updated_at, '2024-06-04T07:00:05.000Z');
  assert.equal(ritual.updated_at, '2024-06-04T07:00:05.000Z');
});

test('buildNextTriggers reflects run status transitions', () => {
  const state = __testing.createInitialState();
  const ritual = __testing.createRitualRecord(
    state,
    {
      ritual_key: 'weekly-planning',
      name: 'Weekly Planning',
      instant_runs: false,
      inputs: [],
    },
  );

  const run = __testing.createRunRecord(state, ritual, { runKey: 'run-plan' });

  const plannedTriggers = __testing.buildNextTriggers(run);
  assert.equal(plannedTriggers.length, 3);
  assert.equal(plannedTriggers[0].status, 'active');
  assert.equal(plannedTriggers[plannedTriggers.length - 1].event, 'on_run_start');

  run.status = 'in_progress';
  const inProgressTriggers = __testing.buildNextTriggers(run);
  assert.equal(inProgressTriggers.length, 2);
  assert.equal(inProgressTriggers[0].event, 'on_run_start');
  assert.equal(inProgressTriggers[0].status, 'active');

  run.status = 'complete';
  const completeTriggers = __testing.buildNextTriggers(run);
  assert.equal(completeTriggers.length, 1);
  assert.equal(completeTriggers[0].event, 'on_run_complete');
  assert.equal(completeTriggers[0].status, 'complete');
});
