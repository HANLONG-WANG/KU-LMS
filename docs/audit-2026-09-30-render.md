# KU-LMS 只读源码审查：消息、通知、认证、手册、Syllabus

审查日期：2026-09-30。此文件持续补充；不修改扩展运行代码。证据来源为本轮源码、离线执行及主审查代理本轮采集的 `artifacts/audit-2026-09-30/`；历史 `artifacts/` 不作为当前网站证据。浏览器核验由主审查代理串行执行，本文明确区分已确认与待网页核验事项。

代码基线：GitNexus `KU-LMS`，索引时间 `2026-09-30T13:26:21.610Z`，提交 `f5c2219358be8ec116eb3e88b9adb8d6f238d7ee`，无索引落后提示；Serena TypeScript language server 已激活。使用 GitNexus query/context 和 Serena symbol bodies，图中普通对象字段偶有跨文件误归属，结论以具体实现核验为准。

## 已确认的源码问题

### R-01 通知详情重复显示字段名（低严重度，当前网页/离线确认）

- 位置：`src/content/render/notifications.js:42`、`:43`、`:44`；上游解析 `src/content/parsers/notifications.js:36`、`:37`、`:39`。
- 触发条件：原生详情 metadata 是 `発行元: Faculty`、`発行日: 2026-09-30`、`発行先: Students` 这种带标签的文本。
- 实现证据：render 正则 literal 中使用 `\\s`，因此匹配字面反斜杠和字母 s，而不是空白；上游保留字段名全文。输出固定 `<span>発行元</span>` 后，`<strong>` 仍包含 `発行元: ...`。
- 本轮离线执行：用 Node VM 加载当前 `render/notifications.js`，调用真实 `renderNotificationDetail`，三个输出断言 `issuerRepeated`、`publishedAtRepeated`、`audienceRepeated` 均为 `true`。
- 影响：通知详情元数据展示冗余、不自然；不影响正文或链接。
- 修正方向：使用单反斜杠的空白匹配，并兼容原生实际冒号样式；修改前应先核验当前详情原生 DOM。
- 本轮当前网页确认：`artifacts/audit-2026-09-30/ku-lms-notice-detail-evidence.json` 的 post74674 原生 metadata 分别为 `発行元 : システム管理者`、`発行日 : 2026/09/14 00:00 by ...`、`発行先 : observer, author, user, guest`，改版 extText 均展示独立标签后再重复带前缀全文。

### R-02 消息搜索结果全选会选中隐藏消息（中严重度，源码/离线确认）

- 位置：`src/content/render/messages.js:8`、`:32`、`:40`；`src/content/hydrate/shared.js:45`、`:49`、`:114`。
- 触发条件：当前页有多条消息，搜索使部分行不可见，点击表头「全选」。
- 实现证据：表头是否全选使用 `filteredRows`，而 `message-select-all` handler 直接遍历 `view.rows`，将搜索隐藏行一起加入 selection；`syncNativeMessageSelection` 将这些隐藏行同步到原生表单。
- 本轮离线执行：Node VM 加载真实 `hydrate/shared.js`，构造包含 `visible(match)` 和 `hidden(other)` 的两行视图，执行注册的真实全选 handler，输出 `visibleRows: 1`、`selected: [visible, hidden]`、`nativeHiddenChecked: true`。
- 影响：点击删除、恢复等原生 action 时会操作用户当前没有看到的消息。审查仅离线执行全选，未触发任何真实 action。
- 修正方向：让筛选、表头选中状态、全选 handler 共用同一可见行集合；搜索变化后应清楚展示跨筛选保留的 selection 或清除它。
- 网页核验建议：搜索少量结果、全选、检查「選択中」数量和可见行数；取消后不要执行 action。

### R-03 搜索每次输入重建页面并失去焦点（中严重度，源码与当前主页确认）

