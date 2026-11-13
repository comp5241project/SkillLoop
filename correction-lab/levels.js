/**
 * Part 4 (AI-assisted verification): the runnable side of the three shared cases.
 * Case text, requirements, issues and test wording come from shared-samples.js, which is
 * derived from docs/team-samples. This file only adds what is needed to run them here.
 * Keys are the shared case IDs, issue IDs and test IDs; do not rename them.
 *
 * - fns: functions the app and the tests call. html + wire: the app shell for the sandbox.
 * - detectors: marks an issue as reproduced when a real call to `fn` makes `detect` true
 *   (args, result, error in scope). A wire script may also call window.__report(issueId).
 * - checks: one per shared test ID. `run` is an async function body with `api` (the learner's
 *   functions) and `h` (approx, money, refusal, fakeApi); it returns { pass, actual }.
 * - repair: lets a learner apply the plan without writing code. template has one slot line
 *   per issue part, written as a comment (issue ID, colon, part name). Each issue has three
 *   fixes with exactly one correct; a wrong fix must leave a failing test. defaults holds the
 *   original lines, so the template with no fixes is the shared starter code.
 * - explain: one question per issue on why the right change is right.
 * The inner code avoids backticks so it can live in template strings.
 */
window.SkillLoopLevels = {
  'cart-checkout': {
    fns: ['cartTotal', 'averagePrice'],
    html: `<h2>QuizShop checkout</h2>
<label>Notebook ($19.99) quantity <input id="q1" value="2" autocomplete="off"></label>
<label>Pen ($9.99) quantity <input id="q2" value="1" autocomplete="off"></label>
<label>Discount % <input id="d" value="0" autocomplete="off"></label>
<button id="go" type="button">Checkout</button>
<p id="out" role="status"></p>`,
    wire: `document.getElementById('go').addEventListener('click', function () {
  var out = document.getElementById('out');
  var items = [
    { name: 'Notebook', price: 19.99, qty: Number(document.getElementById('q1').value) },
    { name: 'Pen', price: 9.99, qty: Number(document.getElementById('q2').value) }
  ].filter(function (item) { return item.qty !== 0; });
  try {
    var total = cartTotal(items, Number(document.getElementById('d').value));
    var average = averagePrice(items);
    out.textContent = 'Total: $' + total.toFixed(2) + ' · Average per item: $' + average.toFixed(2);
  } catch (error) {
    out.textContent = 'Could not check out: ' + error.message;
  }
});`,
    tryIt: 'Try a quantity of -3, a discount of 150, and a cart where every quantity is 0.',
    detectors: {
      'negative-quantity': { fn: 'cartTotal', detect: '!error && args[0].some(function (item) { return item.qty < 0 || !Number.isInteger(item.qty); })' },
      'discount-range': { fn: 'cartTotal', detect: '!error && (args[1] > 100 || args[1] < 0)' },
      'empty-cart': { fn: 'averagePrice', detect: '!error && !(typeof result === "number" && Number.isFinite(result))' },
    },
    checks: [
      {
        testId: 'normal-total',
        run: `const total = api.cartTotal([{ price: 19.99, qty: 2 }, { price: 9.99, qty: 1 }], 0);
return { pass: h.approx(total, 49.97), actual: 'Total is ' + h.money(total) + '.' };`,
      },
      {
        testId: 'normal-discount',
        run: `const total = api.cartTotal([{ price: 19.99, qty: 2 }, { price: 9.99, qty: 1 }], 10);
return { pass: h.approx(total, 44.973), actual: 'Raw total is approximately ' + (typeof total === 'number' ? total.toFixed(3) : total) + '; displayed total is ' + h.money(total) + '.' };`,
      },
      {
        testId: 'full-discount',
        run: `const total = api.cartTotal([{ price: 9.99, qty: 1 }], 100);
return { pass: h.approx(total, 0), actual: 'Total is ' + h.money(total) + '.' };`,
      },
      {
        testId: 'reject-negative',
        run: `const r = h.refusal(function () { return api.cartTotal([{ price: 19.99, qty: -3 }], 0); });
if (!r.rejected) return { pass: false, actual: 'The code accepts qty=-3 and returns a total of ' + h.money(r.value) + '.' };
return r.message ? { pass: true, actual: 'Rejected with the message: ' + r.message } : { pass: false, actual: 'Rejected, but without a clear message.' };`,
      },
      {
        testId: 'reject-fraction',
        run: `const r = h.refusal(function () { return api.cartTotal([{ price: 19.99, qty: 1.5 }], 0); });
if (!r.rejected) return { pass: false, actual: 'The code accepts qty=1.5 instead of rejecting it.' };
return r.message ? { pass: true, actual: 'Rejected with the message: ' + r.message } : { pass: false, actual: 'Rejected, but without a clear message.' };`,
      },
      {
        testId: 'discount-range',
        run: `const low = h.refusal(function () { return api.cartTotal([{ price: 9.99, qty: 1 }], -5); });
const high = h.refusal(function () { return api.cartTotal([{ price: 9.99, qty: 1 }], 150); });
const accepted = [];
if (!low.rejected) accepted.push('-5 (total ' + h.money(low.value) + ')');
if (!high.rejected) accepted.push('150 (total ' + h.money(high.value) + ')');
if (accepted.length) return { pass: false, actual: 'The code accepts a discount of ' + accepted.join(' and ') + '.' };
return low.message && high.message ? { pass: true, actual: 'Both values are rejected with the message: ' + high.message } : { pass: false, actual: 'Rejected, but without a clear message.' };`,
      },
      {
        testId: 'empty-average',
        run: `const total = h.refusal(function () { return api.cartTotal([], 0); });
const average = h.refusal(function () { return api.averagePrice([]); });
if (total.rejected || average.rejected) return { pass: false, actual: 'The empty cart is refused with an error instead of giving 0.' };
return { pass: total.value === 0 && average.value === 0, actual: 'Total is ' + String(total.value) + '; average is ' + String(average.value) + '.' };`,
      },
      {
        testId: 'normal-average',
        run: `const average = api.averagePrice([{ price: 19.99, qty: 2 }, { price: 9.99, qty: 1 }]);
return { pass: h.approx(average, 16.6567), actual: 'Average is approximately ' + (typeof average === 'number' ? average.toFixed(4) : average) + '; displayed average is ' + h.money(average) + '.' };`,
      },
    ],
    repair: {
      template: `function cartTotal(items, discountPercent) {
/*negative-quantity:main*/
/*discount-range:main*/
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  return total * (1 - discountPercent / 100);
}
function averagePrice(items) {
/*empty-cart:main*/
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const count = items.reduce((sum, item) => sum + item.qty, 0);
  return total / count;
}`,
      defaults: {},
      fixes: {
        'negative-quantity': [
          {
            label: 'Turn a negative quantity into a positive one.',
            say: 'Negative quantities are converted to positive, so the total can no longer go down.',
            parts: { main: '  items = items.map(function (item) { return { price: item.price, qty: Math.abs(item.qty) }; });' },
            correct: false,
            why: 'A shopper who typed -3 is now charged for 3. The requirement says to reject invalid quantities, not silently change them, and 1.5 is still accepted.',
          },
          {
            label: 'Refuse the order with a clear message unless every quantity is a whole number of 1 or more.',
            say: 'Each quantity is checked before anything is added up. A quantity that is not a whole number of 1 or more stops the checkout with a message.',
            parts: {
              main: "  for (const item of items) {\n    if (!Number.isInteger(item.qty) || item.qty < 1) {\n      throw new Error('Quantity must be a whole number of 1 or more.');\n    }\n  }",
            },
            correct: true,
          },
          {
            label: 'Refuse the order when a quantity is below 1.',
            say: 'A quantity below 1 stops the checkout with a message.',
            parts: { main: "  for (const item of items) {\n    if (item.qty < 1) throw new Error('Quantity must be at least 1.');\n  }" },
            correct: false,
            why: 'Negative quantities are refused now, but 1.5 still gets through. The requirement asks for an integer of at least 1.',
          },
        ],
        'discount-range': [
          {
            label: 'Refuse a discount outside 0 to 100 with a clear message.',
            say: 'The discount is checked first. Anything below 0 or above 100 stops the checkout with a message.',
            parts: { main: "  if (!(discountPercent >= 0 && discountPercent <= 100)) {\n    throw new Error('Discount must be between 0 and 100.');\n  }" },
            correct: true,
          },
          {
            label: 'Lower any discount above 100 to 100.',
            say: 'A discount above 100 is lowered to 100, so the total cannot drop below zero.',
            parts: { main: '  if (discountPercent > 100) discountPercent = 100;' },
            correct: false,
            why: 'A wrong code of 150 now makes the whole order free, and -5 still raises the price. The requirement says to reject values outside the range.',
          },
          {
            label: 'Adjust any discount so it stays between 0 and 100.',
            say: 'Discounts are pulled back into range: below 0 becomes 0 and above 100 becomes 100.',
            parts: { main: '  discountPercent = Math.min(100, Math.max(0, discountPercent));' },
            correct: false,
            why: 'The requirement says to reject an out-of-range discount. Changing it silently hides the mistake and can give away a free order.',
          },
        ],
        'empty-cart': [
          {
            label: 'Refuse an empty cart with an error.',
            say: 'If the cart has no items, the checkout stops with a message.',
            parts: { main: "  if (items.length === 0) {\n    throw new Error('The cart is empty.');\n  }" },
            correct: false,
            why: 'The requirement says an empty cart is allowed and its average is 0. It is a normal situation, not a mistake.',
          },
          {
            label: 'Show the text N/A instead of NaN for an empty cart.',
            say: 'An empty cart now gives the text N/A instead of NaN.',
            parts: { main: "  if (items.length === 0) return 'N/A';" },
            correct: false,
            why: 'The requirement asks for numeric 0. The page formats a number as money, so text breaks it in a new way. Try the app again.',
          },
          {
            label: 'Return an average of 0 when the cart is empty.',
            say: 'If the cart has no items, the average is 0 and nothing is divided.',
            parts: { main: '  if (items.length === 0) return 0;' },
            correct: true,
          },
        ],
      },
    },
    explain: {
      'negative-quantity': {
        question: 'Why refuse the order instead of turning -3 into 3?',
        options: [
          { text: 'Negative numbers make JavaScript crash.', why: 'They do not. The original code ran happily, which was the problem.' },
          {
            text: 'The app cannot know what the shopper meant, so guessing could charge them for something they never asked for.',
            why: 'Refusing invalid input keeps the mistake visible so the shopper can correct it.',
          },
          { text: 'Converting numbers is too slow for a checkout.', why: 'Speed is not the issue. Correctness is.' },
        ],
        answer: 1,
      },
      'discount-range': {
        question: 'Why refuse a 150% discount instead of lowering it to 100%?',
        options: [
          {
            text: 'An invalid code should be reported, not silently turned into a free order.',
            why: 'Clamping looks safe but changes what the shopper pays without telling anyone.',
          },
          { text: 'The tests only count a pass when an error is thrown.', why: 'Tests check the stated requirement. They do not prefer errors in general.' },
          { text: 'Discounts of 100% are not allowed.', why: 'They are. The range is 0 to 100 inclusive, and a test checks that 100% is free.' },
        ],
        answer: 0,
      },
      'empty-cart': {
        question: 'Why return 0 instead of an error or the text N/A?',
        options: [
          { text: '0 is what JavaScript returns by default.', why: 'It is not. Without the check the code returned NaN.' },
          { text: 'Errors would make the page slower.', why: 'Speed is not the concern here.' },
          {
            text: 'An empty cart is normal, and the page needs a number it can display as money.',
            why: 'The fix handles the edge case in the form the rest of the app expects.',
          },
        ],
        answer: 2,
      },
    },
  },

  'quiz-permissions': {
    fns: ['canDeleteQuizzes', 'deleteQuizzes'],
    html: `<h2>QuizHub</h2>
<fieldset><legend>Who are you?</legend>
<button id="asStudent" type="button">Sign in as student</button>
<button id="asAdmin" type="button">Sign in as teacher admin</button>
<button id="signOut" type="button">Sign out</button>
<p>Signed in as: <strong id="who">nobody</strong></p></fieldset>
<fieldset><legend>Quizzes</legend>
<p id="list"></p>
<button id="deleteButton" type="button" hidden>Delete all quizzes</button>
<button id="restore" type="button">Restore the two quizzes</button></fieldset>
<fieldset><legend>Address bar</legend>
<p class="tip">The Delete button is hidden unless you are an admin, but anyone can type the address.</p>
<button id="direct" type="button">Go to /admin/delete-all-quizzes</button>
<p id="out" role="status"></p></fieldset>`,
    wire: `var session = null;
var quizzes = ['Week 1 quiz', 'Week 2 quiz'];
function show() {
  document.getElementById('who').textContent = session ? session.user + ' (' + session.role + ')' : 'nobody';
  document.getElementById('list').textContent = quizzes.length ? quizzes.join(', ') : 'No quizzes left.';
  document.getElementById('deleteButton').hidden = !(session && session.role === 'admin');
}
function attempt() {
  var result = deleteQuizzes(session, quizzes);
  if (result && result.allowed) {
    quizzes = result.quizzes;
    document.getElementById('out').textContent = 'All quizzes deleted.';
  } else {
    document.getElementById('out').textContent = '403: only a teacher admin can delete quizzes.';
  }
  show();
}
document.getElementById('asStudent').addEventListener('click', function () { session = { user: 'alice', role: 'student' }; show(); });
document.getElementById('asAdmin').addEventListener('click', function () { session = { user: 'teacher', role: 'admin' }; show(); });
document.getElementById('signOut').addEventListener('click', function () { session = null; show(); });
document.getElementById('restore').addEventListener('click', function () { quizzes = ['Week 1 quiz', 'Week 2 quiz']; document.getElementById('out').textContent = ''; show(); });
document.getElementById('deleteButton').addEventListener('click', attempt);
document.getElementById('direct').addEventListener('click', attempt);
show();`,
    tryIt: 'Sign in as a student, or stay signed out, and go to the delete address directly.',
    detectors: {
      'hidden-button-only': { fn: 'deleteQuizzes', detect: "result && result.allowed === true && (!args[0] || args[0].role !== 'admin')" },
    },
    checks: [
      {
        testId: 'admin-delete',
        run: `const r = api.deleteQuizzes({ user: 'teacher', role: 'admin' }, ['Week 1 quiz', 'Week 2 quiz']);
const ok = Boolean(r) && r.allowed === true && Array.isArray(r.quizzes) && r.quizzes.length === 0;
return { pass: ok, actual: ok ? 'Deletion succeeds and the quiz list becomes empty.' : 'The admin could not delete the quizzes.' };`,
      },
      {
        testId: 'student-denied',
        run: `const r = api.deleteQuizzes({ user: 'alice', role: 'student' }, ['Week 1 quiz', 'Week 2 quiz']);
const ok = Boolean(r) && r.allowed === false && Array.isArray(r.quizzes) && r.quizzes.length === 2;
return { pass: ok, actual: ok ? 'Deletion is denied and both quizzes remain.' : 'A student deleted the quizzes by calling the operation directly.' };`,
      },
      {
        testId: 'guest-denied',
        run: `const r = api.deleteQuizzes(null, ['Week 1 quiz', 'Week 2 quiz']);
const ok = Boolean(r) && r.allowed === false && Array.isArray(r.quizzes) && r.quizzes.length === 2;
return { pass: ok, actual: ok ? 'Deletion is denied and both quizzes remain.' : 'A signed-out visitor deleted the quizzes by calling the operation directly.' };`,
      },
    ],
    repair: {
      template: `function canDeleteQuizzes(session) {
/*hidden-button-only:main*/
}
function deleteQuizzes(session, quizzes) {
  if (!canDeleteQuizzes(session)) return { allowed: false, quizzes };
  return { allowed: true, quizzes: [] };
}`,
      defaults: { 'hidden-button-only:main': '  return true;' },
      fixes: {
        'hidden-button-only': [
          {
            label: 'Allow the delete operation for anyone who is signed in.',
            say: 'The delete operation now checks that someone is signed in.',
            parts: { main: '  return Boolean(session);' },
            correct: false,
            why: 'Signed-out visitors are blocked, but a signed-in student can still delete every quiz. The requirement allows admins only.',
          },
          {
            label: 'Check the role when the delete operation runs: allow only role=admin.',
            say: 'The delete operation itself checks the session. Only role=admin is allowed; students and signed-out visitors are denied and the quizzes stay.',
            parts: { main: "  return Boolean(session) && session.role === 'admin';" },
            correct: true,
          },
          {
            label: 'Block the delete operation for students.',
            say: 'The delete operation now refuses anyone whose role is student.',
            parts: { main: "  return !session || session.role !== 'student';" },
            correct: false,
            why: 'Students are blocked, but a signed-out visitor has no session and gets through. Deny by default: allow only what the requirement names.',
          },
        ],
      },
    },
    explain: {
      'hidden-button-only': {
        question: 'Why is hiding the Delete button not enough?',
        options: [
          { text: 'Hidden buttons slow the page down.', why: 'Performance is not the problem here.' },
          { text: 'Students can still see hidden buttons.', why: 'Usually they cannot, and that is not what makes it unsafe.' },
          {
            text: 'The operation can be reached without the button, so the check must run where the action happens. In a real app that is the server.',
            why: 'The page is under the user\'s control. Only the action itself can enforce who may do it.',
          },
        ],
        answer: 2,
      },
    },
  },

  'notes-save': {
    fns: ['saveNote'],
    html: `<h2>Study notes</h2>
<label>Your note <textarea id="note" rows="3">Test note</textarea></label>
<button id="save" type="button">Save</button>
<p id="status" role="status"></p>
<fieldset><legend>Pretend server (you control it)</legend>
<p class="tip" id="server">No request yet.</p>
<button id="ok" type="button" disabled>Server: confirm the save</button>
<button id="fail" type="button" disabled>Server: fail the request</button>
<p>Stored on the server: <strong id="stored">nothing yet</strong></p></fieldset>`,
    wire: `var state = { draft: 'Test note', status: 'idle' };
var pending = null;
var stored = [];
var typed = '';
var api = { save: function (text) {
  return new Promise(function (resolve, reject) { pending = { resolve: resolve, reject: reject, text: text }; show(); });
} };
function show() {
  var note = document.getElementById('note');
  note.value = state.draft;
  note.disabled = state.status === 'saving';
  var words = { idle: '', saving: 'Saving…', saved: 'Saved ✓', error: 'Could not save. Your note is still here. Try again.' };
  document.getElementById('status').textContent = words[state.status] === undefined ? String(state.status) : words[state.status];
  document.getElementById('save').textContent = state.status === 'error' ? 'Retry' : 'Save';
  document.getElementById('server').textContent = pending ? 'A save request is waiting for the server.' : 'No request is waiting.';
  document.getElementById('ok').disabled = !pending;
  document.getElementById('fail').disabled = !pending;
  document.getElementById('stored').textContent = stored.length ? JSON.stringify(stored[stored.length - 1]) : 'nothing yet';
}
document.getElementById('save').addEventListener('click', function () {
  if (pending) return;
  state.draft = document.getElementById('note').value;
  typed = state.draft;
  var done = saveNote(state, api);
  // Saved is shown while the server has not answered yet.
  if (pending && state.status === 'saved') window.__report('false-success');
  show();
  Promise.resolve(done).then(show, show);
});
document.getElementById('ok').addEventListener('click', function () {
  var request = pending; pending = null; stored.push(request.text); request.resolve();
  setTimeout(show, 0);
});
document.getElementById('fail').addEventListener('click', function () {
  var request = pending; pending = null; request.reject(new Error('Network error'));
  setTimeout(function () {
    // The request failed and the note the learner typed is gone.
    if (typed && state.draft !== typed) window.__report('lost-draft');
    show();
  }, 0);
});
show();`,
    tryIt: 'Press Save and read the status before the server answers. Then make the server fail and look at your note.',
    detectors: {},
    checks: [
      {
        testId: 'pending-state',
        run: `const service = h.fakeApi();
const state = { draft: 'Test note', status: 'idle' };
const done = Promise.resolve(api.saveNote(state, service)).catch(function () {});
const status = state.status, draft = state.draft;
service.resolve();
await done;
return { pass: status === 'saving' && draft === 'Test note', actual: 'While the request is pending, status is ' + status + ' and the draft is ' + JSON.stringify(draft) + '.' };`,
      },
      {
        testId: 'successful-save',
        run: `const service = h.fakeApi();
const state = { draft: 'Test note', status: 'idle' };
const done = Promise.resolve(api.saveNote(state, service)).catch(function () {});
service.resolve();
await done;
return { pass: state.status === 'saved' && service.stored[0] === 'Test note', actual: 'Status is ' + state.status + ' and the service stored ' + JSON.stringify(service.stored[0]) + '.' };`,
      },
      {
        testId: 'failure-preserves-draft',
        run: `const service = h.fakeApi();
const state = { draft: 'Test note', status: 'idle' };
const done = Promise.resolve(api.saveNote(state, service)).catch(function () {});
service.reject();
await done;
return { pass: state.status === 'error' && state.draft === 'Test note', actual: 'After the request fails, status is ' + state.status + ' and the draft is ' + JSON.stringify(state.draft) + '.' };`,
      },
      {
        testId: 'retry-save',
        run: `const service = h.fakeApi();
const state = { draft: 'Test note', status: 'idle' };
const first = Promise.resolve(api.saveNote(state, service)).catch(function () {});
service.reject();
await first;
const second = Promise.resolve(api.saveNote(state, service)).catch(function () {});
const retried = service.resolve();
await second;
const last = service.stored[service.stored.length - 1];
if (!retried) return { pass: false, actual: 'The retry did not send a new save request.' };
return { pass: last === 'Test note' && state.status === 'saved', actual: 'The retry stores ' + JSON.stringify(last) + ' and status becomes ' + state.status + '.' };`,
      },
    ],
    repair: {
      template: `async function saveNote(state, api) {
/*false-success:guard*/
  const text = state.draft;
/*false-success:before*/
/*lost-draft:before*/
  try {
    await api.save(text);
/*false-success:success*/
  } catch (_) {
/*false-success:failure*/
/*lost-draft:failure*/
  }
/*false-success:after*/
/*lost-draft:after*/
}`,
      defaults: {
        'false-success:before': "  state.status = 'saved';",
        'false-success:failure': '    /* Failure is silently ignored. */',
        'lost-draft:before': "  state.draft = '';",
      },
      fixes: {
        'false-success': [
          {
            label: 'Show Saving first, then Saved once the request has finished either way.',
            say: 'The status is Saving while the request runs and changes to Saved when it finishes.',
            parts: { before: "  state.status = 'saving';", after: "  state.status = 'saved';" },
            correct: false,
            why: 'Saved now appears even when the request failed. Finished is not the same as succeeded: a failure must show an error.',
          },
          {
            label: 'Keep Saved as it is, and show an error if the request fails.',
            say: 'If the request fails, the status changes from Saved to an error.',
            parts: { before: "  state.status = 'saved';", failure: "    state.status = 'error';" },
            correct: false,
            why: 'Failures are reported now, but Saved is still shown before the server has confirmed anything. The pending state must be Saving.',
          },
          {
            label: 'Show Saving while the request is pending, Saved only after it succeeds, and an error if it fails.',
            say: 'The status is Saving while the request is pending. It becomes Saved only after the server confirms, and an error if the request fails. A second save is ignored while one is pending.',
            parts: {
              guard: "  if (state.status === 'saving') return;",
              before: "  state.status = 'saving';",
              success: "    state.status = 'saved';",
              failure: "    state.status = 'error';",
            },
            correct: true,
          },
        ],
        'lost-draft': [
          {
            label: 'Keep the draft in place; do not clear it when saving.',
            say: 'The draft is no longer cleared, so it survives a failed request and a retry sends the same note.',
            parts: {},
            correct: true,
          },
          {
            label: 'Clear the draft, and put the text back if saving fails.',
            say: 'The draft is cleared when saving starts and restored if the request fails.',
            parts: { before: "  state.draft = '';", failure: '    state.draft = text;' },
            correct: false,
            why: 'The note comes back after a failure, but it disappears from the page while the request is pending. The requirement keeps the exact draft throughout.',
          },
          {
            label: 'Clear the draft after the request finishes instead of before.',
            say: 'The draft is now cleared once the request has finished.',
            parts: { after: "  state.draft = '';" },
            correct: false,
            why: 'A failed request also "finishes", so the note is still lost and a retry sends an empty note.',
          },
        ],
      },
    },
    explain: {
      'false-success': {
        question: 'Why must Saved wait for the server to confirm?',
        options: [
          {
            text: 'Until the server answers, the app does not know whether the note was stored. Showing Saved early tells the user something that may be false.',
            why: 'A success message is a claim. It needs evidence, which here is the confirmed request.',
          },
          { text: 'Because the word Saved takes time to draw on screen.', why: 'Rendering speed has nothing to do with it.' },
          { text: 'Because servers only accept one status at a time.', why: 'The status lives in the page, not on the server.' },
        ],
        answer: 0,
      },
      'lost-draft': {
        question: 'Why keep the draft instead of clearing it and restoring it on failure?',
        options: [
          { text: 'Restoring text uses too much memory.', why: 'Memory is not the concern for a short note.' },
          {
            text: 'The only copy of the user\'s work should not be thrown away before it is safely stored. Keeping it makes failure and retry safe by default.',
            why: 'Clearing first creates a moment where the note exists nowhere the user can see.',
          },
          { text: 'Because the tests forbid assigning to the draft.', why: 'The tests check what the user would see, not which statements are used.' },
        ],
        answer: 1,
      },
    },
  },
};
