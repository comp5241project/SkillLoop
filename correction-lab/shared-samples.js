/** Derived from docs/team-samples/samples.json by sync-shared.cjs. Do not edit by hand. */
(function (root) {
  const data = {
    "topics": [
      {
        "topicId": "requirements",
        "title": "Requirements and expected behaviour"
      },
      {
        "topicId": "edge-cases",
        "title": "Input validation and edge cases"
      },
      {
        "topicId": "software-testing",
        "title": "Testing and verification"
      },
      {
        "topicId": "ai-code-review",
        "title": "Reviewing AI-generated code"
      },
      {
        "topicId": "code-reading",
        "title": "Reading program behaviour"
      },
      {
        "topicId": "communication",
        "title": "Communicating repair requests"
      }
    ],
    "cases": {
      "cart-checkout": {
        "caseId": "cart-checkout",
        "title": "QuizShop checkout",
        "scenario": "You are the engineer reviewing an AI-built checkout before release.",
        "aiClaim": "I tested 2 notebooks and 1 pen. The checkout is ready to ship.",
        "requirements": [
          "Each included item must have an integer quantity of at least 1. Reject invalid quantities with a clear message; do not silently change them.",
          "The UI omits an item whose quantity is 0. It must not omit negative or fractional quantities before the learner can observe the initial defect.",
          "Accept discount percentages from 0 through 100 inclusive. Reject values outside that range.",
          "An empty cart is allowed. Its total and average price per item are both numeric 0.",
          "Preserve correct totals and quantity-weighted averages for valid orders. Display money to two decimal places."
        ],
        "topicIds": [
          "requirements",
          "edge-cases",
          "software-testing"
        ],
        "starterCode": "function cartTotal(items, discountPercent) {\n  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);\n  return total * (1 - discountPercent / 100);\n}\nfunction averagePrice(items) {\n  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);\n  const count = items.reduce((sum, item) => sum + item.qty, 0);\n  return total / count;\n}",
        "issues": [
          {
            "issueId": "negative-quantity",
            "title": "Invalid quantities are accepted",
            "topicIds": [
              "requirements",
              "edge-cases"
            ],
            "observed": "A quantity of -3 notebooks produces a negative total.",
            "suggestedChange": "Reject negative and fractional quantities before calculation. Do not convert them to positive integers.",
            "suggestedChecks": [
              "reject-negative",
              "reject-fraction",
              "normal-total"
            ]
          },
          {
            "issueId": "discount-range",
            "title": "Discount range is unchecked",
            "topicIds": [
              "requirements",
              "edge-cases"
            ],
            "observed": "A discount of 150 percent produces a negative total.",
            "suggestedChange": "Reject discounts outside 0–100 and preserve the valid endpoints.",
            "suggestedChecks": [
              "discount-range",
              "full-discount",
              "normal-discount"
            ]
          },
          {
            "issueId": "empty-cart",
            "title": "Empty input produces NaN",
            "topicIds": [
              "edge-cases",
              "software-testing"
            ],
            "observed": "The average of an empty cart is NaN.",
            "suggestedChange": "Return numeric 0 for an empty cart and preserve the weighted average for nonempty carts.",
            "suggestedChecks": [
              "empty-average",
              "normal-average"
            ]
          }
        ],
        "tests": [
          {
            "testId": "normal-total",
            "issueId": null,
            "action": "2 notebooks at 19.99 and 1 pen at 9.99; discount 0",
            "expected": "Total is 49.97."
          },
          {
            "testId": "normal-discount",
            "issueId": null,
            "action": "The same cart; discount 10",
            "expected": "Raw total is approximately 44.973; displayed total is 44.97."
          },
          {
            "testId": "full-discount",
            "issueId": "discount-range",
            "action": "1 pen at 9.99; discount 100",
            "expected": "Total is 0."
          },
          {
            "testId": "reject-negative",
            "issueId": "negative-quantity",
            "action": "1 notebook entry with qty -3; discount 0",
            "expected": "Reject with a clear message; no order is silently changed."
          },
          {
            "testId": "reject-fraction",
            "issueId": "negative-quantity",
            "action": "1 notebook entry with qty 1.5; discount 0",
            "expected": "Reject with a clear message."
          },
          {
            "testId": "discount-range",
            "issueId": "discount-range",
            "action": "1 pen at 9.99; separately try discounts -5 and 150",
            "expected": "Reject both values with a clear message."
          },
          {
            "testId": "empty-average",
            "issueId": "empty-cart",
            "action": "No items; calculate total at discount 0 and average",
            "expected": "Total and average are both numeric 0."
          },
          {
            "testId": "normal-average",
            "issueId": null,
            "action": "2 notebooks at 19.99 and 1 pen at 9.99",
            "expected": "Average is approximately 16.6567; displayed average is 16.66."
          }
        ]
      },
      "quiz-permissions": {
        "caseId": "quiz-permissions",
        "title": "QuizHub permissions",
        "scenario": "You review a quiz app where only the teacher administrator may delete quizzes.",
        "aiClaim": "I hid the delete button from students, so quizzes are protected.",
        "requirements": [
          "The teacher administrator is represented by role=admin in this exercise. A student has role=student; a signed-out visitor has a null session.",
          "Check permission when the delete operation is performed, even if its entry point is reached directly.",
          "An admin may delete quizzes. Students and signed-out visitors must be denied, and denied requests must not change quiz data.",
          "In a real application, enforce this check on the server using its authenticated session. The exercise uses a local simulated action boundary."
        ],
        "topicIds": [
          "requirements",
          "ai-code-review",
          "software-testing"
        ],
        "starterCode": "function canDeleteQuizzes(session) { return true; }\nfunction deleteQuizzes(session, quizzes) {\n  if (!canDeleteQuizzes(session)) return { allowed: false, quizzes };\n  return { allowed: true, quizzes: [] };\n}",
        "issues": [
          {
            "issueId": "hidden-button-only",
            "title": "Hidden controls do not enforce permission",
            "topicIds": [
              "ai-code-review",
              "requirements"
            ],
            "observed": "A student can call the delete operation even though the button is hidden.",
            "suggestedChange": "Check the authenticated role at the action boundary, deny non-admins without changing data, and preserve admin access.",
            "suggestedChecks": [
              "admin-delete",
              "student-denied",
              "guest-denied"
            ]
          }
        ],
        "tests": [
          {
            "testId": "admin-delete",
            "issueId": null,
            "action": "Call the delete operation as role=admin with two stored quizzes",
            "expected": "Deletion succeeds and the quiz list becomes empty."
          },
          {
            "testId": "student-denied",
            "issueId": "hidden-button-only",
            "action": "Call the delete operation directly as role=student with two stored quizzes",
            "expected": "Deletion is denied and both quizzes remain."
          },
          {
            "testId": "guest-denied",
            "issueId": "hidden-button-only",
            "action": "Call the delete operation directly with session=null and two stored quizzes",
            "expected": "Deletion is denied and both quizzes remain."
          }
        ]
      },
      "notes-save": {
        "caseId": "notes-save",
        "title": "Study notes: did it really save?",
        "scenario": "You review a notes app that displays Saved immediately, but loses a draft when the request fails.",
        "aiClaim": "The Save button shows a success message. Saving is complete.",
        "requirements": [
          "Set status=saving while the save request is pending. Show saved only after the request confirms success.",
          "If saving fails, set status=error, preserve the exact draft and allow a retry.",
          "A successful retry must store the original draft and set status=saved.",
          "For this exercise, allow one save request at a time and freeze editing while it is pending. Use a controlled fake service for success, failure and delay."
        ],
        "topicIds": [
          "requirements",
          "code-reading",
          "software-testing"
        ],
        "starterCode": "async function saveNote(state, api) {\n  const text = state.draft;\n  state.status = 'saved';\n  state.draft = '';\n  try { await api.save(text); } catch (_) { /* Failure is silently ignored. */ }\n}",
        "issues": [
          {
            "issueId": "false-success",
            "title": "Success is shown before confirmation",
            "topicIds": [
              "code-reading",
              "requirements"
            ],
            "observed": "The page shows Saved while the request is still pending.",
            "suggestedChange": "Wait for confirmed success; show a pending state before completion and an error state on failure.",
            "suggestedChecks": [
              "pending-state",
              "successful-save",
              "failure-preserves-draft"
            ]
          },
          {
            "issueId": "lost-draft",
            "title": "A failed save loses the draft",
            "topicIds": [
              "requirements",
              "software-testing"
            ],
            "observed": "The input is cleared before storage succeeds, so a failed save loses the note.",
            "suggestedChange": "Keep the draft through failures and let a later successful retry store the same content.",
            "suggestedChecks": [
              "failure-preserves-draft",
              "retry-save"
            ]
          }
        ],
        "tests": [
          {
            "testId": "pending-state",
            "issueId": "false-success",
            "action": "Start saving draft=Test note while the fake service remains pending",
            "expected": "Status is saving; draft remains Test note; saved is not displayed."
          },
          {
            "testId": "successful-save",
            "issueId": null,
            "action": "Save Test note and resolve the fake service successfully",
            "expected": "Status is saved and the service stored Test note."
          },
          {
            "testId": "failure-preserves-draft",
            "issueId": "lost-draft",
            "action": "Save Test note and reject the fake service request",
            "expected": "Status is error; draft remains Test note; retry is available."
          },
          {
            "testId": "retry-save",
            "issueId": "lost-draft",
            "action": "After a failed save, retry without retyping and resolve successfully",
            "expected": "The service stores Test note and status becomes saved."
          }
        ]
      }
    },
    "sampleDialogues": {
      "cart-checkout": {
        "plan": [
          {
            "issueId": "negative-quantity",
            "problem": "A quantity of -3 notebooks produces a negative total.",
            "changeRequest": "Reject negative and fractional quantities before calculation. Do not convert them to positive integers.",
            "checks": [
              {
                "testId": "reject-negative",
                "input": "1 notebook entry with qty -3; discount 0",
                "expected": "Reject with a clear message; no order is silently changed."
              },
              {
                "testId": "reject-fraction",
                "input": "1 notebook entry with qty 1.5; discount 0",
                "expected": "Reject with a clear message."
              },
              {
                "testId": "normal-total",
                "input": "2 notebooks at 19.99 and 1 pen at 9.99; discount 0",
                "expected": "Total is 49.97."
              }
            ]
          },
          {
            "issueId": "discount-range",
            "problem": "A discount of 150 percent produces a negative total.",
            "changeRequest": "Reject discounts outside 0–100 and preserve the valid endpoints.",
            "checks": [
              {
                "testId": "discount-range",
                "input": "1 pen at 9.99; separately try discounts -5 and 150",
                "expected": "Reject both values with a clear message."
              },
              {
                "testId": "full-discount",
                "input": "1 pen at 9.99; discount 100",
                "expected": "Total is 0."
              },
              {
                "testId": "normal-discount",
                "input": "The same cart; discount 10",
                "expected": "Raw total is approximately 44.973; displayed total is 44.97."
              }
            ]
          },
          {
            "issueId": "empty-cart",
            "problem": "The average of an empty cart is NaN.",
            "changeRequest": "Return numeric 0 for an empty cart and preserve the weighted average for nonempty carts.",
            "checks": [
              {
                "testId": "empty-average",
                "input": "No items; calculate total at discount 0 and average",
                "expected": "Total and average are both numeric 0."
              },
              {
                "testId": "normal-average",
                "input": "2 notebooks at 19.99 and 1 pen at 9.99",
                "expected": "Average is approximately 16.6567; displayed average is 16.66."
              }
            ]
          }
        ],
        "feedback": "Your final request defines invalid-input handling and preserves normal orders. You needed a prompt to include regression checks.",
        "confirmed": true
      },
      "quiz-permissions": {
        "plan": [
          {
            "issueId": "hidden-button-only",
            "problem": "A student can call the delete operation even though the button is hidden.",
            "changeRequest": "Check the authenticated role at the action boundary, deny non-admins without changing data, and preserve admin access.",
            "checks": [
              {
                "testId": "admin-delete",
                "input": "Call the delete operation as role=admin with two stored quizzes",
                "expected": "Deletion succeeds and the quiz list becomes empty."
              },
              {
                "testId": "student-denied",
                "input": "Call the delete operation directly as role=student with two stored quizzes",
                "expected": "Deletion is denied and both quizzes remain."
              },
              {
                "testId": "guest-denied",
                "input": "Call the delete operation directly with session=null and two stored quizzes",
                "expected": "Deletion is denied and both quizzes remain."
              }
            ]
          }
        ],
        "feedback": "You moved the requirement from hiding an entry point to enforcing permission and checked all three roles.",
        "confirmed": true
      },
      "notes-save": {
        "plan": [
          {
            "issueId": "false-success",
            "problem": "The page shows Saved while the request is still pending.",
            "changeRequest": "Wait for confirmed success; show a pending state before completion and an error state on failure.",
            "checks": [
              {
                "testId": "pending-state",
                "input": "Start saving draft=Test note while the fake service remains pending",
                "expected": "Status is saving; draft remains Test note; saved is not displayed."
              },
              {
                "testId": "successful-save",
                "input": "Save Test note and resolve the fake service successfully",
                "expected": "Status is saved and the service stored Test note."
              },
              {
                "testId": "failure-preserves-draft",
                "input": "Save Test note and reject the fake service request",
                "expected": "Status is error; draft remains Test note; retry is available."
              }
            ]
          },
          {
            "issueId": "lost-draft",
            "problem": "The input is cleared before storage succeeds, so a failed save loses the note.",
            "changeRequest": "Keep the draft through failures and let a later successful retry store the same content.",
            "checks": [
              {
                "testId": "failure-preserves-draft",
                "input": "Save Test note and reject the fake service request",
                "expected": "Status is error; draft remains Test note; retry is available."
              },
              {
                "testId": "retry-save",
                "input": "After a failed save, retry without retyping and resolve successfully",
                "expected": "The service stores Test note and status becomes saved."
              }
            ]
          }
        ],
        "feedback": "You correctly tied feedback to request outcomes. Your checklist includes retaining the draft and retrying without retyping.",
        "confirmed": true
      }
    }
  };
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.SkillLoopShared = data;
})(typeof self === 'object' ? self : globalThis);
