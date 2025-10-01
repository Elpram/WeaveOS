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
}

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
});

const sendJson = (response: ServerResponse, statusCode: number, payload: unknown): void => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(payload));
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
  ...ritual,
  runs: ritual.runs.map((run) => ({
    run_key: run.run_key,
    ritual_key: run.ritual_key,
    status: run.status,
    created_at: run.created_at,
    updated_at: run.updated_at,
    activity_log: run.activity_log,
    inputs: run.inputs.map((input) => ({ ...input })),
  })),
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

  const timestamp = new Date().toISOString();
  const ritual: RitualRecord = {
    ritual_key: ritualKey,
    name,
    instant_runs: instantRuns,
    inputs: normalizedInputs,
    created_at: timestamp,
    updated_at: timestamp,
    runs: [],
  };

  state.rituals.set(ritualKey, ritual);

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

const createRunKey = (): string => new Date().toISOString();

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

  const runKey = providedRunKey ?? createRunKey();

  if (state.runs.has(runKey)) {
    sendJson(response, 409, { error: 'run_already_exists' });
    return;
  }

  const createdAt = new Date();
  const run: RunRecord = {
    run_key: runKey,
    ritual_key: ritual.ritual_key,
    status: 'planned',
    created_at: createdAt.toISOString(),
    updated_at: createdAt.toISOString(),
    activity_log: [],
    inputs: ritual.inputs.map((input) => ({ ...input })),
  };

  if (ritual.instant_runs) {
    run.status = 'complete';
    run.updated_at = new Date().toISOString();
  }

  ritual.updated_at = run.updated_at;
  ritual.runs.push(run);
  state.runs.set(runKey, run);

  sendJson(response, 201, {
    run: {
      ...run,
      inputs: run.inputs.map((input) => ({ ...input })),
    },
  });
};

const createAttentionId = (): string => `attn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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

  const timestamp = new Date().toISOString();
  const attentionItem: AttentionItem = {
    attention_id: createAttentionId(),
    run_key: runKey,
    type: type as AttentionItem['type'],
    message,
    resolved: false,
    created_at: timestamp,
  };

  state.attentionItems.set(attentionItem.attention_id, attentionItem);

  sendJson(response, 201, { attention: attentionItem });
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

  const items = Array.from(state.attentionItems.values()).filter(
    (item) => item.run_key === runKey,
  );

  sendJson(response, 200, { attention_items: items });
};

const handleResolveAttention = async (
  state: AppState,
  request: IncomingMessage,
  response: ServerResponse,
  attentionId: string,
): Promise<void> => {
  const attentionItem = state.attentionItems.get(attentionId);

  if (!attentionItem) {
    sendJson(response, 404, { error: 'attention_item_not_found' });
    return;
  }

  if (attentionItem.resolved) {
    sendJson(response, 409, { error: 'attention_already_resolved' });
    return;
  }

  const run = state.runs.get(attentionItem.run_key);

  if (!run) {
    sendJson(response, 404, { error: 'run_not_found' });
    return;
  }

  const timestamp = new Date().toISOString();
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

  sendJson(response, 200, { attention: attentionItem });
};

const createAutomationId = (): string => `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const handleCreateAutomation = async (
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

  sendJson(response, 201, { automation });
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
      const ritualKey = segments[1];

      if (method === 'GET') {
        handleGetRitual(state, response, ritualKey);
        return;
      }
    }

    if (segments.length === 3 && segments[2] === 'runs' && method === 'POST') {
      const ritualKey = segments[1];
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
      const attentionId = segments[1];
      await handleResolveAttention(state, request, response, attentionId);
      return;
    }
  }

  if (segments.length > 0 && segments[0] === 'runs') {
    if (segments.length === 3 && segments[2] === 'attention' && method === 'GET') {
      const runKey = segments[1];
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

  sendJson(response, 404, { status: 'not_found' });
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
