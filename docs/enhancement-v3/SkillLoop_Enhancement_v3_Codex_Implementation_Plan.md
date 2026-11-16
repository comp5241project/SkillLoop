# SkillLoop Enhancement v3 — Codex 分阶段实施计划

**版本：** v3.0 Implementation Plan · 2026-11-17  
**状态：** 可执行计划，不代表已实施；架构决策须用 Phase 0 审计结果验证  
**目标仓库：** `comp5241project/SkillLoop`  
**目标基线：** `feature/enhancement-v2`（Codex 开始时先核对实际工作树和分支）  
**唯一产品需求基准：** `SkillLoop_Enhancement_v3_Product_Direction_Freeze.md`  
**预期仓库文档位置：** `docs/enhancement-v3/PRODUCT-DIRECTION-FREEZE.md`、`docs/enhancement-v3/IMPLEMENTATION-PLAN.md`  

> 核心原则：**坚持目标，不固执于方案；不怕麻烦，但不盲目折腾。**

## 0. 执行方式与不可突破的授权边界

### 0.1 明确的实施目标

交付真实可用的端到端路径：

1. 教师输入公开 HTTPS 页面链接或上传 PDF/DOCX/TXT 文档；服务端提取真实正文。
2. AI 从材料生成可审核、可追溯的结构化知识笔记和学习目标；教师可修改、保存、重开。
3. 系统只从已具备完整四阶段能力的可信案例库推荐匹配案例；教师确认案例与覆盖的知识目标。
4. 教师审阅、发布不可变课程版本。最新版出现在公开课程库。
5. 学生登录、开始该课程版本的真实 Part 1 诊断；课程知识、案例版本、学生身份、诊断证据绑定一致。
6. 两个学生在同一课程版本上因诊断不同，获得真正不同的 Part 2 个性化讲解与练习；可重开、可核查来源、失败不丢记录。
7. 既有规范的 Part 3 修复、Part 4 可信验证及学习进度保持有效；不伪造完成状态。

教师界面**可以从零重新设计**。旧 Course Studio 的页面结构、字段排列、交互顺序均不是设计约束。只复用经审计证明有价值的底层服务与数据能力，必要时创建独立的 v3 课程模型、页面、服务和迁移。不得为了保留旧 UI 或旧 schema 使新产品变成四不像。

### 0.2 禁止未经授权修改 Part 1–4 代码

**用户原话：**“不改 P1234 的代码，如果一定要先经过我同意。”

Codex 可以只读审计、跑测试、发现问题，但**未经用户明确批准，禁止编辑、删除、格式化、移动或批量重写**以下文件：

- `learning-path/**` — Part 1
- `knowledge-map/**` — Part 2
- `interview/**` — Part 3
- `correction-lab/**` — Part 4
- 与四阶段学习语义紧密耦合的关键共享代码，例如 `shared/course-journey.js`、`shared/flow.js`、`enhancement-v2/m5-journey.cjs`、相关可信 runner/案例诊断与评估代码，以及阶段 API 的契约逻辑。

**禁止绕过：** 即使不编辑上述文件，也不得借新代理层、服务端重定向、路径劫持、持久化记录伪造、修改阶段完成判定或隐式改变阶段 API 行为，实质绕过限制。

**默认允许：** 新增 `enhancement-v3/**`、`docs/enhancement-v3/**`、`tests/enhancement-v3-*`、必要的**新增**数据库迁移；在审计后做向后兼容的非阶段性课程后端、首页入口、开发服务器静态路径/构建配置增量变更。不得破坏已有 v2 课程、匿名 Demo、认证、旧学习记录。`api/courses.mjs`、`enhancement-v2/m4-courses.mjs` 等非阶段性课程后台的任何修改，必须在 Phase 0 先列明范围与回归风险；如实际上改变 P1–4 业务规则，则同样需要用户批准。

### 0.3 触发审批时的强制动作

一旦某项需求**必须改动 P1–4 代码**或受保护学习行为：

1. **立刻停止该项改动，保持受保护文件原样。**
2. 形成 `APPROVAL REQUIRED — P1–P4 CODE CHANGE` 申请，列出：具体文件/函数、需要改什么、不能通过非侵入方式完成的证据、替代方案、影响的数据契约/权限/历史记录、测试、回退方案、风险。
3. 把申请呈给用户，提出一个清晰的是/否批准请求；在明确同意前不得实施。
4. 独立、不依赖这项变更的其他任务可继续，但不得宣称受阻的链路已完整交付。

