# KU-LMS 服务、会话、设置与后台审查（2026-09-30）

本文件前半部分记录初始只读源码检查与离线复现，不含本轮真实浏览器观察。修复阶段得到用户授权后修改了运行源码，修复记录见末尾。全过程未操作浏览器、未请求 LMS/大纲网站、未提交真实表单。发现位置的行号为初始审查版本、1-based。

代码 intelligence：Serena 已激活 `/home/hubery-fedora/Projects/KU-LMS` 并读 manual；GitNexus 绑定 `KU-LMS`，索引时间 `2026-09-30T13:26:21.610Z`，commit `f5c2219358be8ec116eb3e88b9adb8d6f238d7ee`。使用 query/context/trace 定位并以 Serena 符号实现校验；未将旧 artifacts 或历史文档当成本轮网页证据。

## 发现（持续更新）

### SVC-01：补充页面的 HTTP 错误/新式登录页面被当作成功文档缓存

- 状态：源码确认；服务器实际错误形态尚未在当前网页验证。
- 影响：中。首页消息可能显示为空，原生错误或掉线信息被隐藏；同页面再调用会读取错误缓存。
- 位置：`src/content/services/documents.js:9-23`，`src/content/runtime/boot-kulms.js:374-381`。
- 触发条件：fetch 返回 4xx/5xx HTML，或跟随重定向进入登录页，但 HTML 不含精确 `window.top.location.href="/webclass/login.php"` 字串。
- 证据：`loadSupplementalDocument` 在 `response.text()` 后仅匹配课程冲突句与上述单一脚本正则，然后无条件 DOMParser + cache.set；不检查 `response.ok`、`response.url` 或登录表单 DOM。`enrichHomeAsync` 成功分支继续 `parseMessagePreview`，无法区分真实空列表与错误文档。
- 建议：检查 HTTP 状态、最终 URL，并复用现有 auth-invalid DOM 判定；错误文档不得进入成功缓存。保留可见失败状态。
- 当前页面核验：只读查看已有登录/掉线 DOM 或网络响应即可，禁止专门退出或提交来制造条件。

### SVC-02：自动登录排队后关闭扩展仍会执行提交

- 状态：源码与离线 VM stub 复现确认。未真实提交。
- 影响：中。设置关闭或凭据修改与自动提交竞态，可能发生用户已关闭功能后的登录请求；改凭据还可能留下多个定时器。
- 位置：`src/content/hydrate/auth.js:113-127`，`src/content/hydrate/auth.js:141-157`，`src/content/runtime/boot-kulms.js:36-55`，`src/content/runtime/boot-kulms.js:134-140`。
- 触发条件：填表并登记尝试后，100ms 定时器执行前收到 enabled=false 设置事件或凭据变更。
- 证据：`fillAndMaybeSubmitLoginForm` 只在排队前检查 enabled，使用无保存 handle 的 `setTimeout(() => submitLoginForm(form), 100)`；`submitLoginForm` 无 enabled/页面生命周期/连接性复核；disabled 监听只执行 `releaseNative`，后者不取消定时器。
- 建议：将 timer 保存到 state；关闭/离页/凭据变更取消；提交前再验证 settings、route、表单连接与请求版本。
- 当前页面核验：不需要网页 DOM 即可验证竞态；可完全离线 stub 提交。
- 离线证据：排队 1 个 timer 后把 settings.enabled 改为 false，执行 timer，submit stub 仍调用 1 次。

### SVC-03：课程截止缓存没有用户隔离或采集时间

- 状态：潜在 bug；同标签换账号且课程 ID 重叠时可触发。是否存在真实换账号需求待确认。
- 影响：中。可能把旧账号的 usageCount/hasUsage 当作新账号状态，从首页待办中错误剔除或展示任务；缓存新鲜度无法传达。
- 位置：`src/content/services/cache.js:69-95`，`src/content/services/cache.js:111-130`，`src/content/runtime/constants.js:5`。
- 证据：缓存键固定为 `ku-redesign-course-upcoming-v1`，entry 以课程 URL 建键，只序列化课程/任务/利用状态；没有 user、collectedAt、expiresAt。源码搜索没有此键的退出清理逻辑。sessionStorage 在同标签内的导航/退出登录后通常仍保留。
- 建议：将缓存与可稳定识别的当前用户关联，退出/用户变更清理；保存 collectedAt 并显示/限制新鲜度。勿为确认风险而真实换账号。

### SVC-04：首页恢复采集时导航与消息 fetch 没有统一串行边界

