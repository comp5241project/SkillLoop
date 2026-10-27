# Knowledge v0.4 目标架构与实施计划

**状态**：2026-10-27 架构重审版；用户随后授权以 goal 模式开发 v0.4。实际代码、迁移与预览验证进度见 `KNOWLEDGE-V04-IMPLEMENTATION-STATUS.md`。<br>
**范围**：`feature/knowledge-map` 分支内的 Knowledge 模块。其他团队模块及其代码不在重构范围；共享接口变化先提交影响分析与迁移方案。<br>
**产品依据**：`C:\Users\chu\Desktop\H\SE\SE-skillloop\SkillLoop_Knowledge_Pipeline_v0.4_Plan_Revised.docx` 与同目录 Grill Record。已确认的交互、内容语义、权限和历史链接优先于 v0.3 的内部实现。<br>
**现状依据**：本仓库当前工作树；现有未提交修改在实施前需逐项核对，不能覆盖。

## 1. 架构判断

现有实现有两套互不相通的 Knowledge 内容：v0.3 静态精选 Unit/Direction，和以完整 Graph payload 为中心的教师草稿/发布系统。现有 AI `discover` 是教师私有的网页搜索摘要，并不采集、固定和验证输入来源，也不产生 Unit/Direction/Graph Proposal。直接给现有 Graph Studio 增加几个 Unit 表单，会把产品流程塞进错误的发布单位，并使来源、提案与版本语义分裂。

**建议采用 Knowledge v0.4 目标模型，并让旧图谱系统成为受支持的兼容路径。** 新模型以 Unit 创作为默认组织方式，同时保留独立图谱。新模型不沿用旧 `publication/topics/relations/events/questions/activities` 大 payload 作为 Unit 的写入格式，也不要求旧数据库表、API `op` 或组件承担新职责。旧接口可以继续服务现有图谱和历史链接，逐步通过适配器对齐公开阅读契约。重构的对象是内部实现；必须保留的是读者可见行为和已有数据可访问性。

## 2. 从教师旅程推导的目标架构

### 2.1 创作旅程和状态边界

```text
Create Unit (URL or manual topic)
  → Source capture (optional for manual work)
  → AI analyzes captured source or teacher topic: Unit title, summary, guiding question and candidate Directions (optional)
  → Direction Planning: teacher selects, edits, merges or adds Directions
  → Teacher confirms plan revision
  → AI generates Unit narrative, Direction Graph concepts/relations, explanations and Learning Activities for confirmed Directions (optional)
  → Teacher reviews and edits as a whole; optionally refines or regenerates parts
  → Internal preflight + risk prompts
  → Explicit publish of immutable Unit Version with fixed Graph Version references
  → From Teachers reading; separate Discover curation may follow
```

AI 的第一轮产物包括 Unit 标题、简介、核心问题和候选 Exploration Directions，不能仅给出来源摘要或图谱。教师确认规划后，第二轮生成配套 Unit 正文、所选已确认方向的概念与关系、相关解释及 Learning Activities；教师随后整体审查，按需局部修改或重新生成。教师可分批生成方向，但每次生成都须为所选方向提供完整配套内容。教师可以不使用 AI，手工完成相同的 Unit、Direction、Graph Draft 与发布流程。独立图谱继续可单独创建、编辑和发布，但其存在不改变每个 Direction Graph 独立身份与版本的规则。AI 与手工共用同一草稿、检查与发布语义。

**人机边界**：采集、来源/主题分析和内容生成是有状态的机器任务；Direction 确认、提案纳入草稿和正式发布是教师动作。不要让一个后台 Workflow 长时间暂停等待教师决定。每次教师动作持久化为草稿状态；之后启动新的、以该状态版本为输入的机器任务。Direction Planning 可批量确认并按需精细编辑；AI 只为已确认且被选择的 Direction 生成图谱内容，不得添加未确认方向。Unit 正文与活动的生成须以最终确认的方向规划为约束。

