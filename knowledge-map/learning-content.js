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
function authoredChoice(explanation, example, prompt, options, correct, focus) {
  return { explanation, example, exercise: { kind: 'choice', prompt, options, correct }, focus };
}

Object.assign(SkillLoopLearningContent, {
  'shopping-cart': {
    requirements: authoredChoice(
      'Turn a reported pricing problem into a rule with a clear expected result. Ask for missing policy details before choosing a rounding rule.',
      'The case reports an expired coupon and a one-cent difference. The brief does not say which amount to round or when.',
      'What should you clarify before changing the calculation?',
      ['Whether the cart should have an animation.', 'When a coupon expires and at which point the price must be rounded.', 'Whether to ignore all one-cent differences.'], 1,
      'Clarify coupon validity and the point at which the total should be rounded.'),
    'code-reading': authoredChoice(
      'Trace the current conditions and the order of arithmetic before proposing a fix.',
      'The code checks only the coupon string. It subtracts its discount before multiplying by the tax factor.',
      'What happens when an expired coupon still has the value SAVE10?',
      ['The code still applies the discount before tax.', 'The tax check rejects the coupon.', 'The function checks the coupon expiry date.'], 0,
      'Trace an expired SAVE10 coupon through the discount and tax calculation.'),
    'software-testing': authoredChoice(
      'Choose checks that distinguish the reported defect from expected behavior and preserve working behavior.',
      'Run the same cart with a valid and expired coupon and record the expected total using the agreed pricing policy.',
      'Which test pair gives the clearest evidence about coupon expiry?',
      ['Two empty carts.', 'Two valid coupons of the same type.', 'The same cart with valid and expired coupons, asserting both expected totals.'], 2,
      'Ask for a regression test that contrasts a valid coupon with an expired one.'),
    'edge-cases': authoredChoice(
      'Boundary cases expose decisions about time and decimal precision that ordinary inputs can miss.',
      'A coupon one instant before its expiry and one at expiry exercise the cutoff. A fractional-cent total exercises rounding.',
      'Which inputs target both reported problems?',
      ['A large round-price order with no coupon.', 'A coupon at the expiry cutoff and a cart that produces a fractional cent.', 'A coupon that is far from expiring and an exact-cent total.'], 1,
      'Describe the expiry boundary and a fractional-cent case with explicit expected results.'),
  },
  'quiz-platform-permissions': {
    requirements: authoredChoice(
      'Separate the visibility requirement from assumptions about assignments, roles, and ownership.',
      'The brief says published quizzes are visible to every signed-in account. Assignment and draft-access rules require separate analysis.',
      'Who must be able to see a published quiz under the stated requirement?',
      ['Only the quiz owner.', 'Only users assigned the quiz.', 'Every signed-in account.'], 2,
      'State the published-quiz visibility requirement and ask which draft rules apply.'),
    'code-reading': authoredChoice(
      'A return statement ends the function. Follow the checks in order for a concrete user and quiz.',
      'A signed-in student with a published quiz passes the published check before the owner comparison.',
      'Can a signed-in student open a published quiz they do not own under the current code?',
      ['Yes, the published branch returns true first.', 'No, ownership is checked first.', 'Only if the student is a teacher.'], 0,
      'Explain which condition determines the result for a student opening a published quiz.'),
    'software-testing': authoredChoice(
      'Write a test whose expected result follows directly from the brief, even if the current code already passes it.',
      'A signed-in student who is neither the owner nor assigned the quiz still needs access when it is published.',
      'Which regression test directly checks the published-quiz requirement?',
      ['A teacher opens their own draft.', 'A signed-in student opens a published quiz they do not own or have assigned.', 'The quiz title matches the page header.'], 1,
      'Request a published-quiz visibility test using a signed-in user without ownership or assignment.'),
    communication: authoredChoice(
      'Explain a code review finding by connecting a concrete example to the wording of the brief.',
      'State what the code does for a signed-in student who is not the owner, then quote the published visibility rule.',
      'Which comment would help the team agree on the expected behavior?',
      ['Rename published to isPublic.', 'All permission logic is broken.', 'The brief says every signed-in account can see published quizzes. Let’s verify that with a non-owner student and clarify the draft rule separately.'], 2,
      'Frame a review question using the exact visibility rule and a non-owner example.'),
  },
  'note-saving': {
    'code-reading': authoredChoice(
      'Trace what happens when timers are reset and when the page is about to unload.',
      'Each input cancels the old timer and schedules a save in 400 ms. The unload handler invokes save without waiting for confirmation.',
      'What does the unload handler prove about persistence?',
      ['It proves the server received the note.', 'It invokes save but does not confirm that the latest edit was stored.', 'It guarantees the timer already ran.'], 1,
      'Trace the last edit through the timer and unload handler and identify what is unconfirmed.'),
    'edge-cases': authoredChoice(
      'Think through interruptions between an edit and confirmed storage, including overlapping edits.',
      'A refresh before the timer fires and two tabs editing from the same earlier version exercise different risks.',
      'Which scenario targets the reported overwrite risk?',
      ['Two tabs edit the same note before either sees the other edit.', 'One tab reads an unchanged note.', 'One tab edits two unrelated notes.'], 0,
      'Describe a two-tab conflict and ask how the product should resolve it.'),
    'software-testing': authoredChoice(
      'Make time, network failure, and recovery controllable so each behavior can be asserted.',
      'Use a fake timer and a controllable save service to compare the stored text before refresh and after reconnecting.',
      'Which test is most likely to reveal a lost edit?',
      ['Check that the editor opens.', 'Verify the timer duration in isolation.', 'Type a unique marker, refresh before the debounce expires, and check the recovered and stored text.'], 2,
      'Propose reproducible refresh and reconnect checks that assert the last edit is retained.'),
    'ai-code-review': authoredChoice(
      'Review AI-generated code against the brief and separate visible code from behavior it does not demonstrate.',
      'The snippet schedules saves, but it does not show offline recovery or a strategy for concurrent edits.',
      'Which review response is best supported by this snippet?',
      ['The timer guarantees offline sync.', 'Ask how failed saves are retried and how an older tab is prevented from overwriting a newer edit.', 'Approve because the unload callback calls save.'], 1,
      'Request evidence for offline recovery and conflict handling before approving the code.'),
  },
});

if (typeof module === "object" && module.exports) module.exports = SkillLoopLearningContent;
if (typeof window !== "undefined") window.SkillLoopLearningContent = SkillLoopLearningContent;
