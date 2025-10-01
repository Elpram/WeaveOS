import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface AppOptions {
  logger?: boolean;
}

type RunStatus = 'planned' | 'in_progress' | 'complete';

interface RitualInputExternalLink {
  type: 'external_link';
  value: string;
  label?: string;
}

type RitualInput = RitualInputExternalLink;

type TriggerType =
  | 'on_run_planned'
  | 'before_run_start'
  | 'on_run_start'
  | 'on_artifact_published'
  | 'on_run_complete'
  | 'on_attention_resolved';

type NextTriggerStatus = 'queued' | 'pending' | 'active' | 'complete';

interface NextTrigger {
  event: TriggerType;
  label: string;
  status: NextTriggerStatus;
  description: string;
}

interface AutomationCall {
  capability_id: string;
  payload_template: Record<string, unknown>;
  connection_id?: string;
  target_id?: string;
}

interface Automation {
  automation_id: string;
  ritual_key?: string;
  trigger: TriggerType;
  call: AutomationCall;
  created_at: string;
  updated_at: string;
}

interface AttentionItem {
  attention_id: string;
  run_key: string;
  type: 'auth_needed' | 'missing_draft' | 'decision_required' | 'other';
  message: string;
  resolved: boolean;
  created_at: string;
  resolved_at?: string;
}

interface ActivityLogEntry {
  timestamp: string;
  event: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface RunRecord {
  run_key: string;
  ritual_key: string;
  status: RunStatus;
  created_at: string;
  updated_at: string;
  activity_log: ActivityLogEntry[];
  inputs: RitualInput[];
}

interface RitualRecord {
  ritual_key: string;
  name: string;
  instant_runs: boolean;
  inputs: RitualInput[];
  created_at: string;
  updated_at: string;
  runs: RunRecord[];
}

interface IncomingMessageWithBody extends IncomingMessage {
  on(event: 'data', listener: (chunk: string | { toString(encoding?: string): string }) => void): this;
  on(event: 'end', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

interface AppState {
  rituals: Map<string, RitualRecord>;
  runs: Map<string, RunRecord>;
  attentionItems: Map<string, AttentionItem>;
  automations: Map<string, Automation>;
  idempotencyRecords: Map<string, IdempotencyRecord>;
}

interface IdempotencyRecord {
  statusCode: number;
  payload: unknown;
}

const HOUSEHOLD_ROLES = ['Owner', 'Adult', 'Teen', 'Guest', 'Agent'] as const;
type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];

const getHouseholdRoleFromRequest = (
  request: IncomingMessage,
): { role?: HouseholdRole; error?: 'missing' | 'invalid' } => {
  const rawHeader = request.headers['x-household-role'];

  if (rawHeader === undefined) {
    return { error: 'missing' };
  }

  const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

  if (typeof headerValue !== 'string') {
    return { error: 'invalid' };
  }

  const normalizedValue = headerValue.trim();

  if (normalizedValue.length === 0) {
    return { error: 'invalid' };
  }

  const matchedRole = HOUSEHOLD_ROLES.find(
    (role) => role.toLowerCase() === normalizedValue.toLowerCase(),
  );

  if (!matchedRole) {
    return { error: 'invalid' };
  }

  return { role: matchedRole };
};

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const tryServeStaticAsset = async (
  request: IncomingMessage,
  response: ServerResponse,
  requestPath: string,
): Promise<boolean> => {
  if (!['GET', 'HEAD'].includes((request.method ?? 'GET').toUpperCase())) {
    return false;
  }

  const normalizedPath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, normalizedPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return false;
  }

  try {
    const file = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[extension] ?? 'application/octet-stream';

    response.statusCode = 200;
    response.setHeader('content-type', contentType);

    if ((request.method ?? 'GET').toUpperCase() === 'HEAD') {
      response.end();
      return true;
    }

    const payload = typeof file === 'string' ? file : file.toString();
    response.end(payload);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: string }).code;
      if (code === 'ENOENT') {
        return false;
      }
    }

    response.statusCode = 500;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ status: 'error' }));
    return true;
  }
};

const createInitialState = (): AppState => ({
  rituals: new Map(),
  runs: new Map(),
  attentionItems: new Map(),
  automations: new Map(),
  idempotencyRecords: new Map(),
});

type NowFn = () => Date;

const defaultNow: NowFn = () => new Date();