沉默、模糊回应、对总体计划的同意，不等于对**具体受保护代码修改**的批准。用户同意只能覆盖申请中明确说明的范围。

### 0.4 目标坚持与止损原则（强制）

以正确、完整实现需求为目标，不因困难轻易放弃，但不得盲目坚持错误路径。

1. **及时反思：** 实现受阻或复杂度明显超出预期，重看根因和方案。
2. **避免无效重复：** 无新增证据或新思路时，不能反复尝试相似失败方案。
3. **控制修改范围：** 以实现需求所需的最小合理变更为原则，不随意扩大重构。
4. **主动调整方向：** 证据表明路线错误时及时替换，不因沉没成本固执坚持。
5. **坚守工程底线：** 不能牺牲正确性、安全性、稳定性或可维护性。

**任一暂停条件触发，立即暂停当前实现路径：**

- 同类问题连续尝试 **3 次**仍没有解决。
- 复杂度或修改范围明显超出最初判断。
- 修复持续制造新问题或回归。
- 需要大规模重构、核心架构变化或突破当前授权。
- 根因不清，或拿不出证据说明当前方案有效。

暂停后：记录失败路径、复盘最早错误假设与新证据、列出替代方案及其成本/风险，选择调整或回退；若新方向会突破约束或涉及重大风险，必须征求用户批准。**停止错误路径 ≠ 放弃最终任务。**

### 0.5 过程与质量要求

- **先看实际代码，再实施。** 不凭文件名和过时文档猜测当前实现。
- **依赖分阶段里程碑。** 每阶段都有可审查产物、可重复测试和明确退出条件。
- **一次只处理一个失败假设。** 保留证据和更改日志，不能通过大范围修改碰运气。
- **真实行为优先。** 不把静态假内容、假“上传完成”、随机换词、确定性模板伪装成 AI 或真实发布成果。
- **默认不 commit / push / merge。** 需要用户明确指定后再做。
- 输出每一阶段实际做了什么、哪些测试通过/失败、与冻结需求的差距；不能报告未经执行的测试。

## 1. 基线审计与系统边界（Phase 0 — 必须先完成）

**目标：** 把 v3 与现有 v2 的真实接入能力、差距和风险查清，避免边写边猜。

### 任务

1. 确认分支、工作树状态、现有未提交修改；不得覆盖用户或团队的已有工作。
2. 审计：
   - 正式课程及学生身份：`api/courses.mjs`、`enhancement-v2/m4-courses.mjs`、Supabase 迁移；
   - 教师发布/AI 作者能力：`enhancement-v2/studio/course.*`、`enhancement-v2/m3-ai-author.mjs`、`enhancement-v2/m3-teacher-draft.cjs`；
   - 官方支持的完整 Journey 案例：`enhancement-v2/m5-case-library.cjs`；
   - 学生正式 Journey（**只读**）：`shared/course-journey.js`、`enhancement-v2/m5-journey.cjs`；
   - 普通 Demo（**只读**）：四个 Part 页面及相关 contracts。
3. 明确两条不同的路径：普通 Part 1→2→3→4（含本地 AI）与 `?journey=1` 发布课程（含版本和持久化）。它们不是一套可以直接互换的学习记录。
4. 审计官方课程发布的兼容契约：`skillloop_courses.versions` 快照、`caseRef`、review/publish、attempt、learner ownership；特别确认**新 v3 课程能否在不改变 Part 1–4 的情况下获得合法的 Journey 链接**。
5. 审计是否能让新 v3 个性化教学读取**服务器认证的真实诊断记录**，不能用浏览器传来的“diagnosis summary”代替。
6. 核对静态服务的资源白名单、现有 cookie `Path=/api/courses`、API 路由限制、新文件上传大小约束；设计新路由时不能凭空认为 `/api/v3` 会继承原学生登录 cookie。
7. 记录已有测试基线：`npm test`；环境允许时运行 `tests/m4-browser.mjs`、`tests/m5-browser.mjs`。失败需分清环境问题与项目回归。

### 需要形成的方案决策