- 位置：`src/content/hydrate/shared.js:4`、`:16`；`src/content/runtime/boot-kulms.js:113`、`:119`。
- 实现证据：首页和消息搜索 `input` 事件调用 `rerender()`；其 `root.innerHTML = ...` 删除当前聚焦 input 并生成新 input，没有保存/恢复焦点、光标或 composition 状态。
- 触发条件：在首页课程搜索或消息搜索连续键入/中文或日文输入法合成。
- 影响：每次字符输入使当前输入节点脱离 DOM，焦点和光标不再持续，IME 合成也可能中断；首次输入后通常必须再次点搜索框。
- 修正方向：只更新搜索结果区域，或保留原 input DOM；若必须重建，需处理 focus、selection 和 composition lifecycle。
- 主报告 B06 在当前主页输入“外”字，确认 activeElement 变成 BODY、新搜索框 focused=false；消息搜索同一代码路径尚未在非空列表下实测。

### R-04 Syllabus「原本」按钮打开同一个改版页面（低严重度，源码确定，点击未执行）

- 位置：`src/content/parsers/syllabus.js:55`；`src/content/render/syllabus.js:13`；`src/content/services/syllabus.js:317`。
- 实现证据：`sourceHref` 原样取 `window.location.href`，render 的「公開シラバス原本」按钮打开该 URL 新 tab，没有任何改版绕过参数；同一扩展会再次对该 URL 执行 `initSyllabusDetailRedesign`。
- 影响：名为原本的按钮没有提供原生网页，反而重复打开改版页。实际行为还需考虑用户浏览器此扩展的站点权限，但代码没有 original-view 路径。
- 修正方向：按钮切换同 tab 原生视图，或让显式 original-view 状态能够被 boot 识别。

### R-05 通知发布日期错误显示为公开期限或整段元信息（中严重度，当前网页与离线确认）

- 位置：`src/content/utils/core.js:102`–`:105` 的 `extractPublishDate`；`src/content/render/notifications.js:12` 调用；上游 `src/content/parsers/notifications.js:8` 保留整个 exhibitionInfo。
- 本轮网页证据：`artifacts/audit-2026-09-30/ku-lms-notifications-evidence.json`，页面 `/webclass/information.php/`，9条通知和9条改版 row，未漏条目。
- 触发条件：发布日期只有年月日，公开期限带时分，或发布日期只有年月日且没有公开期限。
- 根因：正则只接受 `yyyy/MM/dd HH:mm`，扫描整个 source，没有区分发布日期与公开期限；匹配不到则回传完整 source。
- 当前已发生：post74672 原生 `システム管理者 - 2026/09/14 - 公開期限 : 2027/03/21 23:59`，UI 右侧日期是 `2027/03/21 23:59`；post74676、74685、74673、74688 同类错误。post9237 原生 `システム管理者 - 2020/07/22`，UI 日期区重复完整 `システム管理者 - 2020/07/22`；post5104 同类。发布日期本身含时分的 post74674/51362 本轮显示正确。
- 本轮离线执行真实 `extractPublishDate`：上述三个代表 source 依次输出 `2027/03/21 23:59`、`システム管理者 - 2020/07/22`、`2026/09/28 14:38`，与网页相符。
- 影响：将未来公开截止时间当发布时间，时间语义错误；date-only无期限行展示冗余。
- 修正方向：parser 将 issuer、publishedAt、deadline 分离后 render；发布日期时间部分可选，不能从公开期限段取得。
- 其他调用：GitNexus context 显示 `parseLoginNotices` 也调用此 helper；Serena references 为空，已直接核验源码调用，不能当作没有调用者。

### R-06 通知重要性不遵从原生 mark1 标记（低严重度，当前网页确认）

