(function () {
  const make = (tag, className = '', value = '') => {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = value;
    return element;
  };

  function unitHero({ eyebrow, title, lead, question, meta, topics = [] }) {
    const hero = make('header', 'kn-unit-hero');
    hero.append(make('p', 'kn-eyebrow', eyebrow), make('h1', '', title),
      make('p', 'kn-lead', lead), make('p', 'kn-guiding', question),
      make('p', 'kn-meta', meta));
    const tags = make('div', 'kn-topic-row');
    for (const topic of topics) tags.append(make('span', 'kn-topic', topic));
    hero.append(tags);
    return hero;
  }

  function unitLayout(directionIntro) {
    const layout = make('div', 'kn-unit-layout');
    const article = make('article', 'kn-unit-article');
    const aside = make('aside', 'sl-card kn-unit-aside');
    aside.append(make('h2', '', 'Explore knowledge directions'), make('p', '', directionIntro));
    layout.append(article, aside);
    return { layout, article, aside };
  }

  function directionCard({ title, description, meta, href, action = 'Explore this direction' }) {
    const card = make('div', 'kn-direction-card');
    const link = make('a', 'sl-btn', action); link.href = href;
    card.append(make('h3', '', title), make('p', '', description),
      make('p', 'kn-meta', meta), link);
    return card;
  }

  function showSelection(host, { kind, title, description }) {
    host.replaceChildren(make('p', 'kn-eyebrow', kind), make('h3', '', title),
      make('p', '', description));
  }

  window.SkillLoopKnowledgeReader = { unitHero, unitLayout, directionCard, showSelection };
})();