- **推荐默认：** v3 有独立且简洁的教师知识/来源数据模型，并通过**明确、经过验证的发布兼容适配器**关联到现有已批准 Journey 的课程版本。**不要**为迁就旧 Course Studio UI 强行复用它所有表单字段。
- 如果现有 M4 发布契约无法承载 v3 知识笔记，优先使用**新的附属、不可变 v3 知识快照**，通过 `courseId + publicationVersion` 强关联到合法的原课程发布快照。两边必须原子化处理，避免出现 v3 发布成功但 Journey 课程不存在。
- 如需要新数据库表，使用向后兼容迁移；不得直接破坏现有 v2 记录。
- 发现任何关键链路必须改 P1–4：先出**审批申请**，不可擅改或规避。

**产出：** `docs/enhancement-v3/G0-ARCHITECTURE-AUDIT.md`，含真实依赖图、数据契约、受保护文件、风险、建议路线和问题清单。

**退出条件：** 每个 v3 需求都能指向“可在授权内实现”或“需要审批的确切阻点”；不在模糊状态下进入大范围开发。

## 2. 数据契约与发布模型（Phase 1）

**目标：** 先建立内容可信、身份真实、版本可复现的数据基础，再堆界面。

### 建议的逻辑实体（不是必须照搬字段/数据库表）

- `SourceAsset`：ownerId、sourceType（url/pdf/docx/txt）、原始来源、提取状态/摘要、提取文本的安全引用及页码/段落定位；草稿私有。
- `CourseDraftV3`：teacherOwner、title、summary、learnerLevel、2–5 个 objectives、可编辑的 `KnowledgeNotes`、sourceRef、selected `TrustedCaseRef`、目标与可信 requirementId 的映射、revision、status。
- `KnowledgeNote`：稳定 noteId、heading、claim/text、sourceCitationRefs；来源可核查，未支持的论断不得声称引用成功。
- `CaseRecommendation`：来自可信库的 caseId/version/conceptId、matching requirementRefs、依据、覆盖状态/未匹配项；**推荐不等于审核通过**。
- `PublishedCourseV3`：immutable snapshot、contentHash、绑定的真实 M4 `courseId + publicationVersion`、案例版本与映射、发布人及时间；不能引用可变草稿。
- `PersonalizedLesson`：learnerId、attemptId、course/version、case identity、诊断证据摘要/哈希、lesson schema、aiSource/promptVersion、生成状态/失败原因与固定缓存键；用户隔离。

### 数据与 API 最低要求

- 发布前教师身份、所有权和 reviewer 确认；教师草稿和上传正文不对匿名用户公开。
- 公开目录只投影已发布的安全字段；绝不泄露私有测试、teacherAnswerGuidance、教师原始上传文档。
- 课程版本与案例版本分别固定；已开始 v1 的学生不能因老师发布 v2 被悄悄升级。
- 更新草稿使用 revision 乐观并发控制；旧页面不能覆盖新编辑。
- 在教师审核与发布之间，必须校验当前源笔记、案例映射、生成 schema、评审快照一致。
- 如采用 M4 兼容适配器，必须有独立契约测试保证原 Journey 能读取合法的已发布版本；不能通过直接拼接未验证 JSON 绕过原校验。

**产出：** 数据契约文档、必要的新迁移与单元/集成测试。

**退出条件：** 草稿、公开快照、个人教学三种数据边界清晰，旧记录可读。

## 3. 真实资料导入（Phase 2）

**目标：** 教师真的能从公开链接或文件获得可用文本，不是上传一个文件名。

### 实现

1. 新教师页面输入一条 HTTPS URL，或上传 PDF/DOCX/TXT。
2. 服务端完成提取，返回标题/状态、文本分段、来源位置与错误信息；控制原始正文访问权限。
3. HTTP 安全：限定 HTTPS、公开可解析域名、可信端口、私有/回环/元数据 IP 和 DNS rebinding 风险校验；重定向逐跳校验；限制下载体积、时限、响应类型。不得请求 `localhost`/内网服务器。
4. 文件安全：扩展名之外校验实际类型；限制上传和解压后体积、ZIP 路径/解压炸弹、文档内外链；禁执行宏/脚本；处理完销毁临时文件。
5. PDF/DOCX/TXT 提取实际正文。PDF 扫描件无可用文本时明确报错（v3 不做 OCR）。标注引用位置：URL、页、段落或稳定片段 ID。
6. 对乱码、内容空、截断、受限访问、无法解析等显示可理解的失败/恢复动作。
7. 材料中“请忽略上方指令”等文字一律按**不可信课程内容**处理。