### 2.2 领域对象与不变量

| 对象 | 语义与不变量 |
| --- | --- |
| `UnitDraft` | 教师拥有的可编辑教学作品；可手工开始，保存时用修订号防覆盖。它不是 AI Proposal，也不是公开版本。 |
| `DirectionPlan` | Unit 内的教学问题、范围与排序；有独立稳定 ID、规划修订号和确认状态。生成任务固定读取某个已确认修订号。 |
| `DirectionGraph` / `GraphDraft` | 每个 Direction 拥有独立身份的 Direction Graph 及其可编辑草稿，图谱版本独立演进。独立图谱保留另一条创作入口，可共用编辑模型和工具；Direction 复用其内容时保留独立图谱的固定来源版本，同时形成自身的 Direction Graph 身份与版本，不以独立图谱 ID 取代 Direction Graph ID。概念默认图谱局部身份，跨图谱复用须教师确认。 |
| `SourceRecord` | 教师或采集任务登记的材料身份与出处。手工内容可引用教师核查并标明位置的材料；登记 URL 不表示系统已采集或 AI 已读。 |
| `SourceSnapshot` | 某次成功采集到的有限材料，与 SourceRecord 关联。保留实际用于 AI 分析的修订标识、采集时间、范围和材料指纹。 |
| `EvidenceRef` | 对具体代码实现、文件位置、研究结论、事件数据或明确引用外部材料的事实，指向可核查来源与位置，并区分教师手工核查和系统采集快照。一般性解释、教学判断、学习活动与练习问题不强制逐句引用。 |
| `Job` | 采集、分析或生成的一次可恢复执行，记录输入指纹、状态、失败原因和幂等键；页面刷新不会丢失进度。 |
| `Proposal` | AI 的不可变候选修订，记录来源、模型/提示词/schema 版本、目标草稿与 Direction 规划修订号。只通过显式纳入操作影响草稿；重试生成新 Proposal。 |
| `PublishedGraphVersion` | 不可变图谱快照；每个 Direction Graph 独立演进版本，独立图谱也有自己的版本。Unit 可引用已发布版本，或在同一发布事务中创建新版本。 |
| `PublishedUnitVersion` | 不可变 Unit 快照，固定引用指定的 Direction Graph Versions，并记录来源与发布者。图谱后续产生新版本不改变历史 Unit Version。 |
| `ChannelPlacement` | 独立于发布状态的 Discover 精选关系；From Teachers 由教师正式发布决定。取消精选不撤回教师发布。 |
| `Withdrawal` | 对指定公开版本的显式撤回状态与原因；旧链接呈现说明，不自动跳到最新版。 |

**标识规则**：Unit、Direction、Graph、Concept、Source、Proposal 与公开版本分别有稳定身份；不要把 `topicId`、`graphId` 或标题拼接作为跨对象的唯一语义。公开链接经解析层寻找对应版本，允许旧 ID 映射。内部键类型与具体列名在迁移设计时确定，此处先固定语义。

**证据规则**：不要求 AI 或教师内容逐句附来源。涉及具体代码实现、文件位置、研究结论、事件数据及明确引用外部材料的事实，必须有可核查来源；代码行号只在固定 commit 上核实后显示。一般性概念解释、教学判断、学习活动和练习问题不强制外部引用。AI 若基于某来源作上述具体主张，须关联已成功采集的快照；教师可使用手工核查的 SourceRecord 与位置，并记录核查信息。教师只提供主题时，AI 可提出一般性教学结构和待核实内容，不得伪造已读取的来源或具体事实。采集失败不得生成声称已读该来源的 Proposal。发布时校验必需证据引用的真实性与有效性，不强制重新访问外网；v0.4 不做持续监测或自动撤回。

