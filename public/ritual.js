(function () {
  const params = new URLSearchParams(window.location.search);
  const ritualKeyParam = params.get('ritual') || params.get('ritual_key') || params.get('id');

  const nameEl = document.getElementById('ritual-name');
  const keyEl = document.getElementById('ritual-key');
  const subtitleEl = document.getElementById('ritual-subtitle');
  const instantBadge = document.getElementById('instant-badge');
  const manualBadge = document.getElementById('manual-badge');
  const cadenceChip = document.getElementById('cadence-chip');
  const runBehaviourEl = document.getElementById('run-behaviour');
  const createRunButton = document.getElementById('create-run');
  const inputsList = document.getElementById('inputs-list');
  const inputsEmpty = document.getElementById('inputs-empty');
  const runsList = document.getElementById('runs-list');
  const runsEmpty = document.getElementById('runs-empty');
  const toast = document.getElementById('toast');

  const CAPTURE_KEYWORDS =
    '\\b(?:every|daily|weekly|monthly|quarterly|weekdays?|weekends?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|today|tonight|tomorrow|morning|afternoon|evening|night)\\b';

  const cadencePattern = new RegExp(`${CAPTURE_KEYWORDS}.*$`, 'i');

  const setToast = (message, tone = 'info') => {
    if (!toast) {
      return;
    }

    toast.textContent = message;
    toast.className = `toast ${tone}`.trim();
    toast.hidden = message.length === 0;
  };

  const fetchJson = async (input, init) => {
    const response = await fetch(input, init);
    if (!response.ok) {
      let errorMessage = response.statusText || 'Request failed';
      try {
        const body = await response.json();
        if (body && typeof body.error === 'string') {
          errorMessage = body.error.replace(/_/g, ' ');
        }
      } catch (error) {
        // Ignore JSON parse errors and fall back to status text.
      }
      throw new Error(errorMessage);
    }

    return response.json();
  };

  const formatRelativeTime = (input) => {
    if (!input) {
      return 'just now';
    }

    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) {
      return 'just now';
    }

    const deltaSeconds = Math.round((Date.now() - date.getTime()) / 1000);
    const absSeconds = Math.abs(deltaSeconds);

    const thresholds = [
      { limit: 60, unit: 'second', value: deltaSeconds },
      { limit: 3600, unit: 'minute', value: Math.round(deltaSeconds / 60) },
      { limit: 86400, unit: 'hour', value: Math.round(deltaSeconds / 3600) },
      { limit: 604800, unit: 'day', value: Math.round(deltaSeconds / 86400) },
    ];

    const match = thresholds.find((entry) => absSeconds < entry.limit);
    if (match) {
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
      return rtf.format(match.value, match.unit);
    }

    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  const formatAbsoluteTimestamp = (input) => {
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) {
      return 'Unknown time';
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  const formatRunKeyLabel = (runKey, ritualName) => {
    const prefix = 'Weave run';
    const safeRitualName = typeof ritualName === 'string' && ritualName.trim().length > 0 ? ritualName.trim() : null;

    if (typeof runKey !== 'string' || runKey.trim().length === 0) {
      return safeRitualName ? `${prefix} • ${safeRitualName}` : prefix;
    }

    const runKeyPattern = /^weave-run-(.+)-(\d{4}-\d{2}-\d{2}T.+)$/;
    const match = runKey.trim().match(runKeyPattern);

    if (!match) {
      if (safeRitualName) {
        return `${prefix} • ${safeRitualName} • ${runKey.trim()}`;
      }
      return `${prefix} • ${runKey.trim()}`;
    }

    const [, rawRitualKey, timestamp] = match;
    const labelName = safeRitualName || rawRitualKey.replace(/-/g, ' ').trim();
    const timestampDate = new Date(timestamp);
    const formattedDate = Number.isNaN(timestampDate.getTime())
      ? timestamp
      : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestampDate);

    return `${prefix} • ${labelName} • ${formattedDate}`;
  };

  const statusLabel = (status) => {
    switch (status) {
      case 'planned':
        return 'Scheduled';
      case 'in_progress':
        return 'In progress';
      case 'complete':
        return 'Completed';
      default:
        return 'Active';
    }
  };

  const extractNameAndCadence = (rawName) => {
    if (typeof rawName !== 'string' || rawName.trim().length === 0) {
      return { name: 'Untitled ritual', cadence: null };
    }

    const trimmed = rawName.trim();
    const cadenceMatch = trimmed.match(cadencePattern);

    if (!cadenceMatch || cadenceMatch.index === undefined) {
      return { name: trimmed, cadence: null };
    }

    const cadence = cadenceMatch[0].trim();
    const name = trimmed.slice(0, cadenceMatch.index).trim();

    return {
      name: name.length > 0 ? name : trimmed,
      cadence,
    };
  };

  const renderInputs = (inputs) => {
    inputsList.innerHTML = '';
    if (!Array.isArray(inputs) || inputs.length === 0) {
      inputsEmpty.hidden = false;
      return;
    }

    inputsEmpty.hidden = true;

    inputs.forEach((input) => {
      const li = document.createElement('li');
      if (input.type === 'external_link') {
        const anchor = document.createElement('a');
        anchor.href = input.value;
        anchor.target = '_blank';
        anchor.rel = 'noreferrer noopener';
        anchor.textContent = input.label || input.value;
        li.appendChild(anchor);
      } else {
        li.textContent = input.value;
      }
      inputsList.appendChild(li);
    });
  };

  const renderRuns = (runs = [], ritualName) => {
    runsList.innerHTML = '';
    if (!Array.isArray(runs) || runs.length === 0) {
      runsEmpty.hidden = false;
      return;
    }

    runsEmpty.hidden = true;

    const sorted = [...runs].sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
      const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
      return bTime - aTime;
    });

    sorted.slice(0, 5).forEach((run) => {
      const li = document.createElement('li');
      li.className = 'run-item';

      const header = document.createElement('div');
      header.className = 'run-header';

      const key = document.createElement('span');
      key.className = 'run-key';
      key.textContent = formatRunKeyLabel(run.run_key, ritualName);
      header.appendChild(key);

      const badge = document.createElement('span');
      badge.className = `status-chip status-${run.status}`;
      badge.textContent = statusLabel(run.status);
      header.appendChild(badge);

      li.appendChild(header);

      const meta = document.createElement('p');
      meta.className = 'run-meta';
      meta.textContent = `${formatAbsoluteTimestamp(run.updated_at || run.created_at)} • ${formatRelativeTime(
        run.updated_at || run.created_at,
      )}`;
      li.appendChild(meta);

      if (Array.isArray(run.activity_log) && run.activity_log.length > 0) {
        const latestLog = run.activity_log[run.activity_log.length - 1];
        if (latestLog && latestLog.message) {
          const activity = document.createElement('p');
          activity.className = 'run-activity';
          activity.textContent = latestLog.message;
          li.appendChild(activity);
        }
      }

      runsList.appendChild(li);
    });
  };

  const latestRun = (runs = []) =>
    runs.reduce((current, candidate) => {
      if (!candidate) {
        return current;
      }

      if (!current) {
        return candidate;
      }

      const currentTime = new Date(current.updated_at || current.created_at || 0).getTime();
      const candidateTime = new Date(candidate.updated_at || candidate.created_at || 0).getTime();
      return candidateTime > currentTime ? candidate : current;
    }, null);

  const updateSubtitle = (ritual) => {
    const run = latestRun(ritual.runs);
    if (!run) {
      subtitleEl.textContent = 'No runs yet — create one to get started.';
      return;
    }

    subtitleEl.textContent = `${statusLabel(run.status)} • ${formatRelativeTime(run.updated_at || run.created_at)}`;
  };

  const renderRitual = (ritual) => {
    const { name: displayName, cadence } = extractNameAndCadence(ritual.name);

    nameEl.textContent = displayName;
    keyEl.textContent = `Ritual key: ${ritual.ritual_key}`;

    instantBadge.hidden = !ritual.instant_runs;
    manualBadge.hidden = ritual.instant_runs;

    runBehaviourEl.textContent = ritual.instant_runs
      ? 'Agents trigger and auto-complete this run immediately.'
      : 'Agents stage the run and wait for a manual wrap-up when ready.';

    cadenceChip.hidden = false;
    cadenceChip.textContent = cadence ? `Cadence • ${cadence}` : 'Cadence • On demand';

    updateSubtitle(ritual);
    renderInputs(ritual.inputs || []);
    renderRuns(ritual.runs || [], displayName);
  };

  const loadRitual = async () => {
    if (!ritualKeyParam) {
      nameEl.textContent = 'Ritual not specified';
      keyEl.textContent = 'Add ?ritual=<ritual_key> to the URL to load a ritual.';
      createRunButton.disabled = true;
      setToast('Missing ritual key in URL', 'error');
      return;
    }

    try {
      createRunButton.disabled = false;
      createRunButton.textContent = 'Create run now';
      const data = await fetchJson(`/rituals/${encodeURIComponent(ritualKeyParam)}`);
      if (!data || !data.ritual) {
        throw new Error('ritual_not_found');
      }
      renderRitual(data.ritual);
    } catch (error) {
      nameEl.textContent = 'Unable to load ritual';
      keyEl.textContent = ritualKeyParam ? `Ritual key: ${ritualKeyParam}` : '';
      createRunButton.disabled = true;
      setToast(error.message || 'Unable to load ritual', 'error');
    }
  };

  createRunButton.addEventListener('click', async () => {
    if (!ritualKeyParam) {
      return;
    }

    createRunButton.disabled = true;
    const originalLabel = createRunButton.textContent;
    createRunButton.textContent = 'Creating…';
    setToast('');

    try {
      const data = await fetchJson(`/rituals/${encodeURIComponent(ritualKeyParam)}/runs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!data || !data.run) {
        throw new Error('Run creation failed');
      }

      const message = data.run.status === 'complete' ? 'Run complete' : 'Run created';
      setToast(message, 'success');
      await loadRitual();
    } catch (error) {
      setToast(error.message || 'Unable to create run', 'error');
      createRunButton.disabled = false;
      createRunButton.textContent = originalLabel;
    }
  });

  loadRitual();
})();