**测试：** 真 PDF、真 DOCX、TXT、可访问公开 HTTPS；404、登录墙、图片型 PDF、恶意私网 URL、重定向到私网、超体积、无效文件、网络超时、空正文。自动测试可用本地夹具和模拟 fetch 进行安全覆盖；现场演示用真实材料。

**退出条件：** 至少用一个用户提供的文件完成真实提取，并完整支持冻结范围内的格式。

## 4. AI 知识笔记与来源依据（Phase 3）

**目标：** 生成教师真正可审核的知识基础，而不是把原文扔给 AI 输出长篇作文。

### 实现

- 提取内容先合理分块/限额，必要时多步总结，不能在静默截断后仍声称覆盖整篇材料。
- 返回受 schema 验证的结构化输出：标题、概要、level、2–5 learningObjectives、knowledgeNotes（每条有 text 和有效 sourceRefs）、待核查问题。
- 校验 sourceRef 指向真实已提取片段/页码；不允许模型编造页码、URL 锚点或上传文件名。校验知识点和资料的实际对应性；明显不支持的内容进入教师待核查列表。
- 与可信案例要求有冲突的材料，优先提示冲突，不能悄悄覆盖规范案例事实。
- 默认给教师**可直接编辑的笔记预览**；允许返回重改、保存草稿、重开，不用填原始 schema 字段。
- AI 身份、费用/并发/超时、JSON 结构验证、重试次数要有边界。调用失败显示失败并保留提取文本及教师编辑。

**测试：** 真实 AI 调用的小规模质量门槛；schema 坏输出、乱造引文、提示注入、分块遗漏、重试耗费、生成失败后的草稿恢复。

**退出条件：** 同一资料的笔记有可追溯引用，教师能修改/保存/重开；AI 成功路径实测，不以 mock 冒充。

## 5. 可信案例推荐与审核（Phase 4）

**目标：** AI 只从可验证案例库提出有解释的推荐，不创造假案例。

### 实现

- 案例候选必须来自服务器登记的 `supportedCourses()` / `journeyCase()`，同时验证 `diagnosis`、`learning`、`repairDialogue`、`executableVerification` 等实际 capabilities，及该 case/version 的可信 runner；不要把普通 Demo 列表当成正式 Journey 候选。
- 为候选建立**安全、公开的课程匹配索引**：caseId、version、conceptId、公开 requirementId/text、可覆盖的学习主题及诊断 target。禁止将私有测试、参考修复代码、内部评分答案发往模型。
- 让 AI 对候选做**推荐排序和解释**，后端检查 AI 只能返回候选白名单中的 ID、真实 requirementIds 和合法引用。排序分数不是事实证明。
- 显示 1–3 个候选（若确有足够候选），说明匹配原因、能覆盖哪些目标、有哪些材料知识未覆盖；无匹配时显示 “No suitable case”，允许教师更换内容/目标。
- 教师**明确选定**一个案例及其目标覆盖。发布前必须通过案例版本、目标范围和知识笔记一致性校验。
- 主演示材料应**同时覆盖** `cart-checkout@1 / edge-cases` 的 `empty-cart` 和 `discount`，使不同学生能在同一课程版本中匹配到不同薄弱点；备选为 `retry-queue@1 / edge-cases` 的 `backoff-cap` 和 `attempt-count`。

**测试：** 正确双目标匹配、错误主题拒绝、模型幻觉 ID/requirementId、无匹配状态、缺少可信 runner、案例版本变化后的失效保护。

**退出条件：** 推荐全部可解释且可回溯到真实可信案例事实；教师可以不接受 AI 推荐。

## 6. 重建教师端体验与发布（Phase 5）

**目标：** 交付一个真正自然的 **AI Course Builder**，不再强迫教师理解底层系统字段。

### 页面结构

1. **Import** — 上传文件/粘贴 URL，看到提取结果与错误恢复。
2. **Review Notes** — 浏览/编辑标题、目标、知识笔记、来源引用与待核查项。
3. **Choose Case** — 对比推荐候选、覆盖要求、可支持的四阶段及缺口，教师确认。
4. **Preview & Publish** — 学生视角预览、保存草稿、明确审核并发布。

### 交互准则

- 清晰的阶段进度；只有当前一步的主操作最显著；允许返回修改，不丢已保存工作。
- 默认隐藏 caseId、conceptId、requirementId、签名 receipt、revision 等技术元数据，需要时在详情里查看。
- 高级编辑可存在但不能成为生成与发布的必经路径。旧 Course Studio **不必作为 v3 页面基础**。
- 明确区分 Draft、Needs review、Approved、Published、Generation failed、No matching case；不给用户显示假成功。
- 不允许 AI 自动审批/发布；发布必须由教师做最终确认。

