(async function () {
  const status = document.querySelector('#account-status');
  const signin = document.querySelector('#account-sign-in');
  signin.addEventListener('click', () => window.KnowledgeAccount.open());
  try {
    const session = await window.KnowledgeNetwork.api('session');
    signin.hidden = session.signedIn || !session.backendConfigured;
    status.textContent = session.signedIn
      ? `Signed in as ${session.email}. Your personal knowledge is stored in your account.`
      : session.backendConfigured ? 'Sign in to use your account knowledge workspace.'
        : 'Account service is unavailable. Public knowledge remains available.';
  } catch (error) {
    signin.hidden = true;
    status.textContent = `Account service is unavailable: ${error.message}`;
  }
})();
