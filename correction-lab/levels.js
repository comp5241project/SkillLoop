/**
 * "Break the vibe-coded app" levels. Each level is a small working app whose logic was written
 * the way a coding agent often writes it: the happy path works and the rest was never checked.
 * The apps and bugs are authored by the team from the course lectures.
 *
 * - code: the editable logic. fns: the functions the app and the tests call.
 * - html + wire: the app shell that runs in a sandboxed frame (not editable).
 * - bugs: found when a call to `fn` makes `detect` true (args, result, error are in scope).
 * - rules: the behaviour the fix must have. tests: checked by really running the code;
 *   `api` holds the functions, `approx(a, b)` compares numbers, `throws(fn)` expects an error.
 * Keep level and bug IDs stable: saved progress uses them. The inner code avoids backticks.
 */
window.SkillLoopLevels = [
  {
    id: 'cart-checkout',
    name: 'QuizShop checkout',
    conceptId: 'edge-cases',
    source: 'Software testing · Vibe coding',
    request: 'Build a checkout that adds up the cart, applies a discount code and shows the average price.',
    claim: 'Done! I tested it with 2 notebooks and 1 pen and the total is correct. Ready to ship.',
    fns: ['cartTotal', 'averagePrice'],
    code: `function cartTotal(items, discountPercent) {
  let total = 0;
  for (const item of items) {
    total += item.price * item.qty;
  }
  return total - total * (discountPercent / 100);
}

function averagePrice(items) {
  let count = 0;
  for (const item of items) {
    count += item.qty;
  }
  return cartTotal(items, 0) / count;
}`,
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
    bugs: [
      {
        id: 'negative-quantity',
        fn: 'cartTotal',
        detect: '!error && args[0].some(function (item) { return item.qty < 0; })',
        hint: 'What if a shopper asks for fewer than zero of something?',
        title: 'A negative quantity lowers the bill',
        explain:
          'The code multiplies whatever quantity it is given, so -3 notebooks subtract money. Invalid input should be rejected, which is what a negative test checks.',
      },
      {
        id: 'discount-range',
        fn: 'cartTotal',
        detect: '!error && (args[1] > 100 || args[1] < 0)',
        hint: 'Discount codes are percentages. Which percentages make no sense?',
        title: 'A discount over 100% pays the shopper',
        explain:
          'Nothing limits the discount to 0–100, so 150% gives a negative total and a negative discount raises the price. Boundaries need an explicit rule.',
      },
      {
        id: 'empty-cart',
        fn: 'averagePrice',
        detect: '!error && !Number.isFinite(result)',
        hint: 'The agent only tried a cart with things in it.',
        title: 'An empty cart shows $NaN',
        explain:
          'With no items the average divides 0 by 0. The empty case is the classic edge case: decide what should happen before writing the code.',
      },
    ],
    rules: [
      'A quantity must be a whole number of 1 or more. Otherwise throw an Error.',
      'A discount must be between 0 and 100. Otherwise throw an Error.',
      'The average price of an empty cart is 0.',
    ],
    tests: [
      {
        name: '2 notebooks and 1 pen cost 49.97',
        check: 'approx(api.cartTotal([{ price: 19.99, qty: 2 }, { price: 9.99, qty: 1 }], 0), 49.97)',
      },
      {
        name: 'A 10% discount is applied',
        check: 'approx(api.cartTotal([{ price: 19.99, qty: 2 }, { price: 9.99, qty: 1 }], 10), 44.973)',
      },
      { name: 'A 100% discount makes the cart free', check: 'approx(api.cartTotal([{ price: 9.99, qty: 1 }], 100), 0)' },
      {
        name: 'A negative quantity is rejected',
        check: 'throws(function () { api.cartTotal([{ price: 19.99, qty: -3 }], 0); })',
      },
      {
        name: 'A quantity that is not a whole number is rejected',
        check:
          'throws(function () { api.cartTotal([{ price: 19.99, qty: 1.5 }], 0); }) && throws(function () { api.cartTotal([{ price: 19.99, qty: NaN }], 0); })',
      },
      {
        name: 'A discount above 100 or below 0 is rejected',
        check:
          'throws(function () { api.cartTotal([{ price: 9.99, qty: 1 }], 150); }) && throws(function () { api.cartTotal([{ price: 9.99, qty: 1 }], -5); })',
      },
      { name: 'The average of an empty cart is 0', check: 'api.averagePrice([]) === 0' },
      {
        name: 'The average of 3 items is 16.66',
        check: 'approx(api.averagePrice([{ price: 19.99, qty: 2 }, { price: 9.99, qty: 1 }]), 16.6567)',
      },
    ],
    reference: `function checkItems(items) {
  for (const item of items) {
    if (!Number.isInteger(item.qty) || item.qty < 1) {
      throw new Error('Quantity must be a whole number of 1 or more.');
    }
  }
}

function cartTotal(items, discountPercent) {
  checkItems(items);
  if (!(discountPercent >= 0 && discountPercent <= 100)) {
    throw new Error('Discount must be between 0 and 100.');
  }
  let total = 0;
  for (const item of items) {
    total += item.price * item.qty;
  }
  return total - total * (discountPercent / 100);
}

function averagePrice(items) {
  if (items.length === 0) return 0;
  let count = 0;
  for (const item of items) {
    count += item.qty;
  }
  return cartTotal(items, 0) / count;
}`,
    lesson: {
      question: 'Which request would have stopped the agent shipping these bugs?',
      options: [
        { text: '"Make the checkout more robust."', why: '"Robust" is not something the agent can check, so it will guess again.' },
        {
          text: '"Reject quantities below 1 and discounts outside 0–100, return 0 for an empty cart, and show me passing tests for each rule."',
          why: 'It states the rules for invalid and empty input and asks for evidence, so "done" has a meaning.',
        },
        { text: '"Rewrite it in TypeScript."', why: 'Types would not stop -3 or 150, which are valid numbers.' },
      ],
      answer: 1,
    },
  },
  {
    id: 'quizhub-admin',
    name: 'QuizHub sign-in',
    conceptId: 'ai-code-review',
    source: 'AI in software development · SDLC',
    request: 'Add sign-up with a password of at least 8 characters, sign-in, and a delete-all-quizzes page for admins only.',
    claim: 'All done. Students cannot see the Delete button, and I signed in as alice to confirm it works.',
    fns: ['isValidPassword', 'login', 'canDeleteQuizzes'],
    code: `const USERS = {
  alice: { password: 'quiz-pass', role: 'student' },
  teacher: { password: 'Gr8-quizzes!', role: 'admin' },
};

function isValidPassword(password) {
  return password.length > 8;
}

function login(username, password, failedAttempts) {
  const user = USERS[username];
  if (!user || user.password !== password) return { ok: false };
  return { ok: true, role: user.role };
}

// The Delete button is only shown to admins in the UI.
function canDeleteQuizzes(session) {
  return true;
}`,
    html: `<h2>QuizHub</h2>
<fieldset><legend>Create account</legend>
<label>New password <input id="np" autocomplete="off"></label>
<button id="create" type="button">Create account</button>
<p id="createOut" role="status"></p></fieldset>
<fieldset><legend>Sign in</legend>
<p class="tip">Demo student account: alice / quiz-pass</p>
<label>Username <input id="u" value="alice" autocomplete="off"></label>
<label>Password <input id="p" autocomplete="off"></label>
<button id="signin" type="button">Sign in</button>
<p id="loginOut" role="status"></p></fieldset>
<fieldset><legend>Address bar</legend>
<p>Signed in as: <strong id="who">nobody</strong>. The Delete button is hidden for you, but you can still type the address.</p>
<button id="admin" type="button">Go to /admin/delete-all-quizzes</button>
<p id="adminOut" role="status"></p></fieldset>`,
    wire: `var session = null;
var failed = 0;
document.getElementById('create').addEventListener('click', function () {
  var ok = isValidPassword(document.getElementById('np').value);
  document.getElementById('createOut').textContent = ok ? 'Account created.' : 'Password must be at least 8 characters.';
});
document.getElementById('signin').addEventListener('click', function () {
  var out = document.getElementById('loginOut');
  var name = document.getElementById('u').value;
  var result = login(name, document.getElementById('p').value, failed);
  if (result && result.locked) {
    out.textContent = 'Too many attempts. Try again later.';
  } else if (result && result.ok) {
    session = { user: name, role: result.role };
    failed = 0;
    document.getElementById('who').textContent = name + ' (' + result.role + ')';
    out.textContent = 'Welcome, ' + name + '.';
  } else {
    failed += 1;
    out.textContent = 'Wrong username or password. Failed attempts: ' + failed;
  }
});
document.getElementById('admin').addEventListener('click', function () {
  document.getElementById('adminOut').textContent = canDeleteQuizzes(session)
    ? 'All quizzes deleted!'
    : '403: admins only.';
});`,
    bugs: [
      {
        id: 'hidden-button-only',
        fn: 'canDeleteQuizzes',
        detect: "result === true && (!args[0] || args[0].role !== 'admin')",
        hint: 'The button is hidden. Is the page itself protected?',
        title: 'Anyone who knows the address can delete everything',
        explain:
          'Hiding a button is not access control. The check has to run where the action happens: in a real app, on the server for every request.',
      },
      {
        id: 'password-boundary',
        fn: 'isValidPassword',
        detect: 'typeof args[0] === "string" && args[0].length === 8 && result === false',
        hint: 'The requirement says "at least 8". Try the exact boundary.',
        title: 'An 8-character password is refused',
        explain:
          'The code uses > 8, which excludes 8, so it does not match the requirement. Boundary values are where requirement and code most often disagree.',
      },
      {
        id: 'no-lockout',
        fn: 'login',
        detect: 'args[2] >= 5 && !(result && result.locked)',
        hint: 'How many times will it let you guess a password?',
        title: 'Unlimited password guesses',
        explain:
          'The failed-attempt count is passed in but never used, so an attacker can guess forever. The lectures list missing rate limiting as a common gap in AI-built apps.',
      },
    ],
    rules: [
      'A password of 8 or more characters is valid.',
      'After 5 failed attempts, login returns { ok: false, locked: true } without checking the password.',
      "Only a session with role 'admin' may delete quizzes. No session means no access.",
    ],
    tests: [
      { name: 'A student can sign in', check: "api.login('alice', 'quiz-pass', 0).ok === true" },
      { name: 'A wrong password fails', check: "api.login('alice', 'nope', 0).ok === false" },
      {
        name: '8 characters is valid, 7 is not',
        check: "api.isValidPassword('abcdefgh') === true && api.isValidPassword('abcdefg') === false",
      },
      {
        name: 'Locked after 5 failed attempts, even with the right password',
        check: "(function () { var r = api.login('alice', 'quiz-pass', 5); return r.ok === false && r.locked === true; })()",
      },
      { name: 'An admin can delete quizzes', check: "api.canDeleteQuizzes({ user: 'teacher', role: 'admin' }) === true" },
      { name: 'A student cannot delete quizzes', check: "api.canDeleteQuizzes({ user: 'alice', role: 'student' }) === false" },
      { name: 'A signed-out visitor cannot delete quizzes', check: 'api.canDeleteQuizzes(null) === false' },
    ],
    reference: `const USERS = {
  alice: { password: 'quiz-pass', role: 'student' },
  teacher: { password: 'Gr8-quizzes!', role: 'admin' },
};

function isValidPassword(password) {
  return password.length >= 8;
}

function login(username, password, failedAttempts) {
  if (failedAttempts >= 5) return { ok: false, locked: true };
  const user = USERS[username];
  if (!user || user.password !== password) return { ok: false };
  return { ok: true, role: user.role };
}

function canDeleteQuizzes(session) {
  return Boolean(session) && session.role === 'admin';
}`,
    lesson: {
      question: 'In a real app, where must the admin check run?',
      options: [
        {
          text: 'On the server, for every request to the delete action.',
          why: 'The browser is under the user\'s control. Only the server can enforce who may do what.',
        },
        { text: 'In the page, by hiding the button from students.', why: 'That is what the agent did. The address still works.' },
        { text: 'In the CSS, with display: none.', why: 'Hidden elements can still be reached and requests can be sent directly.' },
      ],
      answer: 0,
    },
  },
];