- 状态：源码确认缺少串行保证，离线复现确认；本轮没有在服务器制造并发，是否触发强制登出未实测。
- 影响：高（潜在会话冲突）。违反用户要求的“LMS 不同时访问”风险，应优先核验设计。
- 位置：`src/content/runtime/boot-kulms.js:102-107`、`src/content/runtime/boot-kulms.js:374-400`、`src/content/services/refresh.js:84-93`、`src/content/services/all-upcoming.js:72-81`、`src/content/services/documents.js:8-14`。
- 触发条件：home init 读取到采集/刷新的 arming 状态；或消息请求未结束时启动采集。
- 证据：init 不 await `enrichHomeAsync`，随后继续刷新/全部近期作业状态机；home enrichment 内 loadSupplementalDocument 发消息请求，arming 状态机立即设置 location.href 进入课程。supplementalCache.queue 只串行此函数自己的 fetch，不覆盖原生导航。pagehide/beforeunload 才 abort（`boot-kulms.js:27-34,142-149`），不能当成服务器请求已经停止的证明。
- 离线证据：使用真实 init/enrich/refresh continuation/document-load 函数，fetch 永远 pending 且导航仅 stub；init 返回时记录 `["navigate:/course-A", "fetch-start"]`，证明调度没有等待请求完成。stub 不模拟原生 unload，故不据此断言实际浏览器必然并发或已登出。
- 建议：采集状态有效时跳过非必要 home enrichment；导航前用统一的 LMS 请求/导航调度器保证已有请求结束，且不要仅依赖 AbortController。禁止在审计中用真实并发请求验证。

### SVC-05：全部近期作业结果 view 被迟到的 home enrichment 覆盖

- 状态：源码与离线 VM stub 复现确认；未真实采集。
- 影响：高。结果页渲染抛 TypeError，页面可能停留在之前一次结果 HTML，后续交互使用错误 view。
- 位置：`src/content/runtime/boot-kulms.js:102-107,374-400`，`src/content/services/all-upcoming.js:88-103,296-319`，`src/content/render/home.js:92,97`。
- 触发条件：收集完成后返回普通 home，payload.phase 为 restoring-home 且过滤匹配；消息 enrichment 请求在结果页切换之后才完成。
- 证据：init 不 await enrichment。`presentAllUpcomingResults` 用 replaceState 切换 hash，写 currentRoute=home-all-upcoming、currentView=buildHomeAllUpcomingView；原 enrichment 最后无条件 `state.currentView = nextView; rerender()`，没有 route/请求版本检查。home nextView 只有 upcoming.items，没有结果页要求的顶层 items；renderAllUpcoming 直接读取 view.items.length。
- 离线证据：真实 enrichHomeAsync + presentAllUpcomingResults，延迟补充文档 promise，先切结果页再 resolve：第一次 rerender 为 `{route:"home-all-upcoming",viewKind:"results",items:1}`，第二次为 `{route:"home-all-upcoming",viewKind:"home",items:null}`。渲染源码随后读取不存在的 items.length。
- 建议：enrichment 写回前检查当前 route、view/请求版本和 enabled；采集返回首页时直接构建结果且不要启动无用 home enrichment。需有此跨异步阶段的回归测试。

### SVC-06：大纲解析缺少应用层超时与 iframe 失败清理

- 状态：源码确认鲁棒性缺口；本轮没有模拟真实网络故障。
- 影响：中。用户点大纲后可能长时间停在“…”或“シラバスを検索中…”；一个失败候选会阻塞后续同名候选检查。
- 位置：`src/content/services/syllabus.js:8-36,119-136,455-485`，`src/background/service-worker.js:69-93,158-162`。
- 触发条件：后台搜索/详情请求长时间 pending，sendMessage callback迟迟不回；或同名课程消歧 iframe 没有 onload。
- 证据：网络 fetch 不带 signal/超时；sendMessage promise 无超时。iframe promise 只有 onload，既无 onerror、timeout，也无导航/关闭 cleanup。handleSyllabusNavigation 在 await 完成前保持 loading=true；其 finally 无法处理永不 settle 的 promise。
- 建议：统一有限时长的失败返回，iframe 在所有终止路径移除；LMS 请求不应为提高可用性贸然自动并发或重试。
- 当前 DOM 核验：无需网页 DOM；可离线 pending promise / 无 onload stub 验证。

### SVC-07：唯一同名大纲直接采用，忽略已提供的课程代码