### 课程发布兼容（关键技术关口）

- 新 v3 课程必须指向一个**实际有效**的、版本固定的原 Journey 所需课程发布记录；老师发布后学生能打开正式 `/learning-path/?journey=1&course=…&version=…`。
- 可以在新的 v3 后端做经过验证的兼容适配器，调用合法的教师 review/publish 能力；不可直接向现有版本表写入不满足原 schema 的快照。
- 若需要采用独立 v3 发布表加关联旧 M4 版本，两者状态必须原子化或有可恢复的补偿机制，不允许一边发布成功而另一边缺失。
- **如果这一环节需要修改 Part 1–4 代码或真实业务行为，触发审批流程，停止该部分。**

**测试：** 教师账号合法发布；学生无法发布；草稿不公开；发布版本可通过旧 M5 Journey 读取；版本迭代不影响旧学生；并发编辑冲突；失败后恢复。

**退出条件：** 真正的教师发布后存在一份**可用而非仅能展示的**课程，且发布记录和 v3 知识快照一致。

## 7. 公开课程库与学生空间（Phase 6）

**目标：** 让用户无需手工复制老师给的课程 URL。

### 页面与接口

- 匿名 `Course Library` 只列出每门课**最新已发布版本**的安全摘要；不列草稿、不显示教师答案或私有文档。
- `My Learning` 仅学生登录可见，显示已开始的 `courseId + pinnedVersion`、真实最近阶段/结果及 Resume 入口。
- 已登录学生默认进入个人空间；未登录默认首页有 Try Demo、Browse Courses；教师登录默认前往 v3 Teacher Studio。
- `Start Learning` 使用现有、经过授权的 `start`/`journey` 机制，不能造一个仅在客户端显示的假学习进度。
- 不增加班级、教师分配、选课审批、收藏、评分、推荐算法等功能。
- 首页、v3 页面与静态服务可用不破坏阶段行为的增量改动完成导航；原 Demo 保留。

**接口风险提醒：** 旧 `op=list` 是教师草稿列表；严禁直接暴露给学生。旧课程认证 cookie 限于 `/api/courses` 路径，新 API 如使用其他路径，须经审计采用安全的认证复用方案（例如同源下非破坏性新增 v3 op），不能假设 cookie 会自动发送。

**测试：** 游客可看公开课；游客/其他学生不能看草稿；学生 A 只能看到自己的学习记录；学生 B 无法操作 A 的 attempt；旧版本的 Resume 仍指向旧版本。

**退出条件：** 从公开课程库能进入一门**真实已发布**课程并保存该学生学习记录。

## 8. 教师笔记驱动的学生个性化教学（Phase 7，v3 核心）

**目标：** 不修改 P1–4 代码前提下，把教师可信知识和真实诊断证据接到新的个性化教学服务上。

### 已有约束（不要误判）

- 当前 `?journey=1` Part 2 由 `shared/course-journey.js` + `enhancement-v2/m5-journey.cjs` 渲染；实时 AI 个性化尚未在正式 Journey 中启用。
- `knowledge-map/learning.js` 的普通 Part 2 是另一套实现，不能因为它已能生成 AI 课程，就认为已发布课也天然具备该功能。
- 未获授权前，不得改动任一 Part 2 渲染器、旧 Journey 状态推进或规范练习评分。

### 个性化服务要求