- 位置：`src/content/parsers/notifications.js:15`；`src/content/render/notifications.js:12`。
- 源码确定事实：只有标题匹配 `重要|最新版|中間テスト|注意` 才标 `important`；render 对其余每行固定输出蓝色 `お知らせ` chip，没有读取原生重要属性或标记。
- 当前证据：本轮 `ku-lms-notifications-evidence.json` 原生 a.title.mark1 与改版 chip 对照，9条中3条不一致。
- 已漏标：post74688「【学生の皆さんへ】メールで質問する前に、必ず確認してください。」原生 `class="title mark1"`，改版普通「お知らせ」。
- 已误标：post74673「【最新版】【学生の皆さんへ】テスト教材を受ける際の注意点」和 post5104「【学生の皆さんへ】 [回答を保存する] ボタンを押す時はご注意ください。」原生 `class="title"`，改版「重要」。
- 影响：改版覆盖了系统提供的通知优先级，用户看到的重点与原站不一致。启发式是否值得保留属于产品选择，但当前不能将其等同于原生重要性。
- 修正方向：优先读取 `.mark1`；若还需要标题启发式，应采用不同的含义和视觉标记。

### R-07 通知详情丢失更新日期（低严重度，当前网页确认）

- 位置：`src/content/parsers/notifications.js:36`–`:40`、`:49`–`:56`；`src/content/render/notifications.js:41`–`:46`。
- 当前证据：post74674 原生 metadata 有 `更新日 : 2026/09/28 14:38 by ...`；改版 extText 完全没有更新日，仍仅展示 `発行日 : 2026/09/14 00:00 by ...`。证据文件同 R-01。
- 根因：parser 只构造 issuer、publishedAt、deadline、audience 和单个 author，未读取更新日；render 也无对应字段。
- 影响：用户看不到通知最新修订时间。列表日期展示 `2026/09/28 14:38`，详情却只有 `2026/09/14 00:00`，跨视图时间含义不清。
- 修正方向：独立保留 publishedAt、updatedAt 及各自作者，列表明确其日期是发布或更新。

### R-08 手册改版丢失全部原生正文和两个 PDF 链接（中严重度，当前网页确认）

- 位置：`src/content/parsers/manual.js:4`；`src/content/runtime/boot-kulms.js:18`、`:90`–`:97`、`:124`–`:131`、`:184`–`:186`、`:437`–`:445`；`src/content/render/shared.js:38`。
- 当前证据：`artifacts/audit-2026-09-30/ku-lms-manual-evidence.json`，`/webclass/user.php/manual` 原生存在5组标题/正文（教材执行警告、环境要求、浏览器、移动设备、手册模板）及两个 PDF；改版只有「クイックアクセス」与通知/消息/账号设置，原内容全缺失。
- 根因链：document_start 的 boot 先调用 `mountBootShell → ensureRoot`，body 尚不存在时 root 挂在 documentElement（正文之前）。DOMContentLoaded 后 init 在 buildView 之前又将 root 填入 loading shell `<main class="ku-page">`；manual parser 使用 `doc.querySelector('main') || doc.body`，没有排除扩展 root，选到了最先出现的扩展 main。该 loading main 无 h2/h3/h4；parser 返回[]，`buildManualView` 改用 `parseHomeHelpSections` quick links。不是原生缺少 main 或标题级别变更。
- 本轮当前 DOM 完成核验：`ku-lms-manual-main-evidence.json` 按文档顺序列出2个 main，首个是扩展 `.ku-page`，第二个是原生 `main#js-main`；5个原生标题分别为 H2/H3/H4/H4/H2，全部位于 `#js-main`。主审查代理同时确认扩展 root 的 parent 是 HTML、位于 body 前。
- 本轮离线执行真实 parser：合成原生 heading/P 时返回原生 section；让 doc.querySelector('main') 指向零 headings 的扩展 main 后返回[]，与当前实际错选容器相符。
- 影响：安全使用提示、支持环境和手册下载入口被完全遮蔽；账号设置入口被带入手册页但它不在扩展适配路由，本轮未进入。
- 修正方向：解析前保留原生 snapshot，或选择排除扩展 root 的原生容器；不应将原生手册解析失败静默伪装成完整利用指南，应退回原生或明确失败状态。

## 待当前网页核验的疑点

### R-P02 Syllabus 正文链接、图片、表格和富格式被压成纯文本