- 状态：潜在误匹配；源码确认分支，当前课程是否真的同名但代码不符未验证。
- 影响：中。可能导航错误大纲并把它写入以当前课程代码为键的缓存。
- 位置：`src/background/service-worker.js:51-67,146-156`，`src/content/services/syllabus.js:406-420,455-466`。
- 触发条件：搜索得到 1 个 exact title 匹配，但是该详情课程代码不等于 LMS 课程代码，例如当年课程改名、站点结果不完整或标题归一化碰撞。
- 证据：worker 与页面 resolver 都在 exactMatches.length===1 时立即返回/导航，不读取详情代码；resolveCandidateByCourseCode 对 candidates.length<2 直接返回空。调用方已传 deriveSyllabusCourseCode(courseHref)，但这个分支丢弃该约束。
- 建议：当已知课程代码时对唯一候选也验证；验证失败应保留搜索结果供用户选择。
- 当前 DOM 核验：安全情况下仅比对已打开课程的 code 与其已加载的大纲详情 code；不要新增不适配导航来验证。

### SVC-08：两项现有会话安全验证脚本已与当前代码脱节

- 状态：本轮离线运行确认。是验证工具问题，不据此认定扩展已回归。
- 影响：中。完整自动化校验无法通过，同时真正的 SVC-01/02/04/05 不被现有字符串检查覆盖。
- 位置与证据：`scripts/verify-home-refresh-login-loop-safety.mjs:67-77,125` 的 sandbox 缺 `buildAllUpcomingUrl`，renderHome 新调用触发 ReferenceError；`scripts/verify-deadlines-syllabus-session-safety.mjs:13` 静态要求 buildCourseMaterialsView 直接包含 shouldSuppressRefreshSideEffects，但当前 `boot-kulms.js:405` 调用 shouldSuppressCourseTraversalSideEffects，后者在 `refresh.js:263-265` 合并 refresh 和 all-upcoming 两种抑制。
- 建议：更新 helper/sandbox 依赖与组合抑制契约；为已确认异步竞态加入真正的延迟 promise 场景。不要仅依赖 includes/regex 当作执行验证。

## 可优化但本轮未见实际错误

- `documents.js:5-8` 只在入队前查 cache；同 URL 在第一次 fetch 完成前调用两次会排队重复 fetch，第二个任务不重新检查 cache。建议 in-flight URL 合并或在队列内复核。Serena references 未列出跨文件 enrichHomeAsync，而 GitNexus 与源码直接调用都有它，故未把 references 返回列表当作全量调用证据。
- `syllabus.js:20-27` 已读取 remembered detail，仍先完整网络 resolve，缓存只当网络失败后的回退。可采用 freshness 时间和缓存优先以减少等待；必须先解决 SVC-07 误匹配风险。
- `background/service-worker.js:29-49` 每标签最多 32 条大纲详情，但整个 Map 没有 tab removal cleanup；MV3 重启会清空，运行较久时仍可保留已关闭标签。属于低优先级内存管理优化。
- `timeline.js:6-16` 与后台大纲 fetch 同样没有 response.ok 判定；timeline 至少 JSON parse 失败会 error=true，但 JSON 错误体若无 records 会被当成成功空列表。建议检查 HTTP 状态与 JSON envelope。

## 离线复现结果

- `SVC-01`：HTTP 500 stub 两次加载只有 1 次 fetch，错误 HTML 留在 cache（1 entry）。
- `SVC-02`：禁用后定时提交 stub 仍被调用。
- `SVC-04`：pending fetch 与课程导航未有先完成后导航保证。
- `SVC-05`：结果页建立后，迟到 enrichment 将其覆盖为 home view，缺失顶层 items。
- 持久摘要：`artifacts/audit-2026-09-30/services-offline-summary.json`；前三项原始临时输出：`/tmp/ku-lms-services-audit-offline.json`。所有 fetch/submit/navigation 均 stub，无网络访问。

现有脚本：`verify-content-services-safety-contract`、`verify-extension-settings-autologin`、`verify-home-upcoming-session-safety` 通过；`verify-home-refresh-login-loop-safety`、`verify-deadlines-syllabus-session-safety` 失败原因见 SVC-08。旧 artifacts 没有被用来替代本轮执行结果。

## 待验证与范围限制

- 当前只审查源码；所有未有浏览器证据的发现不得写成“当前网站已发生”。
- 已检查服务 documents/cache/timeline/syllabus/refresh/all-upcoming、settings、popup、background 与必要 runtime/auth 调用点。未真实测试 LMS 请求并发、掉线、换账号、网络错误或作业/考试。

## 授权修复阶段（2026-10-01）

