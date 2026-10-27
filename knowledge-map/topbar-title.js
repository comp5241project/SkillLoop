/** Show the active Knowledge page in the shared top bar without changing other modules. */
(function () {
  const header = document.getElementById('site-header');
  if (!header) return;

  const pageName = document.createElement('span');
  pageName.className = 'kn-topbar-title';
  header.insertBefore(pageName, header.querySelector('.sl-top'));

  const initialTitle = document.title;
  const file = location.pathname.split('/').pop();
  const label = {
    'concept.html': 'Concept',
    'teacher.html': 'Independent Graph Studio',
  }[file] || initialTitle.split(' | ')[0].trim();
  const detailHeading = document.getElementById('kn-title');
  const update = () => {
    const heading = detailHeading?.textContent.trim();
    const name = (heading && !/^Loading\b/i.test(heading) ? heading : null) ||
      (document.title === initialTitle
        ? label : document.title.split(' | ')[0].trim()) || 'Knowledge';
    pageName.textContent = name;
    pageName.title = name;
  };
  update();

  const title = document.querySelector('head > title');
  if (title) new MutationObserver(update).observe(title, {
    childList: true, characterData: true, subtree: true,
  });
  if (detailHeading) new MutationObserver(update).observe(detailHeading, {
    childList: true, characterData: true, subtree: true,
  });
})();