**审核规则**：以 Unit 或 Direction 整体审视为默认，可按模块批量纳入或针对单项编辑/拒绝/局部再生成；没有逐项“已审核”强制记录。Direction 规划确认及最终发布确认必需。缺权限、结构无效、虚构来源、无效的必需证据引用、未确认却要公开的方向及无效版本引用阻断发布；其他来源不足、低置信度、疑似重复或内容质量疑虑仅简洁提示教师判断。

### 2.3 服务边界与数据流

```text
Browser: Unit Workspace / Direction Editor / Independent Graphs / Reader
    │  authenticated commands + read projections
    ▼
Knowledge API (new resource-oriented modules; existing /api/knowledge compatibility retained)
    ├─ Authoring service: drafts, planning confirmation, proposal merge
    ├─ Source service: bounded fetch, immutable snapshot, evidence pointers
    ├─ AI orchestration: Unit/Direction planning proposal + complete post-confirmation content generation
    ├─ Publication service: preflight, mixed existing/new Graph Version references, atomic snapshot, withdrawal
    └─ Reader service: Discover / From Teachers / fixed-version resolution
    │
    ├─ Postgres: durable authoring and publication source of truth; ownership/RLS
    ├─ Durable job runner: machine stages only, status mirrored to Job records
    └─ Legacy adapters: v0.3 curated catalog and current published graph links
```

前端不直接操作 AI Provider 或外部 URL；来源和模型密钥留在服务端。API 可继续由现有 Vercel 项目提供，但应拆成按职责维护的模块，而不是继续扩张一个 `op` 分支文件。首次架构验证需核对实际部署能力与费用。针对多步骤机器任务，优先评估 Vercel Workflow；队列适合单阶段后台任务。无论选择哪种执行器，**Postgres 中的 Job、Proposal、草稿和发布状态是产品可见的权威状态**，执行器自身的日志与保留期不能替代业务记录。幂等键、输入修订号检查和结果落库负责避免重复执行与过期结果覆盖教师修改。

数据库建议在现有 Supabase 项目中建立新的 Knowledge v0.4 实体及索引，使用受约束的关系字段表达所有权、稳定身份、版本和外键，内容块/图谱快照可采用版本化 JSONB；避免把整个生命周期塞进一张宽泛 JSONB 表。公开读取只经已发布投影；草稿、来源快照和 Proposal 由教师本人可读写。公开 schema 中的表启用 RLS。发布事务先校验教师权限、Unit/Graph 草稿 Revision 和所有固定引用；可引用已发布的 Graph Versions，也可在**同一事务**中先写入需要的新 Graph Versions，再写入固定引用它们的 Unit Version。未修改的关联图谱无需重复发布。任一校验或写入失败则整体回滚，避免公开 Unit 指向尚未发布或不一致的图谱版本。具体表/列/索引/RPC 名称及执行器选型在 Phase 0 的设计验证中定稿，不能先迁移再补契约。

### 2.4 页面信息架构

- **Teaching Studio**：顶层 Units（默认）与 Independent Graphs。Unit Workspace 分 Overview & Sources、AI Analysis、Directions、Learning Activities、Review & Publish；选择 Direction 后进入其独立身份的 Graph Editor，保留 Graph Canvas + Concept Inspector 的交互价值。复用独立图谱时显示被采用的固定来源版本与 Direction Graph 自身版本。
- **Knowledge Home**：Discover 与 From Teachers 两频道；前者展示 v0.3 精选内容，后者展示教师正式发布的 Unit。频道共用 Unit/Direction 详情阅读结构，但保留内容来源、发布者、返回入口和治理规则。
- **公开详情**：展示 Unit 内容、固定 Direction 版本、来源、分析修订版、采集时间和教师最近复核时间。旧版、撤回、缺失版本及来源信息缺失有明确状态。第一版 From Teachers 支持浏览/搜索及教师、主题、类型筛选，不做排名或个性化。

## 3. 现状差异和重构决策

以下“成本/风险”为基于代码结构的相对判断，未测算工时；Phase 0 需用原型和迁移演练校正。