- 位置：`src/content/parsers/syllabus.js:156`–`:172`；`src/content/render/syllabus.js:50`。
- 源码确定事实：正文只保留 `clone.textContent`；render 只 escape 文本并把换行替为 `<br>`。`a[href]` 的目标、`img` 的内容和表格列结构均不在 view 中。
- 潜在影响：若当前 syllabus 的参考资料、教材、相关 URL、公式或图片采用这些节点，它们会丢失链接/视觉内容；`math`、`svg` 更直接删去，文字替代也未保留。
- 当前网页待核验：`.tableblock05 a[href]`、`img`、`table`、`math`、`svg` 数量及改版对应正文。没有这些内容的课程不能证明其他课程安全。

### R-P03 手册解析主动截断说明、丢失直接 sibling 链接

- 位置：`src/content/parsers/manual.js:17`、`:18`、`:31`。
- 源码确定事实：每个标题最多保留 3 段纯文本；只查询 sibling 的后代 `a[href]`，不检查 sibling 自身是否为 anchor；带 anchor 的段落不进入 description；同名标题不保留第二个 section。
- 潜在影响：新版手册增加第 4 段说明会静默丢失；`<h3>...</h3><a href=...>...</a>` 变为不可点击说明文本，链接 target 丢失；含链接段落的周边说明可能不完整。
- 本轮离线执行：Node VM 加载真实 parser，构造 heading 后直接 sibling A，实际输出 `description: [Direct PDF], links: []`；构造4个独立 P，实际只保留 `Paragraph 1/2/3`。这确认算法行为，是否当前手册受影响仍待网页核验。
- 当前网页待核验：适配 manual 页 h2/h3/h4 后的实际 sibling 结构，原生段落/链接数和渲染数量对照。

### R-P04 邮件转发 email 输入没有实际原生格式校验

- 位置：`src/content/render/messages.js:217`；`src/content/hydrate/shared.js:122`–`:131`。
- 源码确定事实：改版 `type=email` input 不在 form 内，触发按钮不会调用它的 `reportValidity/checkValidity`；handler 无条件把值拷贝给原生 input 并 native click/submit。
- 潜在影响：看上去有 email 校验的控件仍可将非法邮箱或空值提交给原生表单。原生是否会拦截取决于它的类型和脚本。
- 不通过实际转发核验；可只检查原生 forward form 类型/required/onclick 和离线 mock。
- 当前匿名 DOM 证据 `ku-lms-message-detail-evidence.json`：扩展 email input 不在 form；原生 f_address 为 text、无 required/pattern/onclick，form 无 onsubmit。未实际转发，服务器校验仍未知。

### R-P05 登录通告同步最多 6 秒、只比较数量，不支持内容更新

- 位置：`src/content/hydrate/auth.js:54`–`:79`。
- 源码确定事实：初始 notices 非空则不再同步；初始为空时每 300ms 重试最多20次；只比较 items.length 和 moreHref，不比较标题、meta、URL。
- 潜在影响：慢网络超过6秒的 Ajax 通告永久显示「まだ読み込まれていません」；相同数量内容更新不会 rerender；「无通告」与「加载中」没有终态区别。
- 当前登录页面未浏览，避免已保存凭据触发 `fillAndMaybeSubmitLoginForm` 真实登录。该函数只需 `enabled`+用户名+密码便安排100ms后提交。

### R-P06 消息分页/排序依赖页面世界 JavaScript，需检查隔离世界与 CSP

- 位置：`manifest.json:28` 起的 LMS content_scripts（没有 `world: MAIN`）；`src/content/render/messages.js:47`；`src/content/render/shared.js:120`；`src/content/hydrate/shared.js:86`–`:98`。
- 源码确定事实：原生排序/分页 href 放在 `data-message-js`，控件 href 改为 `#`。handler 尝试访问 `window.sortMessageListTable`、`window.changePage`；不可用时再把原 href 写入 `window.location.href`，包括 `javascript:` scheme。
- 潜在影响：内容脚本隔离世界通常无法读页面原生函数，fallback JavaScript URL 的可执行性还受页面 CSP/浏览器规则影响，可能表现为按钮点击无响应。
- 当前浏览器待核验：原生 href、原生函数定义、CSP、console 错误。因为原生排序/分页可能提交查询表单，本次用户禁止真实表单提交，未建议实际触发。

