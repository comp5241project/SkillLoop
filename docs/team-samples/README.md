# Team development samples

Shared content and input/output examples for the next SkillLoop iteration: learners review AI-built software, learn how to identify problems, discuss repairs, and verify the results. The four-part flow is connected through shared browser storage; the sample records remain development examples.

Start with the [team guide in Chinese](guide.zh-CN.txt). It replaces the earlier draft handoff proposals for this iteration; the existing [data contracts](../DATA-CONTRACTS.md) still document the current implementation.

## Files

- [Shared AI setup](AI-SETUP.md): common calling code, file locations, Vercel configuration and Alibaba Cloud Bailian compatibility. All four module APIs use this helper.
- [samples.json](samples.json): three cases and twelve complete module input/output examples, including starter code, reference repairs and test specifications.
- [samples.js](samples.js): the same data, ready to load in a browser or Node.js. Use either format; keep them identical when updating the materials.
- [guide.zh-CN.txt](guide.zh-CN.txt): module responsibilities, field meanings and integration rules. This is the document called `先读这个.txt` in the shared download.

## Cases

| Case ID | Focus |
| --- | --- |
| `cart-checkout` | Invalid quantities, discount boundaries and an empty cart |
| `quiz-permissions` | Permission checks at the operation, beyond hiding a button |
| `notes-save` | Confirmed saving, draft preservation and retry after failure |

The first two reuse existing correction exercises. The notes exercise is new. Each case supplies authored requirements and verification criteria; model responses must not redefine them.

## Module handoffs

The new learning order does not rename the existing folders.

| Part | Folder | Input | Output |
| --- | --- | --- | --- |
| 1. AI assessment | `learning-path/` | Available cases and learner background | Selected case, assessment and weak topics |
| 2. AI-assisted learning | `knowledge-map/` | Case and assessment | Studied topics, remaining needs and practice focus |
| 3. AI repair dialogue | `interview/` | Case, assessment and learning result | Learner-confirmed repair plan and dialogue feedback |
| 4. AI-assisted verification | `correction-lab/` | Case, repair plan and fixed test specifications | Test outcomes, AI review and suggested revision topics |

Each owner can design their own UI and AI interaction. Keep the output fields and case, topic, issue and test IDs as supplied. `shared/flow.js` connects saving, loading and navigation. A confirmed part 3 plan appears in part 4 for the same case. Repeating an upstream step invalidates older downstream handoffs.

After editing `samples.json`, run `node scripts/sync-cases.cjs` to update the deployed `shared/cases.json` copy. Keep `samples.js` consistent too. Runtime APIs load the deployed copy because Vercel excludes `docs/`.

## Start independently

Load `samples.js` from this directory in your development page, then select your part:

```js
const demo = SkillLoopSamples.samples['cart-checkout'];
const input = demo.part3.input;
const outputExample = demo.part3.output;
```

Use `part1`, `part2`, `part3` or `part4`, and switch the case ID to try another scenario. Node.js can load the same file with `require('./samples.js')`.

All example AI responses and learner results are fictional and labelled `sample`. Label them in development UIs. Live verification must use actual runner results; AI explains those results rather than deciding whether tests passed. Starter and reference snippets support teaching and are not production-ready apps.

Teacher-uploaded cases remain a planned extension, requiring reviewed materials and compatible verification exercises.
