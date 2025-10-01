(function () {
  const params = new URLSearchParams(window.location.search);
  const runKeyParam = params.get('run') || params.get('run_key') || params.get('id');

  const runTitle = document.getElementById('run-title');
  const runKeyEl = document.getElementById('run-key');
  const runStatusChip = document.getElementById('run-status-chip');
  const runUpdatedEl = document.getElementById('run-updated');
  const runSubtitle = document.getElementById('run-subtitle');
  const runStatusText = document.getElementById('run-status');
  const runRitual = document.getElementById('run-ritual');
  const runCadence = document.getElementById('run-cadence');
  const runLastUpdate = document.getElementById('run-last-update');
  const runInputsList = document.getElementById('run-inputs');
  const runInputsEmpty = document.getElementById('run-inputs-empty');
  const triggersList = document.getElementById('triggers-list');
  const triggersEmpty = document.getElementById('triggers-empty');
  const attentionList = document.getElementById('attention-list');
  const attentionEmpty = document.getElementById('attention-empty');
  const activityList = document.getElementById('activity-list');
  const activityEmpty = document.getElementById('activity-empty');
  const ritualNavLink = document.getElementById('ritual-nav-link');
  const toast = document.getElementById('toast');

  const CADENCE_KEYWORDS =
    '\\b(?:every|daily|weekly|monthly|quarterly|weekdays?|weekends?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|today|tonight|tomorrow|morning|afternoon|evening|night)\\b';

  const cadencePattern = new RegExp(`${CADENCE_KEYWORDS}.*$`, 'i');

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
      let message = response.statusText || 'Request failed';
      try {
        const body = await response.json();
        if (body && typeof body.error === 'string') {
          message = body.error.replace(/_/g, ' ');
        }
      } catch (error) {
        // Ignore JSON parse errors.
      }
      throw new Error(message);
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

  const formatRunKeyLabel = (runKey, ritualName) => {
    const prefix = 'Weave run';
    const safeName = typeof ritualName === 'string' && ritualName.trim().length > 0 ? ritualName.trim() : null;

    if (typeof runKey !== 'string' || runKey.trim().length === 0) {
      return safeName ? `${prefix} • ${safeName}` : prefix;
    }

    const runKeyPattern = /^weave-run-(.+)-(\d{4}-\d{2}-\d{2}T.+)$/;
    const match = runKey.trim().match(runKeyPattern);

    if (!match) {
      if (safeName) {
        return `${prefix} • ${safeName} • ${runKey.trim()}`;
      }
      return `${prefix} • ${runKey.trim()}`;
    }

    const [, rawRitualKey, timestamp] = match;
    const labelName = safeName || rawRitualKey.replace(/-/g, ' ').trim();
    const timestampDate = new Date(timestamp);
    const formattedDate = Number.isNaN(timestampDate.getTime())
      ? timestamp
      : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestampDate);

    return `${prefix} • ${labelName} • ${formattedDate}`;
  };

  const resolveCadence = (ritual) => {
    if (!ritual) {
      return null;
    }

    if (typeof ritual.cadence === 'string') {
      const trimmedCadence = ritual.cadence.trim();
      if (trimmedCadence.length > 0) {
        return trimmedCadence;
      }
    }

    const rawName = typeof ritual.name === 'string' ? ritual.name.trim() : '';
    if (rawName.length === 0) {
      return null;
    }

    const cadenceMatch = rawName.match(cadencePattern);
    if (!cadenceMatch || cadenceMatch.index === undefined) {
      return null;
    }

    const cadence = cadenceMatch[0].trim();
    return cadence.length > 0 ? cadence : null;
  };

  const renderInputs = (inputs = []) => {
    runInputsList.innerHTML = '';
    if (!Array.isArray(inputs) || inputs.length === 0) {
      runInputsEmpty.hidden = false;
      return;
    }

    runInputsEmpty.hidden = true;
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
      runInputsList.appendChild(li);
    });
  };

  const renderTriggers = (triggers = []) => {
    triggersList.innerHTML = '';
    if (!Array.isArray(triggers) || triggers.length === 0) {
      triggersEmpty.hidden = false;
      return;
    }

    triggersEmpty.hidden = true;
    triggers.forEach((trigger) => {
      const li = document.createElement('li');
      li.className = `trigger-item trigger-${trigger.status}`;

      const header = document.createElement('div');
      header.className = 'trigger-header';

      const label = document.createElement('span');
      label.className = 'trigger-label';
      label.textContent = trigger.label;
      header.appendChild(label);

      const status = document.createElement('span');
      status.className = `trigger-status trigger-status-${trigger.status}`;
      status.textContent = trigger.status.charAt(0).toUpperCase() + trigger.status.slice(1);
      header.appendChild(status);

      li.appendChild(header);

      const description = document.createElement('p');
      description.className = 'trigger-description';
      description.textContent = trigger.description;
      li.appendChild(description);

      const eventTag = document.createElement('span');
      eventTag.className = 'trigger-event';
      eventTag.textContent = trigger.event.replace(/_/g, ' ');
      li.appendChild(eventTag);

      triggersList.appendChild(li);
    });
  };

  const renderAttention = (items = []) => {
    attentionList.innerHTML = '';
    if (!Array.isArray(items) || items.length === 0) {
      attentionEmpty.hidden = false;
      return;
    }

    attentionEmpty.hidden = true;
    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'attention-item attention-inline';

      const message = document.createElement('strong');
      message.textContent = item.message;
      li.appendChild(message);

      const meta = document.createElement('span');
      const when = formatRelativeTime(item.created_at);
      meta.textContent = `${item.type.replace(/_/g, ' ')} • ${when}`;
      li.appendChild(meta);

      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'attention-action';
      action.dataset.attentionId = item.attention_id;
      action.textContent = item.resolved ? 'Resolved' : 'Resolve';
      action.disabled = Boolean(item.resolved);
      li.appendChild(action);

      attentionList.appendChild(li);
    });
  };

  const renderActivity = (activityLog = []) => {
    activityList.innerHTML = '';
    if (!Array.isArray(activityLog) || activityLog.length === 0) {
      activityEmpty.hidden = false;
      return;
    }

    activityEmpty.hidden = true;

    const sorted = [...activityLog].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    sorted.forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'activity-item';

      const message = document.createElement('p');
      message.className = 'activity-message';
      message.textContent = entry.message || entry.event.replace(/_/g, ' ');
      li.appendChild(message);

      const meta = document.createElement('span');
      meta.className = 'activity-meta';
      meta.textContent = `${formatAbsoluteTimestamp(entry.timestamp)} • ${formatRelativeTime(entry.timestamp)}`;
      li.appendChild(meta);

      activityList.appendChild(li);
    });
  };

  const updateHero = (run, ritual, attentionItems) => {
    const ritualName = ritual?.name;
    const label = formatRunKeyLabel(run.run_key, ritualName);
    runTitle.textContent = label;
    runKeyEl.textContent = `Run key: ${run.run_key}`;

    const chipLabel = statusLabel(run.status);
    runStatusChip.textContent = chipLabel;
    runStatusChip.className = `status-chip status-${run.status}`;

    const lastUpdated = run.updated_at || run.created_at;
    runUpdatedEl.textContent = `Updated ${formatAbsoluteTimestamp(lastUpdated)} • ${formatRelativeTime(lastUpdated)}`;

    if (ritual && ritual.ritual_key) {
      const ritualHref = `/ritual.html?ritual=${encodeURIComponent(ritual.ritual_key)}`;
      runRitual.innerHTML = '';
      const link = document.createElement('a');
      link.href = ritualHref;
      link.className = 'pill-link-inline';
      link.textContent = ritual.name || ritual.ritual_key;
      runRitual.appendChild(link);

      ritualNavLink.href = ritualHref;
      ritualNavLink.hidden = false;
      ritualNavLink.textContent = `View ritual: ${ritual.name || ritual.ritual_key}`;
    } else {
      runRitual.textContent = run.ritual_key;
      ritualNavLink.hidden = true;
    }

    const attentionCount = Array.isArray(attentionItems)
      ? attentionItems.filter((item) => !item.resolved).length
      : 0;

    if (run.status === 'complete') {
      runSubtitle.textContent = `Run completed ${formatRelativeTime(lastUpdated)}. Review the log below.`;
    } else if (attentionCount > 0) {
      runSubtitle.textContent =
        attentionCount === 1
          ? '1 attention item needs resolution to keep things moving.'
          : `${attentionCount} attention items need resolution to keep things moving.`;
    } else {
      runSubtitle.textContent = 'Agents are on it. You can watch the timeline update here.';
    }

    runStatusText.textContent = `${chipLabel} • ${formatRelativeTime(lastUpdated)}`;
    runLastUpdate.textContent = `${formatAbsoluteTimestamp(lastUpdated)} (${formatRelativeTime(lastUpdated)})`;
  };

  const renderRun = (payload) => {
    const { run, ritual, attention_items: attentionItems = [], next_triggers: triggers = [] } = payload;
    if (!run) {
      throw new Error('Run payload missing');
    }

    updateHero(run, ritual, attentionItems);
    renderInputs(run.inputs || []);
    renderTriggers(triggers);
    renderAttention(attentionItems);
    renderActivity(run.activity_log || []);

    if (runCadence) {
      const cadence = resolveCadence(ritual);
      runCadence.textContent = cadence || 'On demand';
    }
  };

  const loadRun = async () => {
    if (!runKeyParam) {
      runTitle.textContent = 'Run not specified';
      runSubtitle.textContent = 'Add ?run=<run_key> to the URL to load a run.';
      runStatusChip.textContent = 'Unknown';
      runStatusChip.className = 'status-chip';
      setToast('Missing run key in URL', 'error');
      return;
    }

    try {
      const data = await fetchJson(`/runs/${encodeURIComponent(runKeyParam)}`);
      renderRun(data);
      setToast('');
    } catch (error) {
      runTitle.textContent = 'Unable to load run';
      runKeyEl.textContent = runKeyParam ? `Run key: ${runKeyParam}` : '';
      runSubtitle.textContent = error.message || 'Run lookup failed.';
      runStatusChip.textContent = 'Error';
      runStatusChip.className = 'status-chip status-error';
      setToast(error.message || 'Unable to load run', 'error');
    }
  };

  attentionList.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.matches('.attention-action')) {
      const attentionId = target.dataset.attentionId;
      if (!attentionId) {
        return;
      }

      target.disabled = true;
      target.textContent = 'Resolving…';
      setToast('Resolving attention item…');

      try {
        await fetchJson(`/attention/${encodeURIComponent(attentionId)}/resolve`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
        });

        setToast('Attention item resolved', 'success');
        await loadRun();
      } catch (error) {
        setToast(error.message || 'Unable to resolve attention item', 'error');
        target.disabled = false;
        target.textContent = 'Resolve';
      }
    }
  });

  loadRun();
})();
