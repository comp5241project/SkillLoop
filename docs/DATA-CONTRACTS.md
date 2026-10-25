# Module and data contracts

## Public page routes

| Route              | Owner       |
| ------------------ | ----------- |
| `/`                | Shared home |
| `/knowledge-map/`  | Module 1    |
| `/learning-path/`  | Module 2    |
| `/interview/`      | Module 3    |
| `/correction-lab/` | Module 4    |

To open a particular lesson, use `/knowledge-map/?topic=software-testing`. Unknown topic IDs fall back to the testing lesson. No SPA router or catch-all rewrite is needed.

## Concept IDs

`foundations`, `requirements`, `code-reading`, `software-testing`, `communication`, `ai-code-review`, `edge-cases`.

Titles may change without changing these IDs. Discuss ID changes with the learning-path owner. Map content is in `knowledge-map/data.js`; other modules link to concepts rather than importing that module's UI code.

## Browser-local storage

`shared/storage.js` exposes:

```js
const profile = SkillLoop.read('profile', {});
SkillLoop.write('profile', { background: 'beginner', goal: 'internship', diagnostic: 'no' });
SkillLoop.appendEvent({
  module: 'learning-path',
  type: 'path-created',
  conceptIds: ['foundations'],
});
SkillLoop.icons(); // after inserting a data-lucide placeholder
```

Storage keys are prefixed with `skillloop.v1.`. Use one key per module so pages do not overwrite each other's data.

| Key          | Shape                                                     | Writer                          |
| ------------ | --------------------------------------------------------- | ------------------------------- |
| `profile`    | `{background, goal, diagnostic}`                          | learning-path                   |
| `knowledge`  | `{selected, completed: conceptId[]}`                      | knowledge-map                   |
| `interview`  | `{draft, events: [{label, detail}], hintUsed, hasAnswer}` | interview                       |
| `correction` | `{draft, revealed, nextSeen, caseId}`                     | correction-lab                  |
| `activity`   | `[{module, type, at, conceptId?, conceptIds?, caseId?}]`  | all modules through appendEvent |

`background` is `beginner`, `student` or `graduate`. `goal` is `internship` or `build`. Diagnostic `no` correctly rejects the claim that error-free execution guarantees correctness; `yes` indicates a foundation check is useful.

Study completion is self-reported, not proof of mastery. Activity is capped at 100 entries and interview history at 40 entries. Draft inputs are capped at 5,000 characters. Stored content is shown using `textContent`, not injected HTML.

These contracts are for a prototype, not an account system or database schema. When adding a backend, agree authentication, server-side validation and endpoint contracts together. Keep API credentials on the server.
