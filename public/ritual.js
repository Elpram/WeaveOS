(function () {
  const params = new URLSearchParams(window.location.search);
  const ritualKeyParam = params.get('ritual');
  const nameEl = document.getElementById('ritual-name');
  const keyEl = document.getElementById('ritual-key');
  const cadenceEl = document.getElementById('ritual-cadence');
  const instantEl = document.getElementById('ritual-instant');
  const instantBadge = document.getElementById('instant-badge');
  const inputsList = document.getElementById('inputs-list');
  const inputsEmpty = document.getElementById('inputs-empty');
  const runList = document.getElementById('run-list');
  const runsEmpty = document.getElementById('runs-empty');
  const createRunButton = document.getElementById('create-run');
  const toast = document.getElementById('toast');

  const showToast = (message, tone = 'info') => {
    toast.textContent = message;
    toast.className = `toast ${tone}`.trim();
    toast.hidden = false;
    clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => {
      toast.hidden = true;
    }, 4000);
  };

  showToast.timeoutId = null;

  const formatRelativeTime = (input) => {
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

  const formatRunStatus = (run) => {
    const statusLabels = {
      planned: 'Scheduled',
      in_progress: 'In progress',
      complete: 'Completed',
    };

    const label = statusLabels[run.status] || 'Active';
    return `${label} • ${formatRelativeTime(run.updated_at || run.created_at)}`;
  };

  const renderInputs = (inputs = []) => {
    inputsList.innerHTML = '';
    if (!inputs.length) {
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

  const renderRuns = (runs = []) => {
    runList.innerHTML = '';
    if (!runs.length) {
      runsEmpty.hidden = false;
      return;
    }

    runsEmpty.hidden = true;
    runs
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
        const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 5)
      .forEach((run) => {
        const item = document.createElement('li');
        item.className = 'run-item';

        const status = document.createElement('span');
        status.className = `run-status ${run.status}`;
        status.textContent = run.status.replace(/_/g, ' ');
        item.appendChild(status);

        const meta = document.createElement('span');
        meta.className = 'run-meta';
        meta.textContent = formatRunStatus(run);
        item.appendChild(meta);

        runList.appendChild(item);
      });
  };

  const fetchJson = async (input, init) => {
    const response = await fetch(input, init);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorMessage = errorBody.error || response.statusText || 'Request failed';
      throw new Error(errorMessage);
    }
    return response.json();
  };

  const applyRitual = (ritual) => {
    nameEl.textContent = ritual.name;
    document.title = `${ritual.name} • WeaveOS`;
    if (keyEl) {
      keyEl.textContent = `Ritual key: ${ritual.ritual_key}`;
    }

    if (cadenceEl) {
      cadenceEl.textContent = ritual.cadence || 'Cadence not provided yet.';
    }

    if (instantEl) {
      instantEl.textContent = ritual.instant_runs
        ? 'Agents auto-complete this run.'
        : 'Agents will start the run; you wrap it up.';
    }

    if (instantBadge) {
      instantBadge.hidden = !ritual.instant_runs;
      if (!instantBadge.hidden) {
        instantBadge.textContent = 'Instant runs';
      }
    }

    renderInputs(Array.isArray(ritual.inputs) ? ritual.inputs : []);
    renderRuns(Array.isArray(ritual.runs) ? ritual.runs : []);
  };

  const loadRitual = async () => {
    if (!ritualKeyParam) {
      showToast('Missing ritual key in the URL.', 'error');
      createRunButton.disabled = true;
      nameEl.textContent = 'Ritual not found';
      return;
    }

    try {
      const data = await fetchJson(`/rituals/${encodeURIComponent(ritualKeyParam)}`);
      if (!data.ritual) {
        throw new Error('ritual_not_found');
      }
      applyRitual(data.ritual);
    } catch (error) {
      nameEl.textContent = 'Ritual not found';
      showToast(error.message || 'Unable to load ritual', 'error');
      createRunButton.disabled = true;
    }
  };

  createRunButton.addEventListener('click', async () => {
    if (!ritualKeyParam) {
      return;
    }

    createRunButton.disabled = true;
    showToast('Creating run…');

    try {
      const data = await fetchJson(`/rituals/${encodeURIComponent(ritualKeyParam)}/runs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!data.run) {
        throw new Error('run_not_created');
      }

      const run = data.run;
      showToast(run.status === 'complete' ? 'Run complete' : 'Run started', 'success');
      await loadRitual();
    } catch (error) {
      showToast(error.message || 'Unable to create run', 'error');
    } finally {
      createRunButton.disabled = false;
    }
  });

  loadRitual();
})();