1. 服务端从**认证学生该课程固定版本的真实 attempt**读取 Part 1 诊断证据、target 和 case/version；请求体中任意诊断文字仅可作为非可信提示，不能充当已验证结果。
2. 从同一个已发布的 `TeacherApprovedNotes` 快照读出目标相关知识与有效 `sourceRefs`；再读取可信案例的公开需求和代码片段。
3. 输入建立严格授权边界：`courseId/version + attemptId/learnerId + diagnosisTarget + teacherNotesHash + trustedCaseRef`。服务器负责校验一致性，防跨学生或跨版本。
4. AI 输出经 schema 校验的：`objective`、`targetedRequirementRefs`、`diagnosticEvidenceRef`、`explanation`、`caseApplication`、`practicePrompt`、`sourceReferences`、`aiSource`、`promptVersion`；所有 requirement/ref 必须确实存在于批准的课程/案例内容中。
5. 生成个性化解释、案例应用与练习**必须实质因诊断不同而改变**。演示的 `empty-cart` vs `discount` 应可直接核对目标、举例和练习不同；不接受同一固定卡片换个标题。
6. 为同一 attempt / pinned publication / diagnosis fingerprint 做**持久化缓存与幂等处理**；刷新不重复收费、不覆盖原先作答；修改诊断须按既有规范重新绑定而不能悄悄覆盖旧记录。
7. 失败时显示教师审核笔记或确定性教学作为**明确标注来源的回退**，允许重试；模型失败不能使已保存学习状态消失。
8. 若提供个性化练习答案反馈，独立保存原答案和反馈，绝不冒充旧 `target.practice` 的规范评分。是否接入真实多轮追问另列后续阶段，不要虚报 R04 已完成。

### 无侵入学生展示方案与审批关口

- **优先试验：** 在 `enhancement-v3/` 新页面做课程学习入口与**个性化教学伴随页面**，围绕已完成的真实 Part 1 诊断呈现教师笔记、AI 个性化说明/练习及其出处；给出清晰的原规范 Part 2 / Part 3 / Part 4 入口。所有规范阶段仍由旧 Journey 管理。
- 注意：原 Part 1 的内置 Continue 链接可能直接去旧 `knowledge-map/?journey=1`，新 v3 页面不一定能自动插入其中。**不能靠劫持页面/路由或伪造规范完成记录来假装无缝。** 如果需要更改旧页面内置导航或正式 Part 2 内容，必须向用户提交精确的受保护代码变更申请。
- 如果不获批准，仍可交付可用的个性化伴随功能，但验收报告必须明确说明它与规范 Part 2 的关系，**不能把它称作已完成的原位 Part 2 替换**。

**测试：** 同课同版两名真实学生使用不同诊断证据，分别看到 `empty-cart` 和 `discount` 的不同 AI 课程重点；同一人刷新返回相同课程；学生 B 无法读取 A 的个性化课程；内容均引用真实教师笔记/规范案例；失败/超时/坏 JSON 可恢复；现有 `journey` 规范完成状态未被篡改。

**退出条件：** “同一份教师课程，不同学生有不同重点的 Part 2 教学”有可重复的数据证据；**是否已经原位集成到既有 Part 2，必须如实标注**。

## 9. 端到端体验、测试、发布准备（Phase 8）

### 正式演示脚本（不能伪造）

1. 教师登录 v3 Builder，上传准备好的**真实、可解析**的关于空购物车与折扣边界的文档（或公开 HTTPS 网页）。
2. 后端展示真实抽取结果；实时 AI 提炼并输出含来源的课程知识笔记。
3. 匹配器推荐 `cart-checkout@1 / edge-cases` 并指出覆盖 `empty-cart` 和 `discount`；教师审核、可编辑、确认发布。
4. 新课程自动进入公共课程库，草稿不可见。
5. 学生 A 和 B 分别登录同一已发布版本，完成真实 Part 1。A 在 empty-cart 诊断点暴露薄弱点，B 在 discount 诊断点暴露薄弱点。
6. 查看 v3 个性化教学，A 聚焦空购物车 `0/0` 处理，B 聚焦折扣边界及越界拒绝；**这两份应由真实 AI 受教师内容约束生成**，且有不同的真实诊断目标和练习证据。不能用两份预设文字假装实时生成。
7. 两者按当前已支持的旧 Journey 机制完成规范修复与真实 Part 4 runner 验证；如果无缝跳转需要更改受保护 P1–4，先提交审批，不改代码。
8. 刷新、登出/登录、重开课程和老师发布下一版本；原学生仍保留原版本与个人记录。

### 必须执行的验证

- `npm test`（比较 Phase 0 基线）。
- 已有与课程、作者、正式 Journey 相关测试，例如 `tests/enhancement-v2-m4-courses.test.mjs`、`tests/enhancement-v2-m5-journey.test.mjs`、`tests/enhancement-v2-r07-authoring.test.mjs`。
- 在有授权数据库及测试浏览器的环境下执行 `tests/m4-browser.mjs`、`tests/m5-browser.mjs`，或等价真实浏览器 E2E。
- 新的 v3 API/上传/认证隔离/课程匹配/版本/知识引用/AI 缓存/冲突/失败/权限测试。
- 375px 手机与桌面端基本视觉与键盘交互核对；不用重做 Part 1–4 视觉。
- 检查每次提交的 diff：受保护 P1–4 文件不得变化；若曾意外出现，立即停止并恢复原状，先核对是否用户工作树既有改动，**不得覆盖用户原有修改**。

