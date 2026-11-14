async function courseRequest(op, { query = {}, body } = {}) {
  const url = new URL('/api/courses/', window.location.origin);
  url.search = new URLSearchParams({ op, ...query });
  const response = await fetch(url, body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-SkillLoop-Course': '1' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.error), { status: response.status, fields: payload.fields });
  return payload;
}

function courseElement(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderLesson(host, lesson, headingLevel = 2) {
  const node = courseElement;
  const heading = 'h' + headingLevel;
  const list = (items) => {
    const result = node('ul');
    result.append(...items.map((text) => node('li', text)));
    return result;
  };
  const code = node('pre');
  code.append(node('code', lesson.codeExample.excerpt));
  const exercises = node('ol');
  for (const exercise of lesson.exercises) {
    const item = node('li');
    item.append(node('p', exercise.prompt));
    if (exercise.publicHints.length) {
      const hints = node('details');
      hints.append(node('summary', 'Hints'), list(exercise.publicHints));
      item.append(hints);
    }
    exercises.append(item);
  }
  host.replaceChildren(node(heading, lesson.context.title), node('p', lesson.context.scenario),
    node('p', lesson.context.aiClaim), node(heading, 'Learning objectives'), list(lesson.objectives.map(({ text }) => text)),
    node(heading, 'Relevant requirements'), list(lesson.requirements.map(({ text }) => text)),
    node(heading, 'Explanation'), node('p', lesson.explanation), node(heading, 'Read the code'),
    code, node('p', lesson.codeExample.prompt), node(heading, 'Practice questions'), exercises);
}

function signIn(form, onSuccess, onError) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    const body = Object.fromEntries(new FormData(form));
    button.disabled = true;
    try {
      const result = await courseRequest('login', { body });
      form.reset();
      await onSuccess(result.role, result.accountId);
    } catch (error) {
      onError(error);
    } finally {
      button.disabled = false;
    }
  });
}