| 旧模块与证据 | 直接复用 | 局部重构 | 完全替换 | 决策与理由 |
| --- | --- | --- | --- | --- |
| `curated-data.js`、`curated-model.js`、`curated-pages.js`：静态 catalog 固定 Unit→Graph 版本，校验写死四个精选 Unit，页面直接读全局静态数据 | 成本低，但无法承载教师草稿、来源快照与 From Teachers 动态内容 | 保留 catalog 与旧版本 resolver；抽出共享 Reader 契约和渲染视图 | 全部迁到新 DB 成本高，易损旧 URL 与核查内容 | **局部重构**。保留 v0.3 内容和可验证旧行为；新阅读适配层不继承“必须四篇静态内容”的约束。新模型中每个 Direction Graph 独立版本演进。 |
| `teacher.html`、`teacher.js`、`studio-ui.js`：Graph Library→Concepts/Relations/Questions/Cases→Review，单个大型页面脚本 | 初期成本低，Unit-first 流程会被 graph-first 状态和表单牵制 | 抽少量表单或 canvas 事件 | 新建 Unit Workspace/Direction Editor 页面状态和路由；保留可用交互模式 | **主要替换**。目标页面的导航、草稿保存与 AI 状态必须围绕 Unit/Direction 组织；迁移期间保留旧 Graph Studio 供现有教师图谱使用。 |
| `network-core.js` Canvas + Concept Inspector 交互 | 可复用绘图/缩放/选择能力，若直接传旧 topic payload 会泄露旧数据语义 | 抽为接收 v0.4 Graph ViewModel 的图谱画布与 Inspector | 重写画布成本、键盘/回归风险高 | **局部重构**。复用可验证的交互基础，替换数据适配和所有权；若原画布耦合太深，Phase 0 原型可改判为替换。 |
| `api/_knowledge-model.mjs`：完整 Graph payload 验证要求 lesson、question 等课程字段，关系限四类 | 产品适配差，Direction Graph 和事实证据无法自然表达 | 保留旧图谱验证器供旧接口使用，另建 v0.4 契约与校验 | 立刻替换会破坏旧发布流程 | **并行新模型**。旧验证器只管旧 Graph，不作为 Unit/Direction 的 schema。 |
| `api/knowledge.mjs`：一个 `op` 路由处理公开图谱、账户、个人图谱、教师图谱和 AI 搜索 | 继续加分支成本低但耦合、鉴权与测试风险迅速升高 | 保留旧 URL 入口作兼容层，新增按职责划分的 API 模块 | 全部替换影响已有客户端与深链 | **局部重构 + 新模块**。新 Unit API 不依赖旧 `op` 形状；旧 Graph API 稳定转接。 |
| `skillloop_graphs`/`drafts`/`publications` 与发布 RPC：graph_id 为主键，一份大 payload，发布事务只固定 Graph | 无 Unit、Direction、Proposal、Source 身份；改字段会污染旧数据 | 保留旧表处理旧图谱，新建 v0.4 关系与发布事务，逐步适配读取 | 原地重写风险高，历史版本和个人引用依赖旧表 | **并行新持久层**。复用 Supabase Auth/Postgres 运维平台，不复用旧图谱表作为新核心。 |
| 现有 `discover`：模型网页搜索摘要保存为私有 research note | 不能证明具体 URL 内容已采集，不适合 v0.4 证据链 | 保留为旧教师研究工具，新的受限 URL fetch/analysis/generation 独立实现 | 删除会损失旧工作台功能 | **新建 AI 流水线**，旧 discover 暂保留为兼容功能，之后按使用情况退役。 |
| 账户/角色、个人图谱和共享导航：已有教师角色、Cookie 会话、个人引用旧图谱 ID | 会话与角色可减成本；把个人引用扩展到静态 Direction 会破坏语义 | 复用身份认证与页面壳，补 v0.4 对象所有权/RLS；公开新路由单独设计 | 整套更换认证及个人图谱风险高且不在产品范围 | **选择性复用**。保护跨模块导航/登录契约；个人图谱与其他模块代码不改。 |

