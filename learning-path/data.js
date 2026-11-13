/**
 * Shared case data for the four learning-path parts.
 * The same file is loaded by the browser and required by the server, so the
 * case IDs, question IDs, option IDs and concept IDs cannot drift.
 */
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.LearningPathDiagnosisData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const knowledgePoints = [
    { id: 'foundations', title: 'Programming foundations' },
    { id: 'requirements', title: 'Requirements and scope' },
    { id: 'code-reading', title: 'Code reading' },
    { id: 'software-testing', title: 'Testing and verification' },
    { id: 'communication', title: 'Communication' },
    { id: 'ai-code-review', title: 'AI code review' },
    { id: 'edge-cases', title: 'Edge cases' },
  ];

  const nextSteps = {
    foundations:
      'Trace one small program line by line and write down the value of each variable.',
    requirements:
      'Rewrite one vague sentence from the case as three testable acceptance criteria.',
    'code-reading':
      'Note the inputs, output and one hidden assumption in the case snippet.',
    'software-testing':
      'List one happy path, one boundary and one failure test before changing the code.',
    communication:
      'Report one bug with steps to reproduce, expected result and actual result.',
    'ai-code-review':
      'Ask an AI suggestion for its failure cases, then check one claim against the code.',
    'edge-cases':
      'Name the empty, duplicate, expired and offline states this case must handle.',
  };

  const cases = [
  {
    "id": "cart-checkout",
    "title": "QuizShop checkout",
    "tagline": "Quantities, discounts and empty carts",
    "summary": "You are the engineer reviewing an AI-built checkout before release. Each included item must have an integer quantity of at least 1. Reject invalid quantities with a clear message; do not silently change them. The UI omits an item whose quantity is 0. It must not omit negative or fractional quantities before the learner can observe the initial defect. Accept discount percentages from 0 through 100 inclusive. Reject values outside that range. An empty cart is allowed. Its total and average price per item are both numeric 0. Preserve correct totals and quantity-weighted averages for valid orders. Display money to two decimal places.",
    "snippet": "function cartTotal(items, discountPercent) {\n  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);\n  return total * (1 - discountPercent / 100);\n}\nfunction averagePrice(items) {\n  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);\n  const count = items.reduce((sum, item) => sum + item.qty, 0);\n  return total / count;\n}",
    "stack": "JavaScript",
    "knowledgePoints": [
      "requirements",
      "code-reading",
      "software-testing",
      "edge-cases"
    ],
    "questions": [
      {
        "id": "cart-checkout-requirements",
        "conceptId": "requirements",
        "prompt": "An AI suggests turning negative quantities into positive ones. What would you request?",
        "strength": "Included quantities must be integers of at least one. Reject invalid values instead of changing the order.",
        "gap": "Review the requirement and explain a check that exposes the defect.",
        "options": [
          {
            "id": "best",
            "score": 2,
            "label": "Reject invalid quantities with a clear message and preserve valid orders.",
            "feedback": "Included quantities must be integers of at least one. Reject invalid values instead of changing the order."
          },
          {
            "id": "partial",
            "score": 1,
            "label": "Only prevent the total from becoming negative.",
            "feedback": "This checks part of the behavior but leaves a requirement unverified."
          },
          {
            "id": "off",
            "score": 0,
            "label": "Use absolute values for all quantities.",
            "feedback": "Compare this with the stated requirement and observable behavior."
          }
        ]
      },
      {
        "id": "cart-checkout-code-reading",
        "conceptId": "code-reading",
        "prompt": "What assumption does averagePrice make when it divides total by count?",
        "strength": "An empty cart gives total=0 and count=0. Dividing them does not produce the required numeric zero.",
        "gap": "Review the requirement and explain a check that exposes the defect.",
        "options": [
          {
            "id": "best",
            "score": 2,
            "label": "It assumes the total quantity is nonzero; an empty cart needs an explicit zero result.",
            "feedback": "An empty cart gives total=0 and count=0. Dividing them does not produce the required numeric zero."
          },
          {
            "id": "partial",
            "score": 1,
            "label": "It assumes all products have the same price.",
            "feedback": "This checks part of the behavior but leaves a requirement unverified."
          },
          {
            "id": "off",
            "score": 0,
            "label": "It handles an empty cart because reduce starts at zero.",
            "feedback": "Compare this with the stated requirement and observable behavior."
          }
        ]
      },
      {
        "id": "cart-checkout-software-testing",
        "conceptId": "software-testing",
        "prompt": "Which checks best support accepting a checkout repair?",
        "strength": "A successful normal purchase is not enough. Check rejected inputs and preserve valid totals and weighted averages.",
        "gap": "Review the requirement and explain a check that exposes the defect.",
        "options": [
          {
            "id": "best",
            "score": 2,
            "label": "Check valid orders, invalid quantities, discount boundaries and an empty cart.",
            "feedback": "A successful normal purchase is not enough. Check rejected inputs and preserve valid totals and weighted averages."
          },
          {
            "id": "partial",
            "score": 1,
            "label": "Check several valid orders only.",
            "feedback": "This checks part of the behavior but leaves a requirement unverified."
          },
          {
            "id": "off",
            "score": 0,
            "label": "Accept the AI explanation without running checks.",
            "feedback": "Compare this with the stated requirement and observable behavior."
          }
        ]
      },
      {
        "id": "cart-checkout-edge-cases",
        "conceptId": "edge-cases",
        "prompt": "How should the checkout handle discounts at and beyond the limits?",
        "strength": "The discount range includes both endpoints. Values outside it must be rejected, not clamped.",
        "gap": "Review the requirement and explain a check that exposes the defect.",
        "options": [
          {
            "id": "best",
            "score": 2,
            "label": "Accept 0 and 100, reject values below 0 or above 100.",
            "feedback": "The discount range includes both endpoints. Values outside it must be rejected, not clamped."
          },
          {
            "id": "partial",
            "score": 1,
            "label": "Test 0 and 100 without checking values outside the range.",
            "feedback": "This checks part of the behavior but leaves a requirement unverified."
          },
          {
            "id": "off",
            "score": 0,
            "label": "Clamp every discount into the allowed range.",
            "feedback": "Compare this with the stated requirement and observable behavior."
          }
        ]
      }
    ]
  },
  {
    "id": "quiz-permissions",
    "title": "QuizHub permissions",
    "tagline": "Action permissions and preserved data",
    "summary": "You review a quiz app where only the teacher administrator may delete quizzes. The teacher administrator is represented by role=admin in this exercise. A student has role=student; a signed-out visitor has a null session. Check permission when the delete operation is performed, even if its entry point is reached directly. An admin may delete quizzes. Students and signed-out visitors must be denied, and denied requests must not change quiz data. In a real application, enforce this check on the server using its authenticated session. The exercise uses a local simulated action boundary.",
    "snippet": "function canDeleteQuizzes(session) { return true; }\nfunction deleteQuizzes(session, quizzes) {\n  if (!canDeleteQuizzes(session)) return { allowed: false, quizzes };\n  return { allowed: true, quizzes: [] };\n}",
    "stack": "JavaScript",
    "knowledgePoints": [
      "requirements",
      "ai-code-review",
      "software-testing",
      "communication"
    ],
    "questions": [
      {
        "id": "quiz-permissions-requirements",
        "conceptId": "requirements",
        "prompt": "A student calls the delete action directly. What must happen?",
        "strength": "The action boundary must enforce role=admin. Hiding a control does not enforce permission.",
        "gap": "Review the requirement and explain a check that exposes the defect.",
        "options": [
          {
            "id": "best",
            "score": 2,
            "label": "Deny deletion and leave all quizzes unchanged.",
            "feedback": "The action boundary must enforce role=admin. Hiding a control does not enforce permission."
          },
          {
            "id": "partial",
            "score": 1,
            "label": "Hide the delete button from students.",
            "feedback": "This checks part of the behavior but leaves a requirement unverified."
          },
          {
            "id": "off",
            "score": 0,
            "label": "Allow deletion because the action was reached.",
            "feedback": "Compare this with the stated requirement and observable behavior."
          }
        ]
      },
      {
        "id": "quiz-permissions-ai-code-review",
        "conceptId": "ai-code-review",
        "prompt": "The AI says hiding the delete button makes deletion secure. How would you review that claim?",
        "strength": "canDeleteQuizzes currently always returns true. Check the behavior of the operation, not the confidence of the explanation.",
        "gap": "Review the requirement and explain a check that exposes the defect.",
        "options": [
          {
            "id": "best",
            "score": 2,
            "label": "Call the delete operation directly as a student and inspect permission and data.",
            "feedback": "canDeleteQuizzes currently always returns true. Check the behavior of the operation, not the confidence of the explanation."
          },
          {
            "id": "partial",
            "score": 1,
            "label": "Inspect the button visibility only.",
            "feedback": "This checks part of the behavior but leaves a requirement unverified."
          },
          {
            "id": "off",
            "score": 0,
            "label": "Trust the claim because the UI looks correct.",
            "feedback": "Compare this with the stated requirement and observable behavior."
          }
        ]
      },
      {
        "id": "quiz-permissions-software-testing",
        "conceptId": "software-testing",
        "prompt": "Which permission tests are needed?",
        "strength": "A rejected result is insufficient if the function already deleted data. Check both authorization and the resulting list.",
        "gap": "Review the requirement and explain a check that exposes the defect.",
        "options": [
          {
            "id": "best",
            "score": 2,
            "label": "Admin succeeds; student and signed-out visitor are denied with data unchanged.",
            "feedback": "A rejected result is insufficient if the function already deleted data. Check both authorization and the resulting list."
          },
          {
            "id": "partial",
            "score": 1,
            "label": "Admin succeeds and student is denied, without inspecting data.",
            "feedback": "This checks part of the behavior but leaves a requirement unverified."
          },
          {
            "id": "off",
            "score": 0,
            "label": "Only test an admin because admins use the button.",
            "feedback": "Compare this with the stated requirement and observable behavior."
          }
        ]
      },
      {
        "id": "quiz-permissions-communication",
        "conceptId": "communication",
        "prompt": "Which request gives the AI a verifiable permission fix?",
        "strength": "State the actor, action, expected permission and data effect so the next implementation can be checked.",
        "gap": "Review the requirement and explain a check that exposes the defect.",
        "options": [
          {
            "id": "best",
            "score": 2,
            "label": "Check the session role during deletion, allow admins only, preserve data on denial and test all three roles.",
            "feedback": "State the actor, action, expected permission and data effect so the next implementation can be checked."
          },
          {
            "id": "partial",
            "score": 1,
            "label": "Make deletion more secure.",
            "feedback": "This checks part of the behavior but leaves a requirement unverified."
          },
          {
            "id": "off",
            "score": 0,
            "label": "Improve the button styling.",
            "feedback": "Compare this with the stated requirement and observable behavior."
          }
        ]
      }
    ]
  },
  {
    "id": "notes-save",
    "title": "Study notes: did it really save?",
    "tagline": "Pending saves, failure and retry",
    "summary": "You review a notes app that displays Saved immediately, but loses a draft when the request fails. Set status=saving while the save request is pending. Show saved only after the request confirms success. If saving fails, set status=error, preserve the exact draft and allow a retry. A successful retry must store the original draft and set status=saved. For this exercise, allow one save request at a time and freeze editing while it is pending. Use a controlled fake service for success, failure and delay.",
    "snippet": "async function saveNote(state, api) {\n  const text = state.draft;\n  state.status = 'saved';\n  state.draft = '';\n  try { await api.save(text); } catch (_) { /* Failure is silently ignored. */ }\n}",
    "stack": "JavaScript",
    "knowledgePoints": [
      "requirements",
      "code-reading",
      "software-testing",
      "edge-cases"
    ],
    "questions": [
      {
        "id": "notes-save-requirements",
        "conceptId": "requirements",
        "prompt": "What should the note editor do while a save request is pending?",
        "strength": "A started request is not confirmed persistence. Show saving until success and keep the draft available on failure.",
        "gap": "Review the requirement and explain a check that exposes the defect.",
        "options": [
          {
            "id": "best",
            "score": 2,
            "label": "Show saving, allow only one request and preserve the draft until the outcome is known.",
            "feedback": "A started request is not confirmed persistence. Show saving until success and keep the draft available on failure."
          },
          {
            "id": "partial",
            "score": 1,
            "label": "Disable the button but immediately show saved.",
            "feedback": "This checks part of the behavior but leaves a requirement unverified."
          },
          {
            "id": "off",
            "score": 0,
            "label": "Clear the draft and show saved immediately.",
            "feedback": "Compare this with the stated requirement and observable behavior."
          }
        ]
      },
      {
        "id": "notes-save-code-reading",
        "conceptId": "code-reading",
        "prompt": "What is wrong with clearing state.draft before awaiting api.save(text)?",
        "strength": "The current code clears the draft and announces success before the service replies. A swallowed error leaves misleading state.",
        "gap": "Review the requirement and explain a check that exposes the defect.",
        "options": [
          {
            "id": "best",
            "score": 2,
            "label": "If the request fails, the editor loses the draft needed for retry.",
            "feedback": "The current code clears the draft and announces success before the service replies. A swallowed error leaves misleading state."
          },
          {
            "id": "partial",
            "score": 1,
            "label": "It makes the save service run twice.",
            "feedback": "This checks part of the behavior but leaves a requirement unverified."
          },
          {
            "id": "off",
            "score": 0,
            "label": "Nothing: await guarantees the request succeeds.",
            "feedback": "Compare this with the stated requirement and observable behavior."
          }
        ]
      },
      {
        "id": "notes-save-software-testing",
        "conceptId": "software-testing",
        "prompt": "How would you test saving without depending on a real network?",
        "strength": "A controlled fake service lets you observe the pending state, force failure and verify that retry stores the same text.",
        "gap": "Review the requirement and explain a check that exposes the defect.",
        "options": [
          {
            "id": "best",
            "score": 2,
            "label": "Use a controlled service for delay, rejection and successful retry; inspect status and draft.",
            "feedback": "A controlled fake service lets you observe the pending state, force failure and verify that retry stores the same text."
          },
          {
            "id": "partial",
            "score": 1,
            "label": "Test a successful save only.",
            "feedback": "This checks part of the behavior but leaves a requirement unverified."
          },
          {
            "id": "off",
            "score": 0,
            "label": "Wait a fixed time and assume the save completed.",
            "feedback": "Compare this with the stated requirement and observable behavior."
          }
        ]
      },
      {
        "id": "notes-save-edge-cases",
        "conceptId": "edge-cases",
        "prompt": "The first save fails. What should a retry send?",
        "strength": "Keep the failed draft and permit retry. This exercise allows one request at a time and freezes editing while pending.",
        "gap": "Review the requirement and explain a check that exposes the defect.",
        "options": [
          {
            "id": "best",
            "score": 2,
            "label": "The original draft, retained unchanged after failure.",
            "feedback": "Keep the failed draft and permit retry. This exercise allows one request at a time and freezes editing while pending."
          },
          {
            "id": "partial",
            "score": 1,
            "label": "A new empty note to clear the error.",
            "feedback": "This checks part of the behavior but leaves a requirement unverified."
          },
          {
            "id": "off",
            "score": 0,
            "label": "Whatever text the AI guesses was entered.",
            "feedback": "Compare this with the stated requirement and observable behavior."
          }
        ]
      }
    ]
  }
];

  function findCase(caseId) {
    return cases.find((item) => item.id === caseId) || null;
  }

  function findQuestion(caseData, questionId) {
    if (!caseData) return null;
    return caseData.questions.find((item) => item.id === questionId) || null;
  }

  function knowledgePoint(conceptId) {
    return knowledgePoints.find((item) => item.id === conceptId) || null;
  }

  return {
    schemaVersion: 1,
    knowledgePoints,
    nextSteps,
    cases,
    findCase,
    findQuestion,
    knowledgePoint,
  };
});