### 交付报告内容

1. 实际新增/修改文件；每个阶段需求 A01–A10 的状态（通过、未通过、受审批阻挡）。
2. 真实 API/DB 测试结果；哪些来自 mock、哪些调用了实时 AI。
3. 数据来源证明：导入片段 → 审核笔记 → case requirement → 学生诊断 → 个性化内容 → 规范 Journey。
4. 安全验证与遗留风险、回归问题、未解决阻碍。
5. 若存在：清晰列出“必须经用户批准才能修改”的 P1–4 文件和最小变更计划。

**退出条件：** 没有冒称完全联通；可复现主线全部按真实环境通过，或如实报告阻碍并取得需要的用户批准后再继续。

## 10. 每阶段的工作反馈格式（给 Codex）

每个 Phase 完成时提供以下简洁状态：

```text
Phase: <n> / <name>
Goal: <expected outcome>
Changed: <exact files>
Protected P1–P4 files modified: NO / APPROVED CHANGE ID
Verified: <actual commands, real results>
Open blockers: <specific issue, evidence>
Next: <one concrete step>
Decision needed from user: <none OR exact approval request>
```

不许使用诸如“应该已经正常”“看起来通过”来替代证据。若一个 Phase 的目标尚未满足，不得仅因为页面可见就标记完成。

## 11. 需要申请受保护代码改动时的模板

```text
APPROVAL REQUIRED — P1–P4 CODE CHANGE

Blocked v3 requirement: <e.g. V3-A06 seamless transition>
Current observable behavior: <what is actually happening>
Root cause and evidence: <file/function/lines/tests>
Exact protected files to change: <paths>
Proposed minimal change: <behavior and illustrative diff summary>
Why new v3 code alone is insufficient: <alternatives tested and evidence>
Effects on: <existing Demo, journey, API contract, data, auth, tests>
Risk level and rollback plan: <facts>
Tests to add/run: <commands>
Scope excluded: <what will NOT be changed>

Request: Do you explicitly approve these exact P1–P4 code changes?

Status until approval: BLOCKED; do not edit protected files.
```

## 12. 给 Codex 的初始执行指令（可直接复制）

```text
Implement SkillLoop Enhancement v3 according to these two documents:
- docs/enhancement-v3/PRODUCT-DIRECTION-FREEZE.md
- docs/enhancement-v3/IMPLEMENTATION-PLAN.md

Begin with Phase 0: inspect the actual repository and baseline before changing code. Then execute authorized phases in order, implementing real working functionality, tests, and recoverable failure paths. The teacher builder UI may be redesigned from scratch; do not preserve the old Course Studio UX merely for compatibility. Reuse underlying v2 functionality only where it is sound and appropriate. Do not reduce core requirements to mock/demo-only behavior.

HARD RESTRICTION: Do not modify ANY Part 1–4 code, including learning-path/**, knowledge-map/**, interview/**, correction-lab/** or tightly coupled journey/flow/stage behavior, without my prior explicit permission for the exact proposed diff. Reading and testing are allowed. New v3 pages/services, backward-compatible course-level infrastructure and new migrations are allowed within the freeze document's bounds. Do not bypass this restriction via routing, proxies or fake progress.

STOP-LOSS RULE: Pursue the goal, not a failing implementation path. Reassess after 3 unsuccessful same-class attempts, escalating scope/complexity, repeated regressions, unclear root cause, or core architecture changes. Record evidence and alternatives before deciding to adjust, revert or request approval. Never trade correctness, security, reliability or maintainability for speed.

For each phase, report exact changed files, actual tests, remaining blockers, and whether protected files were touched. If true end-to-end integration requires a protected change, stop that specific change, provide a precise approval request, and continue only independent authorized work. Do not commit, push or merge without permission.
```

---

**最终交付标准：** 不是一套漂亮的上传向导，而是**教师可基于真实资料发布可信课程；公开学生可选课并接受诊断；同课同版的不同学生获得有依据的不同教学；原修复与验证不被破坏**。任何因 Part 1–4 不可改动而无法无缝整合的地方，都必须直说、走审批，不能在 UI 上掩盖。