const cloneInputs = (inputs: RitualInput[]): RitualInput[] =>
  inputs.map((input) => ({ ...input }));

const createRitualRecord = (
  state: AppState,
  data: {
    ritual_key: string;
    name: string;
    instant_runs: boolean;
    inputs: RitualInput[];
  },
  now: NowFn = defaultNow,
): RitualRecord => {
  const timestamp = now().toISOString();

  const ritual: RitualRecord = {
    ritual_key: data.ritual_key,
    name: data.name,
    instant_runs: data.instant_runs,
    inputs: cloneInputs(data.inputs),
    created_at: timestamp,
    updated_at: timestamp,
    runs: [],
  };

  state.rituals.set(ritual.ritual_key, ritual);

  return ritual;
};

const sendJson = (response: ServerResponse, statusCode: number, payload: unknown): void => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(payload));
};

const getIdempotencyKeyFromRequest = (request: IncomingMessage): string | undefined => {
  const rawHeader = request.headers['idempotency-key'];

  if (rawHeader === undefined) {
    return undefined;
  }

  const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

  if (typeof headerValue !== 'string') {
    return undefined;
  }

  const normalizedValue = headerValue.trim();

  if (normalizedValue.length === 0) {
    return undefined;
  }

  return normalizedValue;
};

const respondWithIdempotencyRecord = (
  response: ServerResponse,
  record: IdempotencyRecord,
): void => {
  response.statusCode = record.statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(record.payload));
};

const cloneActivityLogEntry = (entry: ActivityLogEntry): ActivityLogEntry => ({
  timestamp: entry.timestamp,
  event: entry.event,
  message: entry.message,
  ...(entry.metadata ? { metadata: { ...entry.metadata } } : {}),
});

const normalizeRunForResponse = (run: RunRecord): RunRecord => ({
  run_key: run.run_key,
  ritual_key: run.ritual_key,
  status: run.status,
  created_at: run.created_at,
  updated_at: run.updated_at,
  inputs: cloneInputs(run.inputs),
  activity_log: run.activity_log.map((entry) => cloneActivityLogEntry(entry)),
});

const normalizeAttentionItem = (item: AttentionItem): AttentionItem => ({
  attention_id: item.attention_id,
  run_key: item.run_key,
  type: item.type,
  message: item.message,
  resolved: item.resolved,
  created_at: item.created_at,
  ...(item.resolved_at ? { resolved_at: item.resolved_at } : {}),
});

const normalizeRitualSummary = (ritual: RitualRecord): Pick<
  RitualRecord,
  'ritual_key' | 'name' | 'instant_runs' | 'inputs' | 'created_at' | 'updated_at'
> => ({
  ritual_key: ritual.ritual_key,
  name: ritual.name,
  instant_runs: ritual.instant_runs,
  inputs: cloneInputs(ritual.inputs),
  created_at: ritual.created_at,
  updated_at: ritual.updated_at,
});

const buildNextTriggers = (run: RunRecord): NextTrigger[] => {
  if (run.status === 'complete') {
    return [
      {
        event: 'on_run_complete',
        label: 'Wrap-up logged',
        status: 'complete',
        description: 'Agents recorded the completion details.',
      },
    ];
  }

  if (run.status === 'in_progress') {
    return [
      {
        event: 'on_run_start',
        label: 'Session underway',
        status: 'active',
        description: 'Agents are actively working through the run steps.',
      },
      {
        event: 'on_run_complete',
        label: 'Wrap-up & summary',
        status: 'queued',
        description: 'Once tasks are complete, agents will log the outcome.',
      },
    ];
  }

  return [
    {
      event: 'on_run_planned',
      label: 'Agent review',
      status: 'active',
      description: 'Agents confirm prerequisites and prep the next steps.',
    },
    {
      event: 'before_run_start',
      label: 'Reminder window',
      status: 'pending',
      description: 'Expect a nudge shortly before kickoff (mock reminder).',
    },
    {
      event: 'on_run_start',
      label: 'Kickoff session',
      status: 'queued',
      description: 'Agents will start execution once prerequisites are clear.',
    },
  ];
};

const decodePathSegment = (value: string): string | null => {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return null;
  }
};

const readRequestBody = (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const source = request as IncomingMessageWithBody;
    const chunks: string[] = [];

    source.on('data', (chunk) => {
      if (typeof chunk === 'string') {
        chunks.push(chunk);
        return;
      }

      if (chunk && typeof chunk.toString === 'function') {
        chunks.push(chunk.toString());
      }
    });

    source.on('end', () => {
      resolve(chunks.join(''));
    });

    source.on('error', reject);
  });