**结论**：最需替换的是教师信息架构、Unit/Direction 领域模型及 AI 生产流水线；最值得保留的是 v0.3 核查内容、已验证的画布交互、身份会话和旧链接读取能力。复用选择依据是产品适配度与总维护成本，不以修改行数最少为目标。

## 4. 兼容、迁移与影响边界

1. **冻结外部契约而非旧实现**：用测试记录 `/knowledge-map/?topic=…`、`graph.html`、`concept.html`、`question.html`、`case.html`、`unit.html`、`direction.html` 及 `version=` 的现有行为；记录稳定 ID、公开数据与个人引用关系。历史 Unit 固定其 Direction Graph Versions，图谱升级不静默换版。
2. **并行建立新模型**：先提供新 Unit/Direction/Source/Proposal/Published Version 的迁移草案、RLS 与回滚路径，再实施增量迁移。旧图谱表和 RPC 在兼容期保持可用；不要直接把 v0.3 静态内容转成某位教师的发布记录。
3. **读写切换分离**：新教师创作写入新模型；旧 Graph Studio 继续读写旧对象。公开 Reader 通过适配器解析 Discover 静态内容、From Teachers 新发布内容和旧独立图谱链接。待覆盖率与回归通过后再考虑归并旧内部代码。
4. **共享接口影响**：现有其他团队引用的七个 concept ID、`?topic=` 路由、共享导航、登录状态和个人图谱引用不改变可观察行为。若必须调整共享接口，先列消费者、旧/新契约、兼容时间窗和回退方式；未经授权不修改其他团队模块代码。
5. **部署回退**：新增 API/表采用可并存方式；新 UI 入口可关闭或回退到旧页面。已发布版本写入后保持不可变，不通过“回退部署”删除历史数据。数据迁移和权限验证须在隔离环境演练后再申请执行。

## 5. 渐进实施计划：每阶段朝同一架构推进

| 阶段 | 工作与交付物 | 通过门槛 |
| --- | --- | --- |
| **0. 目标契约与风险原型** | 产出对象/状态图、API 命令与读投影、旧链接兼容矩阵、RLS/混合 Graph Version 发布事务设计、执行器成本与可用性验证。做受限 Graph ViewModel/Canvas 原型，以及轻量 LLM 技术验证：以一份受控来源和一个教师主题分别试验结构化 Unit/Direction 规划、确认后完整内容生成、证据标记、无效输出处理与成本/延迟；不接入正式草稿或发布。 | 证明 Unit-first 写入不依赖旧 Graph payload；确认历史 URL/ID/个人引用的回归清单；验证 AI 两段生成的可行性及失败边界，选定任务执行器与迁移策略。无数据库迁移。 |
| **1. 共同骨架与手工纵切片** | 建立完整目标模型的草稿、DirectionPlan、SourceRecord/EvidenceRef、Proposal/Job 槽位和发布契约；实现 Unit Workspace、手工 Directions、Graph Draft、独立图谱入口及保存。 | 无 AI 时可完成手工 Unit→已确认 Direction→Graph Draft→发布预检；教师可登记并核查手工来源；从一开始保留采集与提案接口，避免后续重写核心对象。 |
| **2. 发布与双频道阅读** | 实现混合引用已发布/同事务新发布 Graph Versions 的原子 Unit 发布、固定版本读取、撤回、Discover/From Teachers 适配及共享详情。 | 只修改 Unit 时可复用已有 Graph Versions；新 Graph Versions 与 Unit 同事务发布；失败整体回滚；匿名用户只见正式版本，旧链接和 v0.3 内容保持。 |
| **3. 受限来源采集** | 单公开 GitHub/文章 URL 的安全获取、固定修订/范围、SourceSnapshot、EvidenceRef、失败状态与幂等 Job。 | 真实 URL、超时、超限、权限拒绝、SSRF/重定向边界和重复提交可验；采集失败不进入“已分析”。 |
| **4. AI 分析与方向规划** | 分析已采集来源或教师主题，提出 Unit 标题、简介、核心问题及候选 Directions；教师可选择、编辑、合并或新增方向并显式确认，结果与规划修订号绑定。 | 无来源的主题分析不假称读过材料；未确认方向无法进入图谱生成；过期 Proposal 不覆盖教师修改；AI 不可用时手工路径仍畅通。 |
| **5. 确认后完整生成与教师整理** | 依据已确认 Directions 生成 Unit 正文、选定方向的 Graph 概念/关系、解释和 Learning Activities；支持整体/模块/单项处理、局部再生成、风险提示、草稿 diff。 | 配套内容与确认规划一致，AI 不新增方向；反复生成不破坏已有编辑；不强制逐项审核或逐句引证；虚构来源与无效必需证据阻断，其余质量疑虑作提示。 |
| **6. 真实闭环与收敛** | 真实来源→AI→教师→发布→From Teachers 阅读，以及纯手工闭环；权限、历史、撤回、可访问性与运维复核。 | 模拟、真实采集、真实模型、真实 Supabase/RLS 与发布事务分别报告；经用户验收后再决定旧内部代码清理。 |

