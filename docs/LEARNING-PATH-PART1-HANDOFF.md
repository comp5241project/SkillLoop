# Learning Path Part 1 交接说明

> 状态：当前工作区实现，尚未提交。
>
> 模块：`/learning-path/`（Part 1: AI capability diagnosis）
>
> 用途：供 Part 2–4 成员对接输入、输出、浏览器存储和页面行为。

## 1. 总体流程

```text
/learning-path/
  → 选择固定 caseId
  → POST /api/learning-path { action: "questions" }
  → 得到 4 道 AI 新题
  → 学生每题选 1 个 optionId，可选填 explanation
  → POST /api/learning-path { action: "diagnose" }
  → 得到 4 维诊断 result
  → 保存到 localStorage + 写入 activity 事件
```

Part 1 不会直接跳转到 Part 2/3/4。结果页目前只展示“Part 2 is next”的锁定卡片，真实交接通过浏览器本地存储完成。

每个 case 固定 4 个知识点：

| caseId | 知识点 |
| --- | --- |
| `shopping-cart` | `requirements`、`code-reading`、`software-testing`、`edge-cases` |
| `quiz-platform-permissions` | `requirements`、`code-reading`、`software-testing`、`communication` |
| `note-saving` | `code-reading`、`edge-cases`、`software-testing`、`ai-code-review` |

## 2. 输入契约

### 2.1 页面输入

| 输入 | 说明 |
| --- | --- |
| `caseId` | 三个固定值：`shopping-cart`、`quiz-platform-permissions`、`note-saving` |
| `background` | `beginner` / `student` / `graduate` |
| `goal` | `internship` / `build` |
| 每题选择 | `optionId`，每题必须选一个 |
| 每题说明 | `explanation`，可选，最多 400 字符 |

### 2.2 生成题目请求

```http
POST /api/learning-path
Content-Type: application/json
```

```json
{
  "action": "questions",
  "caseId": "shopping-cart"
}
```

### 2.3 诊断请求

```json
{
  "action": "diagnose",
  "caseId": "shopping-cart",
  "learner": {
    "background": "student",
    "goal": "internship"
  },
  "responses": [
    {
      "questionId": "cart-requirements",
      "optionId": "clarify-rules",
      "explanation": "I would ask for expiry and rounding rules first."
    }
  ],
  "questions": []
}
```

`questions` 是**可选的完整题目数组**：

- 只有当前题目来源是 AI 时才回传。
- 目的是让服务端使用学生实际看到的题目、选项和反馈做诊断，避免“页面显示一套、服务端评分另一套”。
- 服务端把 `questions` 当作不可信输入，重新执行 `validateQuestions`。
- 客户端不需要、也不允许单独传 `conceptId` 或题目提示；服务端从题目集中推导。

接口限制：

- 请求体序列化后最大约 20,000 字符。
- `responses` 必须与当前题目数量完全一致，每题只能回答一次。
- `questionId`、`optionId` 必须属于当前题目集。
- `explanation` 最多 400 字符。
- `background` / `goal` 非法时回退到 `beginner` / `internship`。

## 3. 输出契约

### 3.1 生成题目响应

```json
{
  "source": "ai",
  "caseId": "shopping-cart",
  "questions": [
    {
      "id": "shopping-cart-requirements-ai-1a2b3c4d",
      "conceptId": "requirements",
      "prompt": "...",
      "strength": "...",
      "gap": "...",
      "options": [
        {
          "id": "choice-1",
          "score": 2,
          "label": "...",
          "feedback": "..."
        },
        {
          "id": "choice-2",
          "score": 1,
          "label": "...",
          "feedback": "..."
        },
        {
          "id": "choice-3",
          "score": 0,
          "label": "...",
          "feedback": "..."
        }
      ]
    }
  ]
}
```

关键规则：

- 每个知识点恰好 1 道题，所以每个 case 恰好 4 道题。
- AI 原始输出使用 `quality: "best" | "partial" | "off"`。
- 服务端把 quality 转成 `score: 2 | 1 | 0`，**quality 不返回给浏览器**。
- 服务端重新生成题目 ID：`{caseId}-{conceptId}-ai-{8位hex}`。
- 服务端会打乱选项顺序，再重命名为 `choice-1..3`。
- **不要假设 `choice-1` 是正确答案**，选项顺序每次都不同。
- 每次请求都会带新的 `variationToken` 和 `temperature: 1.15`，所以每次 `Retake` 都会重新请求一套题。
- 刷新页面不会重新出题，只会恢复已保存的那一套；只有 `Retake` / 重新开始诊断才会出新题。

