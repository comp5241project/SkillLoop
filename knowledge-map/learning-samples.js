/* Generated Module 2 standalone Sample data. Not a Part 1 diagnosis record. */
window.SkillLoopSamples = {
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
      "summary": "You are the engineer reviewing an AI-built checkout before release. Each included item must have an integer quantity of at least 1. Reject invalid quantities with a clear message; do not silently change them. The UI omits an item whose quantity is 0. It must not omit negative or fractional quantities before the learner can observe the initial defect. Accept discount percentages from 0 through 100 inclusive. Reject values outside that range. An empty cart is allowed. Its total and average price per item are both numeric 0. Preserve correct totals and quantity-weighted averages for valid orders. Display money to two decimal places.",
      "starterCode": "function cartTotal(items, discountPercent) {\n  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);\n  return total * (1 - discountPercent / 100);\n}\nfunction averagePrice(items) {\n  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);\n  const count = items.reduce((sum, item) => sum + item.qty, 0);\n  return total / count;\n}",
      "topicIds": [
        "requirements",
        "code-reading",
        "software-testing",
        "edge-cases"
      ]
    },
    "quiz-permissions": {
      "caseId": "quiz-permissions",
      "title": "QuizHub permissions",
      "summary": "You review a quiz app where only the teacher administrator may delete quizzes. The teacher administrator is represented by role=admin in this exercise. A student has role=student; a signed-out visitor has a null session. Check permission when the delete operation is performed, even if its entry point is reached directly. An admin may delete quizzes. Students and signed-out visitors must be denied, and denied requests must not change quiz data. In a real application, enforce this check on the server using its authenticated session. The exercise uses a local simulated action boundary.",
      "starterCode": "function canDeleteQuizzes(session) { return true; }\nfunction deleteQuizzes(session, quizzes) {\n  if (!canDeleteQuizzes(session)) return { allowed: false, quizzes };\n  return { allowed: true, quizzes: [] };\n}",
      "topicIds": [
        "requirements",
        "ai-code-review",
        "software-testing",
        "communication"
      ]
    },
    "notes-save": {
      "caseId": "notes-save",
      "title": "Study notes: did it really save?",
      "summary": "You review a notes app that displays Saved immediately, but loses a draft when the request fails. Set status=saving while the save request is pending. Show saved only after the request confirms success. If saving fails, set status=error, preserve the exact draft and allow a retry. A successful retry must store the original draft and set status=saved. For this exercise, allow one save request at a time and freeze editing while it is pending. Use a controlled fake service for success, failure and delay.",
      "starterCode": "async function saveNote(state, api) {\n  const text = state.draft;\n  state.status = 'saved';\n  state.draft = '';\n  try { await api.save(text); } catch (_) { /* Failure is silently ignored. */ }\n}",
      "topicIds": [
        "requirements",
        "code-reading",
        "software-testing",
        "edge-cases"
      ]
    }
  },
  "samples": {
    "cart-checkout": {
      "part2": {
        "input": {
          "case": {
            "caseId": "cart-checkout",
            "title": "QuizShop checkout",
            "summary": "You are the engineer reviewing an AI-built checkout before release. Each included item must have an integer quantity of at least 1. Reject invalid quantities with a clear message; do not silently change them. The UI omits an item whose quantity is 0. It must not omit negative or fractional quantities before the learner can observe the initial defect. Accept discount percentages from 0 through 100 inclusive. Reject values outside that range. An empty cart is allowed. Its total and average price per item are both numeric 0. Preserve correct totals and quantity-weighted averages for valid orders. Display money to two decimal places.",
            "starterCode": "function cartTotal(items, discountPercent) {\n  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);\n  return total * (1 - discountPercent / 100);\n}\nfunction averagePrice(items) {\n  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);\n  const count = items.reduce((sum, item) => sum + item.qty, 0);\n  return total / count;\n}",
            "topicIds": [
              "requirements",
              "code-reading",
              "software-testing",
              "edge-cases"
            ]
          },
          "result": {
            "caseId": "cart-checkout",
            "overall": {
              "level": "developing",
              "summary": "Sample diagnosis for QuizShop checkout."
            },
            "dimensions": [
              {
                "conceptId": "requirements",
                "level": "developing",
                "evidence": "Sample learner response",
                "strength": "A relevant idea was observed.",
                "gap": "Apply requirements to this case."
              },
              {
                "conceptId": "code-reading",
                "level": "developing",
                "evidence": "Sample learner response",
                "strength": "A relevant idea was observed.",
                "gap": "Apply code-reading to this case."
              },
              {
                "conceptId": "software-testing",
                "level": "developing",
                "evidence": "Sample learner response",
                "strength": "A relevant idea was observed.",
                "gap": "Apply software-testing to this case."
              },
              {
                "conceptId": "edge-cases",
                "level": "developing",
                "evidence": "Sample learner response",
                "strength": "A relevant idea was observed.",
                "gap": "Apply edge-cases to this case."
              }
            ],
            "priorities": [
              "requirements",
              "software-testing"
            ],
            "nextSteps": [
              "Explain the expected behavior.",
              "Ask for a check that could reveal a remaining defect."
            ]
          }
        }
      }
    },
    "quiz-permissions": {
      "part2": {
        "input": {
          "case": {
            "caseId": "quiz-permissions",
            "title": "QuizHub permissions",
            "summary": "You review a quiz app where only the teacher administrator may delete quizzes. The teacher administrator is represented by role=admin in this exercise. A student has role=student; a signed-out visitor has a null session. Check permission when the delete operation is performed, even if its entry point is reached directly. An admin may delete quizzes. Students and signed-out visitors must be denied, and denied requests must not change quiz data. In a real application, enforce this check on the server using its authenticated session. The exercise uses a local simulated action boundary.",
            "starterCode": "function canDeleteQuizzes(session) { return true; }\nfunction deleteQuizzes(session, quizzes) {\n  if (!canDeleteQuizzes(session)) return { allowed: false, quizzes };\n  return { allowed: true, quizzes: [] };\n}",
            "topicIds": [
              "requirements",
              "ai-code-review",
              "software-testing",
              "communication"
            ]
          },
          "result": {
            "caseId": "quiz-permissions",
            "overall": {
              "level": "developing",
              "summary": "Sample diagnosis for QuizHub permissions."
            },
            "dimensions": [
              {
                "conceptId": "requirements",
                "level": "developing",
                "evidence": "Sample learner response",
                "strength": "A relevant idea was observed.",
                "gap": "Apply requirements to this case."
              },
              {
                "conceptId": "ai-code-review",
                "level": "developing",
                "evidence": "Sample learner response",
                "strength": "A relevant idea was observed.",
                "gap": "Apply ai-code-review to this case."
              },
              {
                "conceptId": "software-testing",
                "level": "developing",
                "evidence": "Sample learner response",
                "strength": "A relevant idea was observed.",
                "gap": "Apply software-testing to this case."
              },
              {
                "conceptId": "communication",
                "level": "developing",
                "evidence": "Sample learner response",
                "strength": "A relevant idea was observed.",
                "gap": "Apply communication to this case."
              }
            ],
            "priorities": [
              "ai-code-review",
              "communication"
            ],
            "nextSteps": [
              "Explain the expected behavior.",
              "Ask for a check that could reveal a remaining defect."
            ]
          }
        }
      }
    },
    "notes-save": {
      "part2": {
        "input": {
          "case": {
            "caseId": "notes-save",
            "title": "Study notes: did it really save?",
            "summary": "You review a notes app that displays Saved immediately, but loses a draft when the request fails. Set status=saving while the save request is pending. Show saved only after the request confirms success. If saving fails, set status=error, preserve the exact draft and allow a retry. A successful retry must store the original draft and set status=saved. For this exercise, allow one save request at a time and freeze editing while it is pending. Use a controlled fake service for success, failure and delay.",
            "starterCode": "async function saveNote(state, api) {\n  const text = state.draft;\n  state.status = 'saved';\n  state.draft = '';\n  try { await api.save(text); } catch (_) { /* Failure is silently ignored. */ }\n}",
            "topicIds": [
              "requirements",
              "code-reading",
              "software-testing",
              "edge-cases"
            ]
          },
          "result": {
            "caseId": "notes-save",
            "overall": {
              "level": "developing",
              "summary": "Sample diagnosis for Study notes: did it really save?."
            },
            "dimensions": [
              {
                "conceptId": "requirements",
                "level": "developing",
                "evidence": "Sample learner response",
                "strength": "A relevant idea was observed.",
                "gap": "Apply requirements to this case."
              },
              {
                "conceptId": "code-reading",
                "level": "developing",
                "evidence": "Sample learner response",
                "strength": "A relevant idea was observed.",
                "gap": "Apply code-reading to this case."
              },
              {
                "conceptId": "software-testing",
                "level": "developing",
                "evidence": "Sample learner response",
                "strength": "A relevant idea was observed.",
                "gap": "Apply software-testing to this case."
              },
              {
                "conceptId": "edge-cases",
                "level": "developing",
                "evidence": "Sample learner response",
                "strength": "A relevant idea was observed.",
                "gap": "Apply edge-cases to this case."
              }
            ],
            "priorities": [
              "edge-cases",
              "code-reading"
            ],
            "nextSteps": [
              "Explain the expected behavior.",
              "Ask for a check that could reveal a remaining defect."
            ]
          }
        }
      }
    }
  }
};