阶段顺序可根据风险调整，但不得把手工路径和 AI 路径建成两套草稿/发布模型，不得为过渡方便让新 Unit 依附旧完整 Graph payload，也不得把执行器日志当作产品记录。每阶段可回滚 UI 与新命令入口；对公开历史版本只能通过补充新版本或撤回说明纠错。

## 6. 验证策略与明确延期

- **契约测试**：v0.3 静态内容、旧 Graph API/深链/版本、七个跨模块 ID、当前账户与个人引用；把 `knowledge-map/curated.test.cjs` 明确纳入检查，且保持现有 `npm test` 通过。
- **领域测试**：两段 AI 生产、Direction 确认门禁、生成输入修订号、Proposal 合并不覆盖、草稿并发冲突、必需证据指针、混合已发布/同事务新发布 Graph Versions 的原子发布、固定引用、撤回 tombstone、频道精选独立性。
- **安全测试**：教师所有权、游客隔离、RLS、服务端凭据、URL 重定向和内网访问限制、文件数/大小/超时/费用限制、外部文本提示注入；测试实际数据库权限，不以 mock 代替。
- **体验测试**：教师分别完成 AI 辅助与手工 Unit；批量确认 Directions、只生成其中一个、离开后继续、局部重试、完整预览及发布。匿名读者从 From Teachers 找到 Unit、理解来源、进入固定 Direction，并能识别旧版与撤回。
- **延期**：文件上传、定时发现、持续来源监测、自动撤回、个性化推荐、关注教师、多教师协作、跨图谱自动合并及静态精选节点写入个人图谱。

## 7. 实施边界

用户已授权在 `feature/knowledge-map` 开发 v0.4。本计划保留目标架构与验收条件；实施中保护现有未提交修改及其他模块边界。远端数据库迁移、部署及正式发布仍须在代码与测试可审查后单独执行。

## 8. 技术依据

- 仓库当前实现：`api/knowledge.mjs`、`api/_knowledge-model.mjs`、`knowledge-map/teacher.js`、`knowledge-map/studio-ui.js`、`knowledge-map/network-core.js`、`knowledge-map/curated-*.js`、`supabase/migrations/20261021000100_knowledge_backend.sql`。
- 平台可行性核对：[Vercel Workflows](https://vercel.com/docs/workflows) 描述耐久的多步骤机器任务；[Vercel Queues](https://vercel.com/docs/queues) 描述后台消息与重试。两者均不能替代本产品的草稿、提案、确认和发布记录。
- 权限设计核对：[Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)；最终迁移方案须结合项目实际 Data API 暴露和角色策略验证。