题目/选项/结果的主要长度限制：

| 字段 | 限制 |
| --- | --- |
| prompt | 420 字符 |
| option label | 280 字符 |
| option feedback / strength / gap | 220 字符 |
| evidence | 240 字符 |
| next step | 180 字符 |
| overall summary | 500 字符 |

### 3.2 诊断响应

```json
{
  "source": "ai",
  "result": {
    "caseId": "shopping-cart",
    "overall": {
      "level": "developing",
      "summary": "..."
    },
    "dimensions": [
      {
        "conceptId": "requirements",
        "level": "ready",
        "evidence": "Ask for the exact rules...",
        "strength": "...",
        "gap": "..."
      }
    ],
    "priorities": [
      "edge-cases",
      "code-reading"
    ],
    "nextSteps": [
      "...",
      "..."
    ]
  }
}
```

约束：

- `overall.level` 只能是 `foundation` / `developing` / `ready`。
- `dimensions` 必须每个 case 知识点恰好一个，共 4 个。
- `priorities` 为 1–3 个当前 case 的 `conceptId`，是给 Part 2–4 的重点。
- `nextSteps` 为 2–4 条，每条最多 180 字符。
- `evidence` 必须是学生所选选项 label 或 explanation 中的**原文片段**，不能是编造或改写的句子。
- 返回结果不包含 numeric score、百分比、等级分数、录用预测。
- 服务端和浏览器都会用 `diagnosis-model.js` 再校验一次；非法结果返回 `502`，不会渲染。

### 3.3 本地样例诊断

当 AI 不可用时，仍可走本地 authored rubric：

- `GET /api/learning-path` 返回 `available: false` 时，页面加载 authored checks，按钮显示 **Run sample diagnosis**。
- 生成题目返回 `503 ai-not-configured` 时，自动加载 authored checks，但会明确显示 **Authored sample checks**。
- 生成题目返回其他错误时，不静默降级，显示错误卡片，提供 **Try again** / **Use authored checks**。
- 诊断返回 `503` 时，才自动切换为本地诊断，并明确标记 **Local sample diagnosis**。
- 如果 AI 题已生成、但诊断时遇到 `503`，会保留这套 AI 题，用本地 rubric 生成诊断；记录中会出现 `questionSource: "ai"` 但 `source: "local"`。

### 3.4 状态码

| 状态码 | 场景 | 前端处理 |
| --- | --- | --- |
| `200` | 成功 | 渲染结果 |
| `400` | 请求体、caseId、questions、responses 非法 | 显示错误 |
| `405` | 非 GET/POST | 显示错误 |
| `413` | 请求体超过限制 | 显示错误 |
| `502` | AI 请求失败或输出未通过校验 | 显示错误，保留答案 |
| `503 ai-not-configured` | 未配置 AI key | 显式加载本地样例/诊断 |

## 4. 存储与 Part 2 交接契约

### 4.1 诊断记录

通过 `shared/storage.js` 保存，完整 key 是：

```text
skillloop.v1.learningPathDiagnosis
```

记录形状：

```js
{
  schemaVersion: 2,
  caseId: "shopping-cart",
  questionSource: "ai" | "authored",
  questions?: Question[],          // 仅 AI 题记录保存
  learner: {
    background: "student",
    goal: "internship"
  },
  responses: [
    {
      questionId: "...",
      optionId: "...",
      explanation: "..."
    }
  ],
  result: {
    caseId,
    overall,
    dimensions,
    priorities,
    nextSteps
  },
  source: "ai" | "local",
  updatedAt: "2026-11-13T00:00:00.000Z"
}
```

注意两个来源字段含义不同：

| 字段 | 取值 | 含义 |
| --- | --- | --- |
| `questionSource` | `ai` / `authored` | 题目是 AI 生成还是固定样例 |
| `source` | `ai` / `local` | 诊断结果是 AI 生成还是本地 rubric |

所以 `questionSource: "ai"` + `source: "local"` 是合法组合，不要只看一个字段。

### 4.2 恢复规则

- `schemaVersion: 2` 正常恢复。
- 旧版 `schemaVersion: 1` 且使用 authored questions 的记录仍可恢复。
- AI 记录如果没有 `questions`，恢复会拒绝，避免“AI 标签但没有对应题目”。
- 恢复时会重新校验题目集、每个 response 的 optionId、以及每条 evidence 是否仍能在对应答案中找到。
- 旧 key `skillloop_learning_path_data_v10` 当前**不读取、不写入、不迁移**，保持原样。
- `data.js` 自己的 `schemaVersion: 1` 和诊断记录的 `schemaVersion: 2` 不是同一个版本号，注意不要混用。

