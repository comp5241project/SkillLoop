/** Shared chrome. Module authors normally do not need to edit this file. */
(function () {
  const root = document.body.dataset.root || './';
  const active = document.body.dataset.module || '';
  const modules = [
    ['learning-path', 'route', 'My path'],
    ['knowledge-map', 'workflow', 'Skill map'],
    ['interview', 'messages-square', 'Interview'],
    ['correction-lab', 'scan-line', 'Correction lab'],
  ];
  document.getElementById('site-header').innerHTML = `
    <a class="sl-brand" href="${root}index.html" aria-label="SkillLoop home">
      <span class="sl-logo"><i data-lucide="infinity" aria-hidden="true"></i></span>skillloop<span>.</span>
    </a>
    <div class="sl-top"><span class="sl-badge">${active === 'knowledge-map' ? 'Prototype' : 'Prototype · local data'}</span><span class="sl-avatar" aria-hidden="true">SL</span></div>`;
  document.getElementById('site-navigation').innerHTML = `
    <div class="sl-kicker">Workspace</div>
    <nav class="sl-nav" aria-label="Learning modules">${modules
      .map(
        ([folder, icon, title]) => `
      <a href="${root}${folder}/" ${active === folder ? 'aria-current="page"' : ''}>
        <i data-lucide="${icon}" aria-hidden="true"></i>${title}
      </a>`
      )
      .join('')}</nav>
    <div class="sl-side-foot"><div class="sl-orbit"><i data-lucide="orbit" aria-hidden="true"></i><span>Software development<br>Learning & practice</span></div></div>`;
  window.SkillLoop.icons();
})();
