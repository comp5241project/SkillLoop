/* Knowledge-scoped account controls; all identity comes from /api/knowledge. */
(function () {
  const K = window.KnowledgeNetwork;
  const top = document.querySelector('#site-header .sl-top');
  if (!top || !K) return;
  const avatar = top.querySelector('.sl-avatar');
  if (!avatar) return;
  const button = K.make('button', 'sl-avatar kn-account-button', 'SL');
  button.type = 'button';
  button.setAttribute('aria-label', 'Knowledge account');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-haspopup', 'menu');
  avatar.replaceWith(button);
  const menu = K.make('div', 'kn-account-menu');
  menu.hidden = true;
  const dialog = document.createElement('dialog');
  dialog.className = 'kn-login-dialog';
  dialog.innerHTML = '<form method="dialog" class="kn-login-form"><h2>Sign in to Knowledge</h2><label>Email <input name="email" type="email" autocomplete="username" required></label><label>Password <input name="password" type="password" autocomplete="current-password" required></label><p role="status"></p><div class="sl-actions"><button class="sl-btn sl-btn-main" type="submit" value="sign-in">Sign in</button><button class="sl-btn" type="button" data-close>Cancel</button></div></form>';
  const form = dialog.querySelector('form');
  const message = form.querySelector('[role=status]');
  let session = null;
  let available = false;
  let previousFocus = null;
  const link = (label, href) => { const a = K.make('a', '', label); a.href = href; return a; };
  function closeMenu() { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); }
  function render() {
    button.textContent = session?.signedIn ? session.role === 'teacher' ? 'TC' : 'ST' : 'SL';
    button.setAttribute('aria-label', session?.signedIn
      ? `${session.role === 'teacher' ? 'Teacher' : 'Student'} account menu`
      : 'Knowledge account menu');
    menu.replaceChildren();
    if (session?.signedIn) {
      menu.append(K.make('p', '', `${session.email} · ${session.role === 'teacher' ? 'Teacher' : 'Student'}`));
      menu.append(link(session.role === 'teacher' ? 'Teaching Studio' : 'My Knowledge',
        session.role === 'teacher' ? '/knowledge-map/teacher.html' : '/knowledge-map/my.html'));
      menu.append(link('Account', '/knowledge-map/account.html'));
      const logout = K.make('button', 'sl-btn', 'Sign out'); logout.type = 'button';
      logout.addEventListener('click', async () => {
        logout.disabled = true;
        try {
          if (window.KnowledgeBeforeSignOut && !await window.KnowledgeBeforeSignOut()) { logout.disabled = false; return; }
          await K.api('logout', 'POST', {});
          sessionStorage.removeItem('skillloop.knowledge.preview');
          session = { signedIn: false, backendConfigured: available };
          render(); closeMenu();
          window.KnowledgeSigningOut = true;
          location.assign('/knowledge-map/');
        } catch (error) { logout.disabled = false; menu.append(K.make('p', '', `Sign out failed: ${error.message}`)); }
      });
      menu.append(logout);
    } else {
      menu.append(K.make('p', '', available ? 'Browse public knowledge or sign in.' : 'Account service is unavailable. Public knowledge is still available.'));
      if (available) {
        const signin = K.make('button', 'sl-btn', 'Sign in'); signin.type = 'button';
        signin.addEventListener('click', () => { closeMenu(); previousFocus = button; message.textContent = ''; dialog.showModal(); form.elements.email.focus(); });
        menu.append(signin);
      }
    }
  }
  async function refresh() {
    try { session = await K.api('session'); available = !!session.backendConfigured; }
    catch { session = null; available = false; }
    render();
    document.dispatchEvent(new CustomEvent('knowledge-session', { detail: session }));
  }
  button.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    button.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) menu.querySelector('a,button')?.focus();
  });
  menu.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeMenu(); button.focus(); } });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) { closeMenu(); button.focus(); }
  });
  document.addEventListener('click', (event) => { if (!top.contains(event.target)) closeMenu(); });
  document.addEventListener('knowledge-auth-expired', () => { session = null; render(); refresh(); });
  form.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => previousFocus?.focus());
  function openLogin() {
    if (!available) return;
    closeMenu(); previousFocus = document.activeElement;
    message.textContent = ''; dialog.showModal(); form.elements.email.focus();
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true; message.textContent = 'Signing in…';
    try {
      await K.api('login', 'POST', { email: form.elements.email.value, password: form.elements.password.value });
      const confirmed = await K.api('session');
      if (!confirmed.signedIn) throw new Error('The account session could not be confirmed.');
      session = confirmed; available = !!confirmed.backendConfigured; render();
      form.elements.password.value = '';
      dialog.close();
      location.assign(confirmed.role === 'teacher' ? '/knowledge-map/teacher.html' : '/knowledge-map/my.html');
    } catch (error) { message.textContent = `Sign in failed: ${error.message}`; }
    finally { submit.disabled = false; }
  });
  top.append(menu);
  document.querySelector('#skillloop-prototype').append(dialog);
  window.KnowledgeAccount = Object.freeze({ open: openLogin, refresh });
  refresh();
})();