### 4.3 共享 profile

Part 1 会读取并更新共享 `profile`：

```js
SkillLoop.write("profile", {
  ...existingProfile,
  background: state.learner.background,
  goal: state.learner.goal
});
```

当前不会写入 `diagnostic` 或 `quizScore`。

### 4.4 activity 事件

成功诊断后写入：

```js
SkillLoop.appendEvent({
  module: "learning-path",
  type: "diagnosis-completed",
  conceptIds: record.result.priorities
});
```

`appendEvent` 会自动补 `at`，并只保留最近 100 条。

注意：**当前事件没有 `caseId`，也没有 `source`**。如果 Part 2 只监听 activity，事件本身无法判断是哪个 case；必须读 `learningPathDiagnosis` 记录里的 `caseId`。

### 4.5 Part 2 推荐读取方式

```js
const record = window.SkillLoop.read("learningPathDiagnosis", null);

if (!record || record.schemaVersion !== 2) return;
if (record.caseId !== selectedCaseId) return;

const focus = record.result.priorities; // 1–3 个 conceptId
const dimensions = record.result.dimensions;
```

如果需要复用题目或做 evidence 校验：

```js
const caseData = window.LearningPathDiagnosisData.findCase(record.caseId);
const questions = record.questions || caseData.questions;
const view = { ...caseData, questions };
const check = window.LearningPathDiagnosisModel.validateResult(
  record.result,
  view,
  record.responses
);
```

Part 2 应优先使用：

- 同一个 `caseId`
- `result.priorities` 作为学习重点
- `result.dimensions[].gap` / `nextSteps` 作为任务输入
- 不要重新定义 case 或 concept ID

## 5. 页面跳转与状态变化

### 5.1 页面内状态机

`script.js` 通过 `setStage()` 切换三个 `<section>`，不是路由跳转：

```text
初始加载
  ├─ 有合法已保存记录 → result
  └─ 无记录/记录非法 → cases

cases
  └─ 选中 case 后点击 Start diagnosis
       → diagnosis（加载新题）

diagnosis
  ├─ Submit 成功 → result
  └─ Choose another case → cases（保留当前 case 选择和已保存记录）

result
  ├─ Retake → diagnosis（重新生成一套题）
  └─ New case → cases（清空内存状态和已保存记录）
```

补充行为：

- 刷新页面时，如果 local storage 中有合法记录，直接进入 `result`，不会重新出题。
- `Retake` 会重新请求一套 AI 题；如果新诊断失败，旧记录仍保留，页面显示错误并保留当前答案。
- `New case` 会写 `null` 清空 `learningPathDiagnosis`，并清空当前 case、题目、答案和结果。
- 没有 `?case=` 或 `?concept=` 深链；Part 1 当前不支持通过 URL 直接打开某个 case。
- 没有使用 `history.pushState`，浏览器后退不会在三个 stage 之间回退，通常会直接离开页面。
- stage 切换时会 focus + scroll 到对应标题/结果区，便于键盘和读屏用户。

### 5.2 页面跳转目标

- 全局侧栏仍由 `shared/navigation.js` 生成：
  - `My path` → `/learning-path/`
  - `Skill map` → `/knowledge-map/`
  - `Interview` → `/interview/`
  - `Correction lab` → `/correction-lab/`
- 顶部品牌链接 → `../index.html`
- 结果页“Priority knowledge points”链接：

```text
/knowledge-map/concept.html?graph=software-development&topic=<conceptId>
```

这是结果内容区**唯一指向具体知识点的业务链接**，会进入 Knowledge Map 的概念页。

- 顶部四步条 1–4 只是静态展示：
  - Step 1 `diagnose` 是当前步骤；
  - Step 2 `correction`、Step 3 `dialogue`、Step 4 `verification` 都是 `aria-disabled="true"`，没有链接或点击行为。
- 结果页的“Part 2 is next”卡片是锁定说明，**不是可点击入口**。
- 目前 `correction-lab/` 和 `interview/` 都没有读取 `learningPathDiagnosis`，所以 Part 2 还没有真正接通。若产品上 `correction-lab` 就是 Part 2，需要另外增加读取记录和 caseId/priorities 传递。

## 6. 公共区域改动

### 6.1 新增/修改的公共文件

