const test = require('node:test');
const assert = require('node:assert/strict');
const { __testing } = require('../../dist/app.js');

const createCapturingLogger = () => {
  const entries = [];
  return {
    logger: {
      info: (entry) => {
        entries.push({ level: 'info', entry });
      },
      error: (entry) => {
        entries.push({ level: 'error', entry });
      },
    },
    entries,
  };
};

test('createRunRecord emits structured log with run and ritual context', () => {
  const { logger, entries } = createCapturingLogger();
  const state = __testing.createInitialState(logger);
  const ritual = __testing.createRitualRecord(
    state,
    {
      ritual_key: 'structured-run',
      name: 'Structured Run Logging',
      instant_runs: false,
      inputs: [],
    },
    () => new Date('2024-06-10T09:00:00.000Z'),
  );

  entries.splice(0, entries.length);

  const run = __testing.createRunRecord(
    state,
    ritual,
    {
      runKey: 'run-structured',
      now: () => new Date('2024-06-10T10:00:00.000Z'),
    },
  );

  assert.equal(entries.length, 1);
  const logEntry = entries[0];
  assert.equal(logEntry.level, 'info');
  assert.equal(logEntry.entry.event, 'run.created');
  assert.equal(logEntry.entry.run_id, run.run_key);
  assert.equal(logEntry.entry.ritual_id, ritual.ritual_key);
  assert.equal(logEntry.entry.status, 'planned');
  assert.deepEqual(logEntry.entry.meta, { instant_run: false });
});

test('instant runs log completion metadata', () => {
  const { logger, entries } = createCapturingLogger();
  const state = __testing.createInitialState(logger);
  const ritual = __testing.createRitualRecord(
    state,
    {
      ritual_key: 'instant-ritual',
      name: 'Instant Ritual',
      instant_runs: true,
      inputs: [],
    },
    () => new Date('2024-06-11T09:00:00.000Z'),
  );

  entries.splice(0, entries.length);

  const run = __testing.createRunRecord(
    state,
    ritual,
    {
      runKey: 'run-instant',
      now: () => new Date('2024-06-11T10:00:00.000Z'),
      completionTime: () => new Date('2024-06-11T10:05:00.000Z'),
    },
  );

  assert.equal(run.status, 'complete');
  assert.equal(entries.length, 1);
  const logEntry = entries[0];
  assert.equal(logEntry.entry.event, 'run.created');
  assert.equal(logEntry.entry.status, 'complete');
  assert.equal(logEntry.entry.run_id, run.run_key);
  assert.equal(logEntry.entry.ritual_id, ritual.ritual_key);
  assert.deepEqual(logEntry.entry.meta, {
    instant_run: true,
    completed_immediately: true,
  });
});

test('attention lifecycle emits structured log entries with run context', () => {
  const { logger, entries } = createCapturingLogger();
  const state = __testing.createInitialState(logger);
  const ritual = __testing.createRitualRecord(
    state,
    {
      ritual_key: 'attention-ritual',
      name: 'Attention Ritual',
      instant_runs: false,
      inputs: [],
    },
    () => new Date('2024-06-12T08:00:00.000Z'),
  );

  entries.splice(0, entries.length);

  const run = __testing.createRunRecord(
    state,
    ritual,
    {
      runKey: 'run-attention',
      now: () => new Date('2024-06-12T09:00:00.000Z'),
    },
  );

  entries.splice(0, entries.length);

  const attention = __testing.createAttentionItemRecord(
    state,
    run,
    { type: 'auth_needed', message: 'Re-authenticate the city portal' },
    () => new Date('2024-06-12T09:30:00.000Z'),
  );

  assert.equal(entries.length, 1);
  let logEntry = entries[0];
  assert.equal(logEntry.entry.event, 'attention.created');
  assert.equal(logEntry.entry.run_id, run.run_key);
  assert.equal(logEntry.entry.ritual_id, ritual.ritual_key);
  assert.equal(logEntry.entry.status, 'planned');
  assert.deepEqual(logEntry.entry.meta, {
    attention_id: attention.attention_id,
    attention_type: 'auth_needed',
  });

  entries.splice(0, entries.length);

  __testing.resolveAttentionItemRecord(
    state,
    attention,
    () => new Date('2024-06-12T10:00:00.000Z'),
  );

  assert.equal(entries.length, 1);
  logEntry = entries[0];
  assert.equal(logEntry.entry.event, 'attention.resolved');
  assert.equal(logEntry.entry.run_id, run.run_key);
  assert.equal(logEntry.entry.ritual_id, ritual.ritual_key);
  assert.equal(logEntry.entry.status, 'planned');
  assert.deepEqual(logEntry.entry.meta, {
    attention_id: attention.attention_id,
    attention_type: 'auth_needed',
    resolved_at: '2024-06-12T10:00:00.000Z',
  });
});
