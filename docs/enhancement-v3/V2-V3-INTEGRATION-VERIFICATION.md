# V2 页面接入 V3 发布课程

实验分支 `feature/v2-v3-integration` 从 `d5ef76b` 开始。Part 1、3、4 的模板和样式沿用 `feature/enhancement-v2` 的 `4e36360`，脚本接入发布案例、账号进度、阶段交接和验证服务。Part 2 继续用 Case Learning 页面，另有 AI Personalized Learning 补充练习入口。

## 本地预览

`npm run dev:native` 在 127.0.0.1:8767 启动独立的 PostgreSQL 和 Supabase Auth，应用此 worktree 的迁移并创建专用教师和学生账号。配置文件用 `SKILLLOOP_AUTH_BINARY` 指向 Supabase Auth 可执行文件，用 `SKILLLOOP_AUTH_MIGRATIONS` 指向同版本的 Auth 迁移目录。AI 使用正常的 `AI_*` 服务配置。启动时会在忽略的 `.env.native-accounts.json` 写入测试账号。数据库在预览会话内保留，停服清理后重新启动会创建新数据。

本机没有 Docker。验收使用内嵌 PostgreSQL 和官方 Supabase Auth v2.198.0 的本地 Windows 构建。构建时在临时源码中移除了 Linux 的 `SO_REUSEPORT` 设置。独立的数据库地址、Auth 地址和访问 Cookie 避免与现有预览共用账号会话。

默认验证器在独立 Node 进程的 QuickJS WASM 环境执行提交代码。来宾环境无网络、文件系统和凭据，执行限时 2 秒，外层进程限时 7 秒。可用 `SKILLLOOP_NATIVE_VERIFIER=vercel` 选择 Vercel Sandbox，配置为禁止网络访问的临时 VM。云端模式需要部署方的 Vercel 凭据，本次验收使用本地验证器。

## 验收记录

| 检查 | 实际结果 |
| --- | --- |
| `npm test` | 319 项通过 |
| M4、M5 和 v3 的既有 Chrome 回归 | 3 个端到端场景通过 |
| 原版四阶段 Chrome 端到端测试 | 两门课都从 V3 Studio 发布并走完原版学习路径，手写代码通过 8 项和 3 项登记测试。通过 Chrome 作答、Edge 登录恢复。测试使用真实本地 Supabase Auth 和固定模型响应。 |
| API 端到端测试 | 两门课通过账号隔离、修订冲突、课程发新版本后旧尝试恢复、失败反馈后恢复答案、Part 4 手写代码正确／错误／超时、拒绝客户端伪造判定和通过序列化冒充数值的代码。测试使用真实本地 Supabase Auth 和固定模型响应。 |
| 8767 真实模型验收 | Cart Checkout 和 Retry Queue 均由 V3 Teacher Studio 导入、生成笔记、匹配、审核并发布为第 1 版。在 Chrome 顺序完成四阶段，分别通过 8 项和 3 项服务端测试。在 Edge 登录后恢复手写代码和测试结果。完整浏览器场景耗时约 156 秒。 |
| AI Personalized Learning 补充入口 | 用 Cart Checkout 已保存的 Part 1 诊断生成实际练习，引用两条教师审核笔记，并保存作答与模型反馈。 |
| 静态资源构建和 `npm audit --omit=dev` | 构建通过，审计报告 0 项漏洞。 |

## 主要改动

- `enhancement-v3/web/app.js` 和 `api/courses.mjs` 提供统一的学习入口和账号进度 API。
- `shared/native-course.js` 把四阶段原版页面接入该课程版本的进度。Part 1、3、4 的样式文件保持与 V2 一致。
- `enhancement-v3/native/` 负责案例转换、个性化练习、阶段校验和可信验证。
- `supabase/migrations/20261116231059_native_course_progress.sql` 保存仅归属学生可访问的阶段记录。
- `scripts/dev-native.mjs` 启动隔离预览，`tests/enhancement-v3-native*` 覆盖新流程。

## 发布版本的正式学习路径

- V3 在发布课程时同时写入 `journey` 或 `native`。旧版本默认使用 Journey。开始、恢复、补充练习与阶段 API 都读取同一条发布版本记录。访问另一套阶段 API 会返回路径冲突。
- 8767 在暂停网页服务写入时核查现有进度。三个第 1 版发布课程均有原版四阶段记录，合计四次尝试。这三个版本已补记为 `native`。没有符合候选条件的 Journey 进度需要转换。原数据库、Auth 和学习记录保留，只重启网页服务。
- 独立 PostgreSQL 回归覆盖新版启用原版路径后旧版仍走 Journey、拒绝跨路径写入、路径不可修改，以及路径写入失败时回滚发布。三组 Chrome 回归通过，分别覆盖旧 Journey、V3 个性化和两门 V3 新课的原版四阶段。浏览器回归使用固定模型响应。
- 回填后用两个原有测试账号登录 8767。四次已通过的验证均可读取，Chrome 从课程详情恢复到 Part 4。强行用 Journey 地址打开原版课程时，页面显示返回同一版本课程详情的链接。全套 `npm test` 通过 318 项。
- `SKILLLOOP_NATIVE_COURSES` 决定符合条件的新发布版本采用哪条路径。`SKILLLOOP_COURSE_PUBLICATION_PAUSED=1` 暂停新发布，已发布课程仍按原路径恢复。当前原版流程在本机隔离环境验收。

## Part 2 恢复与 V3 界面统一

- Part 2 的 Priority topics 快捷栏位于进度条下。草稿和当前主题写入已有课程进度记录。已提交的答案、反馈和 Reflection 独立保存，更换卡组时按原卡组归档。
- V3 共用样式覆盖课程库、课程详情、My Learning、补充学习和 Teacher Studio。Teacher Studio 的四步向导使用原有上传、提取、匹配、审批和发布接口。
- 全套 Node 测试串行运行通过 319 项。更新后的进度 API 和两门课的 Chrome／Edge 回归通过，覆盖旧卡组归档、修订冲突、反馈失败及重新打开后区分草稿和已提交答案。
- 8767 用新版向导发布 Cart Checkout 测试课并走完四阶段，8 项登记测试通过。Part 1 动态出题超时后使用现有编写题库，诊断、练习反馈和 Reflection 使用真实模型。跨浏览器恢复最近主题、草稿、已提交答案和反馈，以及反馈进行中关闭标签页后保留已提交答案，均在 8767 验证通过。
- 检查了 Teacher Studio 桌面及 320／390 px 窄屏和 Part 2 移动端截图。HTTP 服务重载后确认原实验数据和已发布课程仍可读取。