- SVC-01：补充文档与 timeline 共用串行请求入口，检查 HTTP/最终 URL/登录 DOM/登录脚本/课程冲突；错误不缓存，同 URL in-flight 合并；每个读取者获得独立 DOM clone。
- SVC-03：课程缓存为按当前网页用户隔离的 v2 envelope，记录采集时间，15 分钟 TTL；身份变化/明确 login/logout 清缓存及两种 collector 状态，未知身份不误删现有身份。首次识别身份即持久化，避免零任务时跨页丢失 collector。
- SVC-04 与 B13 协作部分：两个 collector 在导航/过滤提交前等待统一 LMS 屏障；失败、超时、abort 停止并显示原因。课与课之间、最终回首页均走当前课程的真实退出链接；缺失可信退出链接时不冒险跳转。首页迟到写回由 root 的 runtime 修复。
- SVC-06：后台大纲总查询 10 秒、单请求 8 秒期限；客户端 runtime message 与 iframe 有期限、取消、错误及清理路径；禁用/离页可取消。
- SVC-07：已知课程代码时，唯一同名候选也验证代码。大纲缓存先读 24 小时内 v2 条目；旧未验证缓存不再复用，关闭标签清后台 Map。
- 优化：timeline 拒绝错误 HTTP 与非 records-array JSON envelope；大纲 `ku-native=1` 保持原生，释放页面时恢复可访问状态并清 hydration observers。
- 新增 `scripts/verify-audit-services-regressions.mjs`：9 组行为回归通过，涵盖并发合并、HTTP/auth 错误、共享串行与导航等待、timeout fail-closed、timeline envelope、账号/TTL、原生课程退出、大纲候选代码、iframe/message 清理与 native bypass。所有网络、导航、iframe 都是 offline stub。
- 既有服务相关 7 项验证已按当前契约维护并全部通过：services-safety、deadlines-syllabus、home-upcoming、home-refresh-login-loop、home-all-upcoming、home-safe-refresh、review-followups。使用 `scripts/lib/offline-content-vm.mjs` 按 manifest 加载真实依赖但排除 main 启动入口；保留原来的解析、过滤、缓存、进度 overlay、过期状态、auth/冲突原因等覆盖，增加原生退出 → 首页 → 下一课的 async 状态验证、全部采集结束的结果路由验证，以及单一同名候选的真实编号匹配/错误不跳。review-followups 不再需要个人 `.omx/plans` 文件。

### SVC-09：修复期间新增发现——大纲 pending 导航没有时效

- 原始状态：源码确认潜在陈旧自动跳转风险；不是初始浏览器复现。
- 原因：pending 保存在 window.name，没有 createdAt/过期限制；未找到匹配而 unresolved 后还保留 pending，未来进入搜索页可能再次处理旧课程目标。
- 修复：写入 createdAt，5 分钟 TTL；拒绝无时间戳旧 payload、过期或未来时间戳，并清 pending。
- 验证：offline regression 覆盖 fresh pending、legacy rejection、expired rejection，未触发真实自动搜索。

### 自动登录模式的独立复核与用户纠正（2026-10-01）

- 独立查看 shared settings、popup、auth queue/submit 和 settings listener，未见此小改的阻断性问题；没有改运行源码。
- 用户随后明确：自动登录是预期功能，不希望关闭。此前临时改成默认 `autoLogin:false` 的方案已撤回，不能当成最终行为。现行默认 `autoLogin:true`，旧设置中缺失该字段时也保留自动登录；明确 false 或其他非布尔值则关闭提交但仍填充。排队和执行时均检查该模式、enabled、页面生命周期与 `kuAuditNoSubmit`；模式变化取消旧 timer、失效旧版本并重新填充。
- popup 的“自动提交登录”开关采用表单保存流程，勾选后需保存；“启用扩展”变化会同时保存当前表单值。此行为在独立 DOM 测试中已确认。
- `scripts/verify-audit-popup-regressions.mjs` 已按用户确认的最终行为更新，使用本地 linkedom 真实解析 DOM、合成凭据、stub storage/timers/form submission；8 组检查通过，覆盖旧设置默认自动登录（只调用 stub）、明确关闭仅填充、布尔值迁移、开启/关闭重排、重复 hydration、迟到 callback、audit guard、扩展关闭、popup init/save payload、密码显示与失败反馈不泄漏凭据，以及日文/英文标签去掉 sr-only/visually-hidden 后显示、禁用恢复原 class/style/for 关联。
- 输出只包含检查名称，未读取浏览器设置、未输出或保存真实凭据、未发真实请求、未进行真实自动提交。结果：`artifacts/audit-2026-09-30/popup-fixed-regressions.json`。
