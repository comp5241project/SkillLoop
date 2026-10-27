(async function () {
  const host = document.querySelector('#teacher-units');
  const status = document.querySelector('#channel-status');
  const more = document.querySelector('#more-units');
  const form = document.querySelector('#teacher-filters');
  let page = 0;
  async function load() {
    try {
      const filters = Object.fromEntries(new FormData(form));
      const response = await fetch(`/api/knowledge-v4?${new URLSearchParams({ op: 'public-units', page,
        ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) })}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load Units.');
      for (const unit of data.units) {
        const article = document.createElement('article'); article.className = 'sl-card';
        const title = document.createElement('h2');
        const link = document.createElement('a');
        link.href = `/knowledge-map/teacher-unit.html?${new URLSearchParams({ unit: unit.id })}`;
        link.textContent = unit.title; title.append(link);
        const meta = document.createElement('p'); meta.className = 'sl-small';
        meta.textContent = `${unit.publisher_name} · ${unit.content_type || 'Exploration'} · Version ${unit.current_version}`;
        article.append(title, meta); host.append(article);
      }
      status.textContent = page === 0 && !data.units.length ? 'No teacher Units have been published yet.' : '';
      more.hidden = data.units.length < 24;
      page += 1;
    } catch (error) { status.textContent = error.message; }
  }
  more.addEventListener('click', load);
  form.addEventListener('submit', (event) => {
    event.preventDefault(); page = 0; host.replaceChildren(); load();
  });
  try {
    const response = await fetch('/api/knowledge-v4?op=public-teachers');
    const data = await response.json();
    if (response.ok) for (const teacher of data.teachers) {
      const option = document.createElement('option'); option.value = teacher.id;
      option.textContent = teacher.name; form.elements.teacher.append(option);
    }
  } catch { /* Unit browsing still works without filter options. */ }
  await load();
})();