| 文件 | 状态 | 对接影响 |
| --- | --- | --- |
| `api/learning-path.mjs` | 新增 | `/api/learning-path` 的 GET/POST 入口，支持 `questions` 和 `diagnose` |
| `server/ai.mjs` | 新增 | DeepSeek Chat Completions 通用服务：`configured()`、`modelName()`、`generateStructured()` |
| `.env.example` | 修改 | 新增 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`LEARNING_PATH_AI_MODEL` |
| `scripts/dev.mjs` | 修改 | 本地 dev server 增加 `/api/learning-path`，并解析 POST body |
| `package.json` | 修改 | 新增 `npm run test:learning-path` |
| `scripts/check.cjs` | 修改 | `npm test` 纳入 `learning-path/*.test.*` |
| `tests/learning-path-ai.test.mjs` | 新增 | 验证 DeepSeek 请求、JSON 解析、校验和错误处理 |
| `tests/learning-path-api.test.mjs` | 新增 | 验证 HTTP 边界、`questions` action、503 等 |

`server/ai.mjs` 的配置优先级：

```text
LEARNING_PATH_AI_MODEL
  > DEEPSEEK_MODEL
  > deepseek-flash
```

API key：

```text
DEEPSEEK_API_KEY
  > AI_GATEWAY_API_KEY（迁移兼容）
```

服务端请求地址：

```text
https://api.deepseek.com/chat/completions
```

目前 **只有 Part 1 引用 `server/ai.mjs`**。README 中“四个部分都调用它”是目标约定，不代表 interview/correction 已经迁移；其他模块仍使用各自原有 AI 逻辑。

### 6.2 未改但契约发生变化

| 文件 | 情况 |
| --- | --- |
| `shared/storage.js` | 代码未改，但新增 `learningPathDiagnosis` key 和 `diagnosis-completed` 事件 |
| `shared/navigation.js` | 未改，侧栏仍只有现有四个模块 |
| `shared/styles.css` | 未改；Part 1 样式在 `learning-path/style.css` |
| `vercel.json` | 未改；`api/learning-path.mjs` 走 Vercel 默认函数路由 |

### 6.3 需要合并前同步的公共文档

当前 `docs/DATA-CONTRACTS.md` 还是旧契约，和其他成员对接时容易读错：

- 示例事件仍写 `path-created`，实际是 `diagnosis-completed`。
- 存储表没有 `learningPathDiagnosis`。
- line 53 仍描述旧的 `skillloop_learning_path_data_v10` 和 `quizScore`，当前 Part 1 已不写这些。
- 根目录 `README.md` 仍把 learning path 描述为 rule-based recommendations，和现在的 AI 出题不一致。

建议合并前至少更新：

1. `docs/DATA-CONTRACTS.md` 的 storage key、event 和 learning-path 说明。
2. 根 `README.md` 的 learning-path 当前行为。
3. 决定 `diagnosis-completed` 是否补 `caseId`；目前 Part 2 只能从记录里拿 caseId。

## 7. 当前验证状态

已实际执行：

- `npm run test:learning-path`：25/25 通过。
- `npm test`：86/86 通过。
- `git diff --check`：通过。
- 本地 `GET /api/learning-path` 返回：

```json
{
  "available": true,
  "provider": "DeepSeek",
  "model": "deepseek-flash",
  "contractVersion": 1
}
```

尚未完成：

- 没有 headless browser，因此没有做真实浏览器逐按钮点击回归。
- 建议手工再走一遍：新 case → AI 出题 → 诊断 → Retake 出新题 → 刷新恢复 v2 记录 → AI 关闭时 authored fallback。

## 8. 给其他成员的最短对接结论

1. **Case ID 不要改**：只用 `shopping-cart`、`quiz-platform-permissions`、`note-saving`。
2. **Part 2 读这里**：`SkillLoop.read("learningPathDiagnosis", null)`，先校验 `schemaVersion === 2` 和 `caseId`。
3. **重点看 `result.priorities`**：它是 1–3 个 `conceptId`，直接作为 Part 2 的学习重点。
4. **不要依赖选项顺序**：AI 题的 `choice-1..3` 每次都会打乱。
5. **不要把 `source` 和 `questionSource` 混为一谈**：前者是诊断来源，后者是题目来源。
6. **Part 1 目前没有 Part 2 的可点击跳转**，只有结果页的 Knowledge Map 链接；Part 2 接入需要新增读取逻辑和路由/入口。
7. **公共文档目前落后于实现**，交接时以 `learning-path/README.md` 和实际代码为准，并尽快同步 `docs/DATA-CONTRACTS.md`。
