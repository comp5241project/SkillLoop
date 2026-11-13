/* Authored learning activities for the common cases. AI provides live feedback. */
const SkillLoopLearningContent = {
  "cart-checkout": {
    "requirements": {
      "explanation": "Included quantities must be integers of at least one. Reject invalid values instead of changing the order.",
      "example": "You are the engineer reviewing an AI-built checkout before release.",
      "exercise": {
        "kind": "choice",
        "prompt": "Which behavior follows the quantity requirement?",
        "options": [
          "Reject -2 with a clear message",
          "Change -2 to 2",
          "Remove -2 silently"
        ],
        "correct": 0
      },
      "focus": "Reject invalid quantities with a clear message and preserve valid orders."
    },
    "code-reading": {
      "explanation": "An empty cart gives total=0 and count=0. Dividing them does not produce the required numeric zero.",
      "example": "You are the engineer reviewing an AI-built checkout before release.",
      "exercise": {
        "kind": "choice",
        "prompt": "What should averagePrice([]) return?",
        "options": [
          "Numeric 0",
          "NaN",
          "An empty string"
        ],
        "correct": 0
      },
      "focus": "It assumes the total quantity is nonzero; an empty cart needs an explicit zero result."
    },
    "software-testing": {
      "explanation": "A successful normal purchase is not enough. Check rejected inputs and preserve valid totals and weighted averages.",
      "example": "You are the engineer reviewing an AI-built checkout before release.",
      "exercise": {
        "kind": "choice",
        "prompt": "Which test detects an unhandled discount boundary?",
        "options": [
          "A discount of 101 must be rejected",
          "A discount of 10 on a normal order",
          "A different product label"
        ],
        "correct": 0
      },
      "focus": "Check valid orders, invalid quantities, discount boundaries and an empty cart."
    },
    "edge-cases": {
      "explanation": "The discount range includes both endpoints. Values outside it must be rejected, not clamped.",
      "example": "You are the engineer reviewing an AI-built checkout before release.",
      "exercise": {
        "kind": "choice",
        "prompt": "Which set covers the discount boundaries?",
        "options": [
          "-1, 0, 100 and 101",
          "10, 20 and 30",
          "Only 50"
        ],
        "correct": 0
      },
      "focus": "Accept 0 and 100, reject values below 0 or above 100."
    }
  },
  "quiz-permissions": {
    "requirements": {
      "explanation": "The action boundary must enforce role=admin. Hiding a control does not enforce permission.",
      "example": "You review a quiz app where only the teacher administrator may delete quizzes.",
      "exercise": {
        "kind": "choice",
        "prompt": "What must a denied operation preserve?",
        "options": [
          "The complete existing quiz list",
          "Only the visible button",
          "An empty quiz list"
        ],
        "correct": 0
      },
      "focus": "Deny deletion and leave all quizzes unchanged."
    },
    "ai-code-review": {
      "explanation": "canDeleteQuizzes currently always returns true. Check the behavior of the operation, not the confidence of the explanation.",
      "example": "You review a quiz app where only the teacher administrator may delete quizzes.",
      "exercise": {
        "kind": "choice",
        "prompt": "Where must the role check happen in this exercise?",
        "options": [
          "At the simulated delete action boundary",
          "Only when drawing the button",
          "Only after clearing the list"
        ],
        "correct": 0
      },
      "focus": "Call the delete operation directly as a student and inspect permission and data."
    },
    "software-testing": {
      "explanation": "A rejected result is insufficient if the function already deleted data. Check both authorization and the resulting list.",
      "example": "You review a quiz app where only the teacher administrator may delete quizzes.",
      "exercise": {
        "kind": "choice",
        "prompt": "Which result passes the signed-out test?",
        "options": [
          "Denied with both quizzes retained",
          "Denied with an empty list",
          "Allowed with an empty list"
        ],
        "correct": 0
      },
      "focus": "Admin succeeds; student and signed-out visitor are denied with data unchanged."
    },
    "communication": {
      "explanation": "State the actor, action, expected permission and data effect so the next implementation can be checked.",
      "example": "You review a quiz app where only the teacher administrator may delete quizzes.",
      "exercise": {
        "kind": "choice",
        "prompt": "Which instruction is most precise?",
        "options": [
          "Reject students and null sessions without clearing quizzes",
          "Make it safe",
          "Hide more controls"
        ],
        "correct": 0
      },
      "focus": "Check the session role during deletion, allow admins only, preserve data on denial and test all three roles."
    }
  },
  "notes-save": {
    "requirements": {
      "explanation": "A started request is not confirmed persistence. Show saving until success and keep the draft available on failure.",
      "example": "You review a notes app that displays Saved immediately, but loses a draft when the request fails.",
      "exercise": {
        "kind": "choice",
        "prompt": "When may the UI show saved?",
        "options": [
          "After the service confirms success",
          "As soon as the user clicks",
          "When the network request starts"
        ],
        "correct": 0
      },
      "focus": "Show saving, allow only one request and preserve the draft until the outcome is known."
    },
    "code-reading": {
      "explanation": "The current code clears the draft and announces success before the service replies. A swallowed error leaves misleading state.",
      "example": "You review a notes app that displays Saved immediately, but loses a draft when the request fails.",
      "exercise": {
        "kind": "choice",
        "prompt": "What must the failure handler retain?",
        "options": [
          "The exact original draft",
          "Only the first character",
          "An empty draft"
        ],
        "correct": 0
      },
      "focus": "If the request fails, the editor loses the draft needed for retry."
    },
    "software-testing": {
      "explanation": "A controlled fake service lets you observe the pending state, force failure and verify that retry stores the same text.",
      "example": "You review a notes app that displays Saved immediately, but loses a draft when the request fails.",
      "exercise": {
        "kind": "choice",
        "prompt": "Which observation proves the retry met the requirement?",
        "options": [
          "The service stored the original draft and status is saved",
          "The Save button changed color",
          "The error message disappeared"
        ],
        "correct": 0
      },
      "focus": "Use a controlled service for delay, rejection and successful retry; inspect status and draft."
    },
    "edge-cases": {
      "explanation": "Keep the failed draft and permit retry. This exercise allows one request at a time and freezes editing while pending.",
      "example": "You review a notes app that displays Saved immediately, but loses a draft when the request fails.",
      "exercise": {
        "kind": "choice",
        "prompt": "Which state is expected after rejection?",
        "options": [
          "status=error with draft unchanged",
          "status=saved with draft cleared",
          "status=saving forever"
        ],
        "correct": 0
      },
      "focus": "The original draft, retained unchanged after failure."
    }
  }
};
if (typeof module === "object" && module.exports) module.exports = SkillLoopLearningContent;
if (typeof window !== "undefined") window.SkillLoopLearningContent = SkillLoopLearningContent;