const normalizeRitualForResponse = (ritual: RitualRecord): RitualRecord => ({
  ritual_key: ritual.ritual_key,
  name: ritual.name,
  instant_runs: ritual.instant_runs,
  inputs: cloneInputs(ritual.inputs),
  created_at: ritual.created_at,
  updated_at: ritual.updated_at,
  runs: ritual.runs.map((run) => normalizeRunForResponse(run)),
});

const handleCreateRitual = async (
  state: AppState,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const rawBody = await readRequestBody(request);
  let payload: unknown = {};

  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody);
    } catch (_error) {
      sendJson(response, 400, { error: 'invalid_json' });
      return;
    }
  }

  if (payload === null || typeof payload !== 'object') {
    sendJson(response, 400, { error: 'invalid_payload' });
    return;
  }

  const {
    ritual_key: ritualKey,
    name,
    instant_runs: instantRuns = false,
    inputs = [],
  } = payload as {
    ritual_key?: unknown;
    name?: unknown;
    instant_runs?: unknown;
    inputs?: unknown;
  };

  if (typeof ritualKey !== 'string' || ritualKey.trim().length === 0) {
    sendJson(response, 400, { error: 'ritual_key_required' });
    return;
  }

  if (typeof name !== 'string' || name.trim().length === 0) {
    sendJson(response, 400, { error: 'name_required' });
    return;
  }

  if (typeof instantRuns !== 'boolean') {
    sendJson(response, 400, { error: 'instant_runs_must_be_boolean' });
    return;
  }

  if (!Array.isArray(inputs)) {
    sendJson(response, 400, { error: 'inputs_must_be_array' });
    return;
  }

  if (state.rituals.has(ritualKey)) {
    sendJson(response, 409, { error: 'ritual_already_exists' });
    return;
  }

  const normalizedInputs: RitualInput[] = [];
  for (const input of inputs) {
    if (!input || typeof input !== 'object') {
      sendJson(response, 400, { error: 'invalid_input_entry' });
      return;
    }

    const { type, value, label } = input as {
      type?: unknown;
      value?: unknown;
      label?: unknown;
    };

    if (type !== 'external_link') {
      sendJson(response, 400, { error: 'unsupported_input_type' });
      return;
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      sendJson(response, 400, { error: 'input_value_required' });
      return;
    }

    if (label !== undefined && typeof label !== 'string') {
      sendJson(response, 400, { error: 'input_label_must_be_string' });
      return;
    }

    normalizedInputs.push({
      type,
      value,
      ...(label ? { label } : {}),
    });
  }

  const ritual = createRitualRecord(state, {
    ritual_key: ritualKey,
    name,
    instant_runs: instantRuns,
    inputs: normalizedInputs,
  });

  sendJson(response, 201, { ritual: normalizeRitualForResponse(ritual) });
};

const handleListRituals = (state: AppState, response: ServerResponse): void => {
  const rituals = Array.from(state.rituals.values()).map((ritual) =>
    normalizeRitualForResponse(ritual),
  );
  sendJson(response, 200, { rituals });
};

const handleGetRitual = (
  state: AppState,
  response: ServerResponse,
  ritualKey: string,
): void => {
  const ritual = state.rituals.get(ritualKey);

  if (!ritual) {
    sendJson(response, 404, { error: 'ritual_not_found' });
    return;
  }

  sendJson(response, 200, { ritual: normalizeRitualForResponse(ritual) });
};

const createRunKey = (ritualKey: string): string => {
  const timestamp = new Date().toISOString();
  return `weave-run-${ritualKey}-${timestamp}`;
};

interface CreateRunOptions {
  runKey?: string;
  now?: NowFn;
  completionTime?: NowFn;
}

