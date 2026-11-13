# Shared AI access

All four parts of the new workflow use one provider account, base URL and model. Each part keeps its own server-owned prompts and output validation. Sharing credentials does not share conversations.

The working helper is [server/ai.mjs](../../server/ai.mjs). It uses Node.js `fetch` with the OpenAI-compatible Chat Completions HTTP interface; no extra package or Vercel AI Gateway subscription is required. It supports text and validated JSON, a 45-second request timeout and safe errors. It does not stream, run tools or automatically retry paid calls.

**Integration status:** all four student modules use the shared helper. Local end-to-end testing has verified live Bailian calls for diagnosis, learning feedback, dialogue and verification review. Production still needs the three shared environment variables configured in its Vercel project.

## Where things go

| Content | Location | Owner |
| --- | --- | --- |
| Provider request code | `server/ai.mjs` | Shared integration owner; do not make four copies |
| API key, base URL and model | Vercel project environment variables; ignored `.env.local` for local development | Project owner |
| Empty configuration template | `.env.example` | Shared integration owner |
| Prompts, conversation logic and output validators | Each module's server file, such as `interview/dialogue-server.cjs` | Module owner |
| HTTP endpoint | A thin file under `api/` | Module owner, coordinated with integration owner |
| Page code | Existing module folder | Module owner |

Browser pages call their module endpoint. That endpoint validates input, builds the system prompt, imports this helper and checks the result against the team samples. The browser never imports the helper or receives credentials. Prompts in browser requests are learner data, not system instructions.

The student routes are `/api/learning-path`, `/api/knowledge-learning`, `/api/dialogue`, and `/api/correction` (action `review`). All are registered in `scripts/dev.mjs`. `/api/knowledge` and correction teacher drafting retain their separate legacy settings. There is no public generic AI proxy.

## One configuration for everyone

Set these in the same Vercel project for **Production** and **Preview**, then deploy again:

```dotenv
AI_BASE_URL=<the provider's OpenAI-compatible base URL ending in /v1>
AI_API_KEY=<the matching API key>
AI_MODEL=<an enabled text model ID from the provider console>
```

Use the same names in an ignored root `.env.local` for local development. `npm run dev` already reads that file. Never commit real values. The helper does not fall back to `OPENAI_API_KEY`, `OPENROUTER_API_KEY` or `AI_GATEWAY_API_KEY`; those are legacy module settings, not aliases for the new configuration. Keep them until their existing callers have migrated.

All module owners use the same model from `AI_MODEL`; no module-specific model override is supported here. A shared account also shares billing and provider rate limits. Project members need appropriate Vercel access to manage deployments, but website visitors do not need a Vercel account to use an unprotected app.

## Alibaba Cloud Bailian / Model Studio

Bailian supports OpenAI-compatible Chat Completions, so a Vercel Node.js Function can call it using this helper. The API service does not have to be hosted on the same cloud as the website. Actual connectivity, account permissions, model availability and quota still require a real deployment test.

Copy the **pay-as-you-go model API** configuration from your console. The key, base URL, region and billing product must match; a coding-assistant subscription key is not interchangeable with the model API key.

The official documentation currently recommends workspace-specific base URLs:

```text
Beijing:   https://<WorkspaceId>.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
Singapore: https://<WorkspaceId>.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
```

Replace the workspace placeholder with the real ID. The documentation also lists the still-supported shared URLs `https://dashscope.aliyuncs.com/compatible-mode/v1` (Beijing) and `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (Singapore). Prefer the URL shown for your own account/workspace. Do not append `/chat/completions`; the helper adds it.

For a Bailian model supporting the thinking switch, set `AI_ENABLE_THINKING=false` for this non-streaming workflow. Leave it unset for providers/models that do not support this parameter. Choose a model that supports non-streaming text generation. This helper requests JSON in the prompt and validates it locally; it does not assume every model supports a JSON-schema or JSON-mode API parameter.

## Calling the helper

From a module's `.mjs` server file:

```js
import { callAI, callAIJson } from '../server/ai.mjs';

const answer = await callAI({
  system: 'You are a code-review coach. Ask one question about the learner response.',
  messages: [{ role: 'user', content: learnerAnswer }],
});
// answer = { text, model, aiSource: 'api' }
```

An existing `.cjs` server file can use `const { callAIJson } = await import('../server/ai.mjs')` inside its async handler.

For structured handoff data:

```js
const result = await callAIJson({
  system: buildModulePrompt(selectedCase),
  messages: [{ role: 'user', content: JSON.stringify(moduleInput) }],
  validate: (data) => validateModuleResult(data, selectedCase) === true,
});
// result = { data, model, aiSource: 'api' }
```

`buildModulePrompt` and `validateModuleResult` are functions each module owner must implement; the example is not a ready-made endpoint. Validators must be synchronous and check required fields, case/topic/issue IDs and the shape of the module output in `samples.json`. Do not use a validator that always returns true.

Keep the learner's confirmation under UI control and verification test results under the test runner's control. The model may propose a repair plan or review test results; it must not set `confirmed=true` for the learner or manufacture passing tests. Set the final output's `aiSource` from the helper's successful return, not from model-generated JSON.

Inputs allow a nonempty system string and 1–40 user/assistant messages with at most 50,000 total characters. `maxTokens` defaults to 1,500 and accepts 1–4,096. Keep the containing Vercel Function's duration longer than the helper timeout (45 seconds by default, maximum 55 seconds), within the project's available limits. Timeouts or truncated responses are errors, not usable completed handoffs.

## Error handling and verification

Catch `AIError` at the endpoint and return its safe `code` and message. Codes include `NOT_CONFIGURED`, `AUTH_FAILED`, `RATE_LIMITED`, `TIMEOUT`, `NETWORK_ERROR`, `PROVIDER_ERROR`, `INVALID_RESPONSE`, `INVALID_OUTPUT` and `INVALID_INPUT`. Do not log or return raw provider diagnostics or credentials. Preserve the learner's draft and offer a retry; never silently replace an error with sample success. Each endpoint remains responsible for its own session/access checks and request limits before calling the helper.

`npm test` includes the shared helper tests with a mock provider. Those tests exercise request construction, four independent callers, JSON validation, timeout and safe failures. They do not prove live access or billing availability.

After credentials are configured and modules are connected, verify a small real call from each module in Preview, check the agreed output fields, then deploy the same configuration to Production. In part 4, test results must still come from the actual runner, with AI reviewing the evidence.

## Official references

- [Bailian OpenAI-compatible Chat API](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)
- [Bailian base URLs by region and billing plan](https://help.aliyun.com/en/model-studio/base-url)
- [Bailian API keys](https://help.aliyun.com/zh/model-studio/get-api-key/)
- [Vercel Functions](https://vercel.com/docs/functions)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