## 本轮离线检查与测试维护

- `node scripts/verify-content-render-hydrate-contract.mjs`：通过，检查 render/hydrate 集群和 selectors contract。
- `node scripts/verify-syllabus-detail-redesign.mjs`：通过，主要静态 contract；历史 fixtures 仅作为该脚本自身输入，未作为当前网站证据。
- `node scripts/verify-login-page-redesign.mjs`：失败于启动，缺 `.omx/plans/prd-ku-lms-login-page-redesign.md`（ENOENT）。
- `node scripts/verify-logout-page-redesign.mjs`：失败于启动，缺 `.omx/plans/prd-ku-lms-logout-page-redesign.md`（ENOENT）。
- 上述缺文件属于测试可复现性问题：checkout 没有个人 `.omx` 计划，校验脚本在进入实际断言前就失败。建议将必要 contract 迁入仓库内 fixture/schema 或移除不影响运行的私有计划依赖。
- 三个专门的本轮 Node VM 复现不依赖历史网页：R-01 标签重复、R-02 隐藏行被全选、R-P03 手册链接/段落丢失。

## 覆盖与限制

- 已通过结构化工具核验：messages list/detail parser/render 与 shared hydrate；notifications list/detail parser/render；manual parser/render；auth parser/render/hydrate；syllabus parser/render/hydrate 和初始化入口。
- 核验关系：GitNexus trace `buildView → buildLoginView → parseLoginView → parseLoginLanguageOptions`；`initSyllabusDetailRedesign → parseSyllabusDetailDocument → parseSyllabusSections → parseSyllabusSection → sanitizeSyllabusBodyText`；context 核验消息选择、通知和手册调用入口；Serena references 核验 `syncLoginNotices → hydrateRouteDom`。
- Serena 对 `parseManualSections` 返回空 references，但 GitNexus 和源码均存在 `buildManualView` 调用；这些脚本共用全局函数，language server references 不完整，未将空结果当作未使用。
- 主审查代理本轮 inbox 原生为0条；此前首页 preview 有4条，进入课程再返回后 preview 为0。当前没有足够证据区分原站课程上下文、邮箱状态变化、缓存或会话原因，不能将其写为扩展漏解析消息或会话根因。需未来在相同上下文的原生DOM/UI/API证据对照，且保持LMS单页访问。
- 未操作浏览器、未联网、未提交表单、未进入作业/考试。

## 获授权后的修复与离线验证

以下为本轮审查后用户授权的源码修复；前文行号和网页证据对应审查时基线，历史发现未覆盖或删除。

- R-01/R-07：通知 parser 分离字段值、读取更新日；render 保留更新日并正确移除前缀。
- R-05/R-06：列表将 source 分为原生日期段和公开期限段，显式日期不从 expiry 取值；重要性遵循原生 `.mark1`。共用日期 helper 由课程修复代理更新。
- R-02/R-03：消息和首页搜索只更新结果区域，保留原 input DOM 和输入法合成；全选操作与表头共用可见行集合，搜索变化清除隐藏行 selection 并同步原生表单。
- R-04/R-P02：大纲原本链接添加统一 `ku-native=1`，services 负责绕过改版；新增 HTML allowlist sanitizer 保留安全链接、图片、表格、MathML、SVG基础形状，移除脚本、事件属性、危险URL和嵌入控件，保留相对URL语义。
- R-P04：转发 email required/checkValidity/reportValidity 阻止空值和格式错误；正常值沿用原生按钮和原生校验，不使用绕过校验的裸 submit fallback。
- R-P06：分页/排序点击对应原生 anchor，通过 DOM 委托进入页面世界；不再读取隔离世界的页面函数，也不写入 JavaScript URL 执行。
- 新增真实课程折叠、ARIA 状态和目录随滚动高亮；目录 hydration 返回 cleanup，释放旧 observer、scroll/resize 和 click listeners。
- 普通适配 LMS GET 导航等待 services 提供的 request barrier；失败禁止导航并提示重载，连续点击不并发；等待过程中 enrichment 重建 DOM 时重放同 href/target 的现存链接。原生执行型链接不改其 target/onclick 语义。
- 原生 click/validation 通过 root 提供的 `withNativeInteraction` 同步委托，在原生 inert 策略下保留功能。