const createRunRecord = (
  state: AppState,
  ritual: RitualRecord,
  options: CreateRunOptions = {},
): RunRecord => {
  const runKey = options.runKey ?? createRunKey(ritual.ritual_key);

  if (state.runs.has(runKey)) {
    throw Object.assign(new Error(`run ${runKey} already exists`), {
      code: 'run_already_exists',
    });
  }

  const now = options.now ?? defaultNow;
  const createdTimestamp = now().toISOString();

  const run: RunRecord = {
    run_key: runKey,
    ritual_key: ritual.ritual_key,
    status: 'planned',
    created_at: createdTimestamp,
    updated_at: createdTimestamp,
    activity_log: [],
    inputs: cloneInputs(ritual.inputs),
  };

  if (ritual.instant_runs) {
    const completionTime = options.completionTime ?? defaultNow;
    const completionTimestamp = completionTime().toISOString();
    run.status = 'complete';
    run.updated_at = completionTimestamp;
  }

  ritual.runs.push(run);
  ritual.updated_at = run.updated_at;
  state.runs.set(runKey, run);

  return run;
};

const handleCreateRun = async (
  state: AppState,
  request: IncomingMessage,
  response: ServerResponse,
  ritualKey: string,
): Promise<void> => {
  const ritual = state.rituals.get(ritualKey);

  if (!ritual) {
    sendJson(response, 404, { error: 'ritual_not_found' });
    return;
  }

  const rawBody = await readRequestBody(request);
  let payload: unknown = {};

  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody);
    } catch (_error) {
      sendJson(response, 400, { error: 'invalid_json' });
      return;
    }
  }

  if (payload !== null && typeof payload !== 'object') {
    sendJson(response, 400, { error: 'invalid_payload' });
    return;
  }

  const { run_key: providedRunKey } = (payload ?? {}) as { run_key?: unknown };

  if (providedRunKey !== undefined && (typeof providedRunKey !== 'string' || providedRunKey.trim().length === 0)) {
    sendJson(response, 400, { error: 'run_key_must_be_string' });
    return;
  }

  const runKey = providedRunKey ?? createRunKey(ritual.ritual_key);

  if (state.runs.has(runKey)) {
    sendJson(response, 409, { error: 'run_already_exists' });
    return;
  }

  const run = createRunRecord(state, ritual, { runKey });

  sendJson(response, 201, {
    run: normalizeRunForResponse(run),
  });
};

const handleGetRun = (
  state: AppState,
  response: ServerResponse,
  runKey: string,
): void => {
  const run = state.runs.get(runKey);

  if (!run) {
    sendJson(response, 404, { error: 'run_not_found' });
    return;
  }

  const ritual = state.rituals.get(run.ritual_key);
  const attentionItems = Array.from(state.attentionItems.values())
    .filter((item) => item.run_key === runKey)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((item) => normalizeAttentionItem(item));

  sendJson(response, 200, {
    run: normalizeRunForResponse(run),
    ritual: ritual ? normalizeRitualSummary(ritual) : undefined,
    attention_items: attentionItems,
    next_triggers: buildNextTriggers(run),
  });
};

const handleListRunArtifacts = (
  _state: AppState,
  response: ServerResponse,
  _runKey: string,
): void => {
  sendJson(response, 501, { error: 'not_implemented' });
};

const handleCreateArtifact = async (
  _state: AppState,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  try {
    await readRequestBody(request);
  } catch (_error) {
    // Drain errors and continue with the not implemented response.
  }

  sendJson(response, 501, { error: 'not_implemented' });
};

