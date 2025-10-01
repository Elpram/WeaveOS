(function () {
  const form = document.getElementById('ritual-form');
  const intentInput = document.getElementById('ritual-intent');
  const instantCheckbox = document.getElementById('instant-runs');
  const submitButton = form.querySelector('button[type="submit"]');
  const feedback = document.getElementById('form-feedback');
  const upcomingList = document.getElementById('upcoming-list');
  const upcomingEmpty = document.getElementById('upcoming-empty');
  const attentionList = document.getElementById('attention-list');
  const attentionEmpty = document.getElementById('attention-empty');
  const refreshButton = document.getElementById('refresh');
  const ritualCount = document.getElementById('ritual-count');
  const lastRefreshed = document.getElementById('last-refreshed');
  const attentionCount = document.getElementById('attention-count');

  const setFeedback = (message, isError = false) => {
    feedback.textContent = message;
    feedback.classList.toggle('error', isError);
    feedback.classList.toggle('success', Boolean(message) && !isError);
  };

  const slugify = (value) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const parseIntent = (rawIntent) => {
    const trimmed = rawIntent.trim();
    const urlMatch = trimmed.match(/https?:\/\/\S+/);
    const link = urlMatch ? urlMatch[0] : null;
    const name = link ? trimmed.replace(link, '').trim() : trimmed;
    const fallbackName = name.length > 0 ? name : 'Untitled ritual';
    const slug = slugify(fallbackName) || 'ritual';
    const uniqueSuffix = Date.now().toString(36);
    const ritualKey = `${slug}-${uniqueSuffix}`;

    return {
      name: fallbackName,
      link,
      ritualKey,
    };
  };

  const toggleSubmitting = (isSubmitting) => {
    submitButton.disabled = isSubmitting;
    refreshButton.disabled = isSubmitting;
    intentInput.disabled = isSubmitting;
    instantCheckbox.disabled = isSubmitting;
  };

  const updateCounts = (ritualsLength) => {
    if (ritualCount) {
      ritualCount.textContent = ritualsLength === 1 ? '1 ritual' : `${ritualsLength} rituals`;
    }
  };

  const updateLastRefreshed = (date = new Date()) => {
    if (!lastRefreshed) {
      return;
    }

    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });

    lastRefreshed.textContent = `Updated ${formatter.format(date)}`;
  };

  const updateAttentionCount = (itemsLength) => {
    if (!attentionCount) {
      return;
    }

    if (itemsLength === 0) {
      attentionCount.textContent = 'All clear';
      return;
    }

    attentionCount.textContent = itemsLength === 1 ? '1 item needs you' : `${itemsLength} items need you`;
  };

  const formatRelativeTime = (input) => {
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) {
      return 'recently';
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

  const describeRunBehaviour = (ritual) =>
    ritual.instant_runs
      ? 'Auto-completes the moment an agent triggers it.'
      : 'Agents will start it for you, but it needs a manual wrap-up.';

  const latestRun = (runs = []) =>
    runs.reduce((latest, run) => {
      if (!latest) {
        return run;
      }

      const latestTimestamp = new Date(latest.updated_at || latest.created_at || 0).getTime();
      const currentTimestamp = new Date(run.updated_at || run.created_at || 0).getTime();

      return currentTimestamp > latestTimestamp ? run : latest;
    }, null);

  const formatRunStatus = (run) => {
    if (!run) {
      return 'No runs yet';
    }

    const statusLabels = {
      planned: 'Scheduled',
      in_progress: 'In progress',
      complete: 'Completed',
    };

    const state = statusLabels[run.status] || 'Active';
    const updated = formatRelativeTime(run.updated_at || run.created_at);
    return `${state} • ${updated}`;
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

  const renderRituals = (rituals) => {
    upcomingList.innerHTML = '';
    if (rituals.length === 0) {
      upcomingEmpty.hidden = false;
      updateCounts(0);
      return;
    }

    upcomingEmpty.hidden = true;
    updateCounts(rituals.length);

    rituals
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((ritual) => {
        const item = document.createElement('li');
        item.className = 'ritual-item';

        const header = document.createElement('div');
        header.className = 'ritual-header';
        const nameEl = document.createElement('span');
        nameEl.className = 'ritual-name';
        nameEl.textContent = ritual.name;
        header.appendChild(nameEl);

        const badge = document.createElement('span');
        badge.className = `badge ${ritual.instant_runs ? '' : 'inactive'}`.trim();
        badge.textContent = ritual.instant_runs ? 'Auto-completes' : 'Needs wrap-up';
        header.appendChild(badge);

        item.appendChild(header);

        const behaviour = document.createElement('p');
        behaviour.className = 'ritual-behaviour';
        behaviour.textContent = describeRunBehaviour(ritual);
        item.appendChild(behaviour);

        const runMeta = document.createElement('p');
        runMeta.className = 'ritual-run-meta';
        runMeta.textContent = formatRunStatus(latestRun(ritual.runs));
        item.appendChild(runMeta);

        if (ritual.inputs && ritual.inputs.length > 0) {
          const inputList = document.createElement('ul');
          inputList.className = 'inputs-list';

          ritual.inputs.forEach((input) => {
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
            inputList.appendChild(li);
          });

          item.appendChild(inputList);
        }

        upcomingList.appendChild(item);
      });
  };

  const renderAttention = (items) => {
    attentionList.innerHTML = '';
    if (items.length === 0) {
      attentionEmpty.hidden = false;
      updateAttentionCount(0);
      return;
    }

    attentionEmpty.hidden = true;
    updateAttentionCount(items.length);

    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'attention-item';

      const message = document.createElement('strong');
      message.textContent = item.message;
      li.appendChild(message);

      const context = document.createElement('span');
      context.textContent = `${item.type.replace(/_/g, ' ')} • Run ${item.run_key} • ${item.ritual_name}`;
      li.appendChild(context);

      attentionList.appendChild(li);
    });
  };

  const loadAttentionItems = async (rituals) => {
    const pending = [];

    rituals.forEach((ritual) => {
      ritual.runs.forEach((run) => {
        pending.push(
          fetch(`/runs/${encodeURIComponent(run.run_key)}/attention`)
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
              if (!data || !Array.isArray(data.attention_items)) {
                return [];
              }

              return data.attention_items
                .filter((item) => !item.resolved)
                .map((item) => ({
                  ...item,
                  ritual_name: ritual.name,
                }));
            })
            .catch(() => []),
        );
      });
    });

    const results = await Promise.all(pending);
    const flattened = results.reduce((acc, list) => acc.concat(list), []);
    renderAttention(flattened);
  };

  const loadDashboard = async () => {
    try {
      const data = await fetchJson('/rituals');
      const rituals = Array.isArray(data.rituals) ? data.rituals : [];
      renderRituals(rituals);
      await loadAttentionItems(rituals);
      updateLastRefreshed();
    } catch (error) {
      setFeedback(error.message || 'Unable to load rituals', true);
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const rawIntent = intentInput.value;
    if (!rawIntent.trim()) {
      setFeedback('Please describe the ritual you want to create.', true);
      return;
    }

    const { name, link, ritualKey } = parseIntent(rawIntent);
    let linkLabel = null;
    if (link) {
      try {
        const url = new URL(link);
        linkLabel = url.hostname.replace(/^www\./, '');
      } catch (error) {
        linkLabel = 'Reference link';
      }
    }

    const payload = {
      ritual_key: ritualKey,
      name,
      instant_runs: instantCheckbox.checked,
      inputs: link
        ? [
            {
              type: 'external_link',
              value: link,
              label: linkLabel || 'Reference link',
            },
          ]
        : [],
    };

    toggleSubmitting(true);
    setFeedback('Creating ritual…');

    try {
      await fetchJson('/rituals', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      setFeedback('Ritual created!');
      intentInput.value = '';
      await loadDashboard();
    } catch (error) {
      setFeedback(error.message || 'Unable to create ritual', true);
    } finally {
      toggleSubmitting(false);
    }
  });

  refreshButton.addEventListener('click', () => {
    setFeedback('');
    loadDashboard();
  });

  loadDashboard();
})();