验证文件：`scripts/verify-audit-render-regressions.mjs`，9组行为检查全部通过，涵盖通知日期/标记/更新、消息筛选/IME/全选、转发校验、页面世界分页委托、折叠、目录滚动与 cleanup、导航请求屏障和富正文清洗。测试没有真实浏览器、网络请求或表单提交。

同一测试使用 HEAD 源码副本运行时失败于 `publishedAt: undefined` 而预期 `2026/09/14`，证实能够区分旧版问题。当前源码 syntax checks 和所修改文件的 `git diff --check` 通过；原有 render/hydrate contract 通过。旧 syllabus detail 静态检查要求目录逻辑仍在 hydrateSyllabusDetail 内，现已提取为共用 helper，需由主代理统一更新该陈旧断言；原有缺 `.omx` 文件的问题亦交主代理统一修复。

编辑前 GitNexus 风险：共享 `bindInteractiveHandlers` 和详情 render 为 CRITICAL，通知列表/主render/原生委托/大纲render/hydrate 为 HIGH；已向主代理报告直接调用者和共享 boot/rerender 影响。保留既有函数入口和 view 字段兼容性，新增行为检查后由主代理统一执行 graph detect_changes 和索引刷新。

### 修复后的独立集成复核（2026-10-01）

新增 `scripts/verify-audit-integration.mjs`，使用已安装 LinkeDOM 载入 manifest 的真实 runtime 脚本顺序；默认 fetch 直接报错，仅请求队列场景使用本地 deferred response stub，没有网络或浏览器操作。9组跨模块检查通过：提前root搬入body且手册完整、原生inert消息proxy、原生消息autochecker与筛选header分离、非首页BFCache hydration恢复、原生登录form搬移/复原和相同数量Ajax通告变化、通知每行日期/期限各展示一次、富DOM序列化后二次解析安全性、请求队列覆盖body完成/HTTP失败、原生课程退出GET等待屏障。

复核发现并已交相应代理修复：

- pagehide清理目录/导航/登录通告后，原本pageshow只恢复home，其他适配页的临时listeners未复原。主代理已扩展BFCache重绑，当前集成测试通过。
- 手册新富DOM清洗先拒绝raw `javascript:`，再URL规范化，`java&#10;script:...`因此变成可执行URL；真实DOM复现输出已发课程代理。现已改为规范化后protocol allowlist，links payload和bodyHTML均通过集成回归。

当前逐字核验 `course-return` 路由为 `supported: true`，boot对此路由释放原生页面；导航屏障对该GET入口同样等待。没有把释放原生页面等同于不支持路由。

原生消息master补测：3条原生消息、筛选仅可见1条时，改版header显示已全选，而原生autochecker保持false；解除筛选全选3条才为true，取消恢复全部false。`syncNativeMessageSelection(view)` 已使用明确传入view对应的selection，不隐式依赖 `state.currentView`。曾有LSP未声明告警，但GitNexus、Serena和源码均确认 `utils/core.js` 的全局 `allSelected` 存在且被manifest按序载入，因此未将其误记为运行时ReferenceError。

现场修复复核后的通知去重：parser追加独立issuer，保留完整source兼容数据；列表副标题优先显示issuer，右栏保留原生日期与期限，避免重复。空白包围的hyphen作为字段分隔，不拆分课程名括号中的 `2026-秋-火-1限-01739`。新增LinkeDOM真实init/render回归确认每行发布日/公开期限分别只出现一次，并保留完整source。