const createAttentionId = (): string => `attn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

interface CreateAttentionParams {
  type: AttentionItem['type'];
  message: string;
}

const createAttentionItemRecord = (
  state: AppState,
  run: RunRecord,
  params: CreateAttentionParams,
  now: NowFn = defaultNow,
): AttentionItem => {
  const attentionId = createAttentionId();
  const timestamp = now().toISOString();

  const attentionItem: AttentionItem = {
    attention_id: attentionId,
    run_key: run.run_key,
    type: params.type,
    message: params.message,
    resolved: false,
    created_at: timestamp,
  };

  state.attentionItems.set(attentionId, attentionItem);

  return attentionItem;
};

const resolveAttentionItemRecord = (
  state: AppState,
  attentionItem: AttentionItem,
  now: NowFn = defaultNow,
): AttentionItem => {
  const run = state.runs.get(attentionItem.run_key);

  if (!run) {
    throw Object.assign(new Error(`run ${attentionItem.run_key} not found`), {
      code: 'run_not_found',
    });
  }

  const timestamp = now().toISOString();
  attentionItem.resolved = true;
  attentionItem.resolved_at = timestamp;

  run.activity_log.push({
    timestamp,
    event: 'on_attention_resolved',
    message: `Attention item resolved: ${attentionItem.type}`,
    metadata: {
      attention_id: attentionItem.attention_id,
      attention_type: attentionItem.type,
      original_message: attentionItem.message,
    },
  });

  run.updated_at = timestamp;

  return attentionItem;
};

const handleCreateAttention = async (
  state: AppState,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const rawBody = await readRequestBody(request);
  let payload: unknown = {};

  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody);
    } catch (_error) {
      sendJson(response, 400, { error: 'invalid_json' });
      return;
    }
  }

  if (payload === null || typeof payload !== 'object') {
    sendJson(response, 400, { error: 'invalid_payload' });
    return;
  }

  const {
    run_key: runKey,
    type,
    message,
  } = payload as {
    run_key?: unknown;
    type?: unknown;
    message?: unknown;
  };

  if (typeof runKey !== 'string' || runKey.trim().length === 0) {
    sendJson(response, 400, { error: 'run_key_required' });
    return;
  }

  if (!state.runs.has(runKey)) {
    sendJson(response, 404, { error: 'run_not_found' });
    return;
  }

  const validTypes = ['auth_needed', 'missing_draft', 'decision_required', 'other'];
  if (typeof type !== 'string' || !validTypes.includes(type)) {
    sendJson(response, 400, { error: 'invalid_attention_type' });
    return;
  }

  if (typeof message !== 'string' || message.trim().length === 0) {
    sendJson(response, 400, { error: 'message_required' });
    return;
  }

  const run = state.runs.get(runKey) as RunRecord;
  const attentionItem = createAttentionItemRecord(
    state,
    run,
    { type: type as AttentionItem['type'], message },
  );

  sendJson(response, 201, { attention: normalizeAttentionItem(attentionItem) });
};

const handleGetRunAttention = (
  state: AppState,
  response: ServerResponse,
  runKey: string,
): void => {
  if (!state.runs.has(runKey)) {
    sendJson(response, 404, { error: 'run_not_found' });
    return;
  }

  const items = Array.from(state.attentionItems.values())
    .filter((item) => item.run_key === runKey)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((item) => normalizeAttentionItem(item));

  sendJson(response, 200, { attention_items: items });
};

const handleResolveAttention = async (
  state: AppState,
  request: IncomingMessage,
  response: ServerResponse,
  attentionId: string,
): Promise<void> => {
  const { role, error: roleError } = getHouseholdRoleFromRequest(request);

  if (roleError === 'missing') {
    sendJson(response, 400, { error: 'household_role_required' });
    return;
  }

  if (roleError === 'invalid' || !role) {
    sendJson(response, 400, { error: 'invalid_household_role' });
    return;
  }

  const idempotencyKey = getIdempotencyKeyFromRequest(request);
  const idempotencyMapKey =
    idempotencyKey !== undefined ? `attention_resolve:${attentionId}:${idempotencyKey}` : undefined;

  const attentionItem = state.attentionItems.get(attentionId);

  if (!attentionItem) {
    sendJson(response, 404, { error: 'attention_item_not_found' });
    return;
  }

  if (idempotencyMapKey) {
    const record = state.idempotencyRecords.get(idempotencyMapKey);
    if (record) {
      respondWithIdempotencyRecord(response, record);
      return;
    }
  }

  if (attentionItem.resolved) {
    sendJson(response, 409, { error: 'attention_already_resolved' });
    return;
  }

  if (!state.runs.has(attentionItem.run_key)) {
    sendJson(response, 404, { error: 'run_not_found' });
    return;
  }

  if (attentionItem.type === 'auth_needed' && role !== 'Owner') {
    sendJson(response, 403, { error: 'forbidden_for_role' });
    return;
  }

  const resolvedItem = resolveAttentionItemRecord(state, attentionItem);
  const responsePayload = { attention: normalizeAttentionItem(resolvedItem) };

  if (idempotencyMapKey) {
    state.idempotencyRecords.set(idempotencyMapKey, {
      statusCode: 200,
      payload: responsePayload,
    });
  }

  sendJson(response, 200, responsePayload);
};

const createAutomationId = (): string => `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const handleCreateAutomation = async (
  state: AppState,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const idempotencyKey = getIdempotencyKeyFromRequest(request);
  const idempotencyMapKey =
    idempotencyKey !== undefined ? `automation:${idempotencyKey}` : undefined;

  if (idempotencyMapKey) {
    const record = state.idempotencyRecords.get(idempotencyMapKey);
    if (record) {
      respondWithIdempotencyRecord(response, record);
      return;
    }
  }

  const rawBody = await readRequestBody(request);
  let payload: unknown = {};

  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody);
    } catch (_error) {
      sendJson(response, 400, { error: 'invalid_json' });
      return;
    }
  }

  if (payload === null || typeof payload !== 'object') {
    sendJson(response, 400, { error: 'invalid_payload' });
    return;
  }

  const {
    ritual_key: ritualKey,
    trigger,
    call,
  } = payload as {
    ritual_key?: unknown;
    trigger?: unknown;
    call?: unknown;
  };

  if (ritualKey !== undefined && (typeof ritualKey !== 'string' || ritualKey.trim().length === 0)) {
    sendJson(response, 400, { error: 'ritual_key_must_be_string' });
    return;
  }

  if (ritualKey && !state.rituals.has(ritualKey)) {
    sendJson(response, 404, { error: 'ritual_not_found' });
    return;
  }

  const validTriggers: TriggerType[] = [
    'on_run_planned',
    'before_run_start',
    'on_run_start',
    'on_artifact_published',
    'on_run_complete',
    'on_attention_resolved',
  ];

  if (typeof trigger !== 'string' || !validTriggers.includes(trigger as TriggerType)) {
    sendJson(response, 400, { error: 'invalid_trigger_type' });
    return;
  }

  if (!call || typeof call !== 'object') {
    sendJson(response, 400, { error: 'call_required' });
    return;
  }

  const {
    capability_id: capabilityId,
    payload_template: payloadTemplate,
    connection_id: connectionId,
    target_id: targetId,
  } = call as {
    capability_id?: unknown;
    payload_template?: unknown;
    connection_id?: unknown;
    target_id?: unknown;
  };

  if (typeof capabilityId !== 'string' || capabilityId.trim().length === 0) {
    sendJson(response, 400, { error: 'capability_id_required' });
    return;
  }

  if (!payloadTemplate || typeof payloadTemplate !== 'object' || Array.isArray(payloadTemplate)) {
    sendJson(response, 400, { error: 'payload_template_must_be_object' });
    return;
  }

  if (connectionId !== undefined && (typeof connectionId !== 'string' || connectionId.trim().length === 0)) {
    sendJson(response, 400, { error: 'connection_id_must_be_string' });
    return;
  }

  if (targetId !== undefined && (typeof targetId !== 'string' || targetId.trim().length === 0)) {
    sendJson(response, 400, { error: 'target_id_must_be_string' });
    return;
  }

  const timestamp = new Date().toISOString();
  const automation: Automation = {
    automation_id: createAutomationId(),
    ...(ritualKey ? { ritual_key: ritualKey } : {}),
    trigger: trigger as TriggerType,
    call: {
      capability_id: capabilityId,
      payload_template: payloadTemplate as Record<string, unknown>,
      ...(connectionId ? { connection_id: connectionId } : {}),
      ...(targetId ? { target_id: targetId } : {}),
    },
    created_at: timestamp,
    updated_at: timestamp,
  };

  state.automations.set(automation.automation_id, automation);

  const responsePayload = {
    automation: {
      ...automation,
      call: {
        ...automation.call,
      },
    },
  };

  if (idempotencyMapKey) {
    state.idempotencyRecords.set(idempotencyMapKey, {
      statusCode: 201,
      payload: responsePayload,
    });
  }

  sendJson(response, 201, responsePayload);
};

