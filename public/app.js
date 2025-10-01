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

  const setFeedback = (message, isError = false) => {
    feedback.textContent = message;
    feedback.classList.toggle('error', isError);
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
      return;
    }

    upcomingEmpty.hidden = true;

    rituals
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((ritual) => {
        const item = document.createElement('li');
        item.className = 'ritual-item';

        const header = document.createElement('header');
        const nameEl = document.createElement('span');
        nameEl.className = 'ritual-name';
        nameEl.textContent = ritual.name;
        header.appendChild(nameEl);

        const badge = document.createElement('span');
        badge.className = `badge ${ritual.instant_runs ? '' : 'inactive'}`.trim();
        badge.textContent = ritual.instant_runs ? 'Instant run' : 'Scheduled';
        header.appendChild(badge);

        item.appendChild(header);

        const keyMeta = document.createElement('p');
        keyMeta.className = 'ritual-meta';
        keyMeta.textContent = `Key: ${ritual.ritual_key}`;
        item.appendChild(keyMeta);

        if (ritual.inputs && ritual.inputs.length > 0) {
          const inputsHeading = document.createElement('p');
          inputsHeading.className = 'inputs-heading';
          inputsHeading.textContent = 'Inputs';
          item.appendChild(inputsHeading);

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
      return;
    }

    attentionEmpty.hidden = true;

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
    const payload = {
      ritual_key: ritualKey,
      name,
      instant_runs: instantCheckbox.checked,
      inputs: link
        ? [
            {
              type: 'external_link',
              value: link,
              label: 'Reference link',
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
