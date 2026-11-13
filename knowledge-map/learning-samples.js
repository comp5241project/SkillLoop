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
    "shopping-cart": {
      "caseId": "shopping-cart",
      "title": "Shopping cart total",
      "summary": "A cart total applies a coupon and tax. The learner reports a one-cent difference and an expired coupon that still works.",
      "starterCode": "function cartTotal(items, coupon, taxRate) {\n  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);\n  const discount = coupon === 'SAVE10' ? subtotal * 0.1 : 0;\n  return (subtotal - discount) * (1 + taxRate);\n}",
      "topicIds": [
        "requirements",
        "code-reading",
        "software-testing",
        "edge-cases"
      ]
    },
    "quiz-platform-permissions": {
      "caseId": "quiz-platform-permissions",
      "title": "Quiz platform permissions",
      "summary": "Teachers create quizzes, students take assigned quizzes and admins manage roles. A published quiz is visible to every signed-in account.",
      "starterCode": "function canOpenQuiz(user, quiz) {\n  if (user.role === 'teacher') return true;\n  if (quiz.published) return true;\n  return user.id === quiz.ownerId;\n}",
      "topicIds": [
        "requirements",
        "code-reading",
        "software-testing",
        "communication"
      ]
    },
    "note-saving": {
      "caseId": "note-saving",
      "title": "Note saving",
      "summary": "A note editor autosaves shortly after typing and syncs when the connection returns. A refresh can lose the last edit, and two tabs can overwrite each other.",
      "starterCode": "let note = '';\nlet timer;\nfunction onInput(text) {\n  note = text;\n  clearTimeout(timer);\n  timer = setTimeout(() => save(note), 400);\n}\nwindow.addEventListener('beforeunload', () => save(note));",
      "topicIds": [
        "code-reading",
        "edge-cases",
        "software-testing",
        "ai-code-review"
      ]
    }
  },
  "samples": {
    "shopping-cart": {
      "part2": {
        "input": {
          "case": {
            "caseId": "shopping-cart",
            "title": "Shopping cart total",
            "summary": "A cart total applies a coupon and tax. The learner reports a one-cent difference and an expired coupon that still works.",
            "starterCode": "function cartTotal(items, coupon, taxRate) {\n  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);\n  const discount = coupon === 'SAVE10' ? subtotal * 0.1 : 0;\n  return (subtotal - discount) * (1 + taxRate);\n}",
            "topicIds": [
              "requirements",
              "code-reading",
              "software-testing",
              "edge-cases"
            ]
          },
          "result": {
            "caseId": "shopping-cart",
            "overall": {
              "level": "developing",
              "summary": "Sample diagnosis for Shopping cart total."
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
    "quiz-platform-permissions": {
      "part2": {
        "input": {
          "case": {
            "caseId": "quiz-platform-permissions",
            "title": "Quiz platform permissions",
            "summary": "Teachers create quizzes, students take assigned quizzes and admins manage roles. A published quiz is visible to every signed-in account.",
            "starterCode": "function canOpenQuiz(user, quiz) {\n  if (user.role === 'teacher') return true;\n  if (quiz.published) return true;\n  return user.id === quiz.ownerId;\n}",
            "topicIds": [
              "requirements",
              "code-reading",
              "software-testing",
              "communication"
            ]
          },
          "result": {
            "caseId": "quiz-platform-permissions",
            "overall": {
              "level": "developing",
              "summary": "Sample diagnosis for Quiz platform permissions."
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
                "conceptId": "communication",
                "level": "developing",
                "evidence": "Sample learner response",
                "strength": "A relevant idea was observed.",
                "gap": "Apply communication to this case."
              }
            ],
            "priorities": [
              "code-reading",
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
    "note-saving": {
      "part2": {
        "input": {
          "case": {
            "caseId": "note-saving",
            "title": "Note saving",
            "summary": "A note editor autosaves shortly after typing and syncs when the connection returns. A refresh can lose the last edit, and two tabs can overwrite each other.",
            "starterCode": "let note = '';\nlet timer;\nfunction onInput(text) {\n  note = text;\n  clearTimeout(timer);\n  timer = setTimeout(() => save(note), 400);\n}\nwindow.addEventListener('beforeunload', () => save(note));",
            "topicIds": [
              "code-reading",
              "edge-cases",
              "software-testing",
              "ai-code-review"
            ]
          },
          "result": {
            "caseId": "note-saving",
            "overall": {
              "level": "developing",
              "summary": "Sample diagnosis for Note saving."
            },
            "dimensions": [
              {
                "conceptId": "code-reading",
                "level": "developing",
                "evidence": "Sample learner response",
                "strength": "A relevant idea was observed.",
                "gap": "Apply code-reading to this case."
              },
              {
                "conceptId": "edge-cases",
                "level": "developing",
                "evidence": "Sample learner response",
                "strength": "A relevant idea was observed.",
                "gap": "Apply edge-cases to this case."
              },
              {
                "conceptId": "software-testing",
                "level": "developing",
                "evidence": "Sample learner response",
                "strength": "A relevant idea was observed.",
                "gap": "Apply software-testing to this case."
              },
              {
                "conceptId": "ai-code-review",
                "level": "developing",
                "evidence": "Sample learner response",
                "strength": "A relevant idea was observed.",
                "gap": "Apply ai-code-review to this case."
              }
            ],
            "priorities": [
              "edge-cases",
              "ai-code-review"
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