const createInvocationId = (): string => `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const createIdempotencyKey = (): string => `idem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const handleRequestInvocation = async (
  _state: AppState,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const rawBody = await readRequestBody(request);
  let payload: unknown = {};

  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody);
    } catch (_error) {
      sendJson(response, 400, { error: 'invalid_json' });
      return;
    }
  }

  if (payload === null || typeof payload !== 'object') {
    sendJson(response, 400, { error: 'invalid_payload' });
    return;
  }

  const {
    capability_id: capabilityId,
    payload: invocationPayload,
  } = payload as {
    capability_id?: unknown;
    payload?: unknown;
  };

  if (typeof capabilityId !== 'string' || capabilityId.trim().length === 0) {
    sendJson(response, 400, { error: 'capability_id_required' });
    return;
  }

  if (!invocationPayload || typeof invocationPayload !== 'object') {
    sendJson(response, 400, { error: 'payload_must_be_object' });
    return;
  }

  const invocationId = createInvocationId();
  const idempotencyKey = createIdempotencyKey();
  const mockInvocationUrl = `https://api.example.com/v1/invocations/${invocationId}`;

  sendJson(response, 200, {
    invocation_id: invocationId,
    invocation_url: mockInvocationUrl,
    idempotency_key: idempotencyKey,
    capability_id: capabilityId,
    status: 'pending',
  });
};

const handleRequest = async (
  state: AppState,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const method = (request.method ?? 'GET').toUpperCase();
  const requestUrl = request.url ?? '/';
  const [path] = requestUrl.split('?');
  const segments = path.split('/').filter((segment) => segment.length > 0);

  if (await tryServeStaticAsset(request, response, path)) {
    return;
  }

  if (method === 'GET' && segments.length === 1 && segments[0] === 'health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (segments.length > 0 && segments[0] === 'rituals') {
    if (method === 'POST' && segments.length === 1) {
      await handleCreateRitual(state, request, response);
      return;
    }

    if (method === 'GET' && segments.length === 1) {
      handleListRituals(state, response);
      return;
    }

    if (segments.length === 2) {
      const ritualKey = decodePathSegment(segments[1]);

      if (!ritualKey) {
        sendJson(response, 400, { error: 'invalid_ritual_key' });
        return;
      }

      if (method === 'GET') {
        handleGetRitual(state, response, ritualKey);
        return;
      }
    }

    if (segments.length === 3 && segments[2] === 'runs' && method === 'POST') {
      const ritualKey = decodePathSegment(segments[1]);
      if (!ritualKey) {
        sendJson(response, 400, { error: 'invalid_ritual_key' });
        return;
      }
      await handleCreateRun(state, request, response, ritualKey);
      return;
    }
  }

  if (segments.length > 0 && segments[0] === 'attention') {
    if (method === 'POST' && segments.length === 1) {
      await handleCreateAttention(state, request, response);
      return;
    }

    if (method === 'POST' && segments.length === 3 && segments[2] === 'resolve') {
      const attentionId = decodePathSegment(segments[1]);
      if (!attentionId) {
        sendJson(response, 400, { error: 'invalid_attention_id' });
        return;
      }
      await handleResolveAttention(state, request, response, attentionId);
      return;
    }
  }

  if (segments.length > 0 && segments[0] === 'runs') {
    if (segments.length === 2 && method === 'GET') {
      const runKey = decodePathSegment(segments[1]);
      if (!runKey) {
        sendJson(response, 400, { error: 'invalid_run_key' });
        return;
      }
      handleGetRun(state, response, runKey);
      return;
    }

    if (segments.length === 3 && segments[2] === 'artifacts' && method === 'GET') {
      const runKey = decodePathSegment(segments[1]);
      if (!runKey) {
        sendJson(response, 400, { error: 'invalid_run_key' });
        return;
      }
      handleListRunArtifacts(state, response, runKey);
      return;
    }

    if (segments.length === 3 && segments[2] === 'attention' && method === 'GET') {
      const runKey = decodePathSegment(segments[1]);
      if (!runKey) {
        sendJson(response, 400, { error: 'invalid_run_key' });
        return;
      }
      handleGetRunAttention(state, response, runKey);
      return;
    }
  }

  if (segments.length > 0 && segments[0] === 'automations') {
    if (method === 'POST' && segments.length === 1) {
      await handleCreateAutomation(state, request, response);
      return;
    }
  }

  if (segments.length > 0 && segments[0] === 'invocations') {
    if (method === 'POST' && segments.length === 2 && segments[1] === 'request') {
      await handleRequestInvocation(state, request, response);
      return;
    }
  }

  if (segments.length > 0 && segments[0] === 'artifacts') {
    if (method === 'POST' && segments.length === 1) {
      await handleCreateArtifact(state, request, response);
      return;
    }
  }

  sendJson(response, 404, { status: 'not_found' });
};

export const __testing = {
  createInitialState,
  createRitualRecord,
  createRunRecord,
  createAttentionItemRecord,
  resolveAttentionItemRecord,
  normalizeRitualForResponse,
  normalizeRunForResponse,
  normalizeAttentionItem,
  buildNextTriggers,
};

export const createAppServer = (_options: AppOptions = {}): Server => {
  const state = createInitialState();

  const server = createServer(async (request, response) => {
    try {
      await handleRequest(state, request, response);
    } catch (_error) {
      sendJson(response, 500, { status: 'error' });
    }
  });

  return server;
};
