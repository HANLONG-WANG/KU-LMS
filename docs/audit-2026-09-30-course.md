# KU-LMS 首页、课程与运行时只读审查（2026-09-30）

此文件为并行审查记录；本审查者没有打开浏览器或发起 LMS 网络请求，没有改动运行代码。实时证据由主审查者在唯一 LMS 标签页取得。历史 fixture 仅可辅助理解旧实现，不能证明当前网站结构。

## 范围与证据方法

- GitNexus 绑定 `KU-LMS`，索引时间 `2026-09-30T13:26:21.610Z`、commit `f5c2219358be8ec116eb3e88b9adb8d6f238d7ee`；context 未提示落后或 incomplete reasons。
- 已激活 Serena 项目并读取 Instructions Manual；通过 symbol overview/find_symbol 检查定义。GitNexus query/context/trace 对照跨文件流程。
- 已见静态分析不一致：Serena `find_referencing_symbols(parseUpcomingFromCourse)` 返回 `{}`，但 GitNexus/直接源代码显示 `boot-kulms.js:404`、`services/all-upcoming.js:149` 的调用。项目使用 manifest 顺序加载的全局 JS；空引用结果不能代表无人调用。
- 本文件行号使用从 1 开始的源代码行号。

## 浏览器允许的适配范围

`src/content/runtime/routes.js:3-23` 支持首页 `/webclass/`、`index.php`（以及扩展 all-upcoming hash）；login/logout；`course.php/<id>` 或 `<id>/login` 教材页；`<id>/scores`；`<id>/my-reports`；通知列表 information.php（含 /mbl）与 post 详情；消息 inbox/outbox/recyclebox、msg_viewer；`user.php/manual`。材料执行、作业提交与考试路由没有适配，不应进入。

## 已有实时证据的问题

### C01 / 主报告 B01：其他课程消失（严重度：高，现象及 DOM 根因已确认）

- 实时证据：`artifacts/audit-2026-09-30/home-dom-evidence.json` 显示原生主页有 4 个 `.course-title a`，扩展空搜索下仍显示「一致するコースがありません。」。
- 相关流程：`buildHomeView` → `parseOtherCourses` → `renderHome` → `filterOtherCourses`；GitNexus context 确认 parser 是首页 builder 调用。
- `src/content/parsers/course.js:5-8` 只从 `.courseTree-levelTitle` 开始，并使用 `titleEl.nextElementSibling?.querySelector('.courseList') || titleEl.parentElement?.querySelector('.courseList')`。`querySelector` 不包含元素自身：若 next sibling 本身就是 `.courseList`，第一候选会漏；当前标题类名/容器层级也需对照实时 DOM。
- 这段 parser 没有根据课程 ID 是否纯数字过滤；`filterOtherCourses` 在空搜索时原样返回 groups（`src/content/utils/core.js:126-133`）。非数字 ID 不是已证明的直接原因。
- 主审查者后续实时核验：`.courseTree-levelTitle` 数量为 0；唯一 `ul.courseTree.courseList` 含 4 个课程 anchor，结构是 `li > .course-data-box-normal > .course-title > a`。因此旧标题 selector 没有启动扫描，直接丢掉全部其他课程。

### C02 / 主报告 B02：隐藏原生页面仍暴露给辅助访问（严重度：中，实时属性已确认）

- `src/content/critical.css:31-36` 对原生 body 子节点仅设置 `opacity:0 !important`、`pointer-events:none !important`；未设置隐藏辅助访问树或阻止键盘聚焦的属性。
- `src/content/runtime/boot-kulms.js:124-132` 的 `ensureRoot` 将扩展根节点追加到 `(document.body || document.documentElement)`；document_start 时可能尚无 body，主审查者实时确认此页 root 的 parent 为 HTML。`releaseNative`（134-140）只是移除状态与根节点。
- 实时 evidence 显示原生 HEADER 的 35 个和 MAIN 的 59 个可聚焦元素仍留在页面；`ariaHidden:null`、`inert:false`，原生快照包含重复界面。由此可判断存在屏幕阅读重复读取和 Tab 移入不可见原生操作的风险；未进行提交操作验证。
- 建议后续修复须同时保留原生 form 代理需求及禁用扩展后的恢复，不宜仅删除原生 DOM。

### C11：课程名误用为登录用户名（严重度：中，实时现象与根因已确认）

- 主审查者当前访问适配课程 `26170478`：扩展顶部用户与头像显示「サウンド知覚情報処理」「サ」，原生账户菜单仍是实际用户姓名。
- `src/content/parsers/shared.js:42-46` 的 `parseUserName` 全页扫描 `a, span`，把第一个「含空白与汉字且不含若干排除词」的文本当用户名；没有绑定账户菜单结构。课程品牌标题符合这条宽泛规则。
- `src/content/runtime/boot-kulms.js:207-210` 针对 course routes 再调用 `shortenCourseTitle(rawUserName)`，进一步把误选标题的课程元信息去掉；`render/shared.js:58` 直接显示该值和首字头像。
- GitNexus context/trace 确认 `collectContext → parseUserName`；Serena 定义核验一致，但其 references 为空，不能据此排除调用。
- 建议读取当前原生账户菜单的具体节点，课程标题仅用于课程 header；不要在用户名流程执行课程标题归一化。

### C12：课程代码误标为教室（严重度：中，实时现象与根因已确认）

- 当前课程原生标题末尾为 `(2026-秋学期-水曜日-3限-70478)`，扩展显示「教室:70478」；主审查者确认该末尾数字是课程 code，当前标题没有教室信息。
- `src/content/parsers/course.js:47-58` 将括号元信息第 5 段数字赋给 `room`；`src/content/render/shared.js:167` 硬编码「教室:」。此流程完全没有从教室字段提取数据。
- 建议将该段映射为课程代码；教室只在实际开讲信息来源有明确教室字段时显示。

### C13：小屏首页布局整体溢出且导航逐字换行（严重度：中，实时现象与 CSS 根因已确认）

- 主审查者 390px viewport 当前测得 rootWidth 864、home-main 840；时间表缺少受限宽度的局部滚动 wrapper。顶部导航逐字竖排，手册截断。
- `critical.css:2282-2303` 的 <=1180 断点将首页 grid 设为 `1fr`；`529-536` 的 `.ku-home-main` 未设 `min-width:0`。`2335-2338` 的 <=900 断点将时间表设为 `84px repeat(6,minmax(120px,1fr))`，产生 804px 最小轨道宽度，并仅在 grid 本身设 `overflow-x:auto`。
- `critical.css:121-125` `.ku-topnav` 为单行 flex、gap 28px；`141-154` `.ku-toplink` 没有 nowrap，而 <=1180 只在 topbar 自身开启 wrap。窄屏链接文字可被挤到逐字折行。
- 建议把时间表的横向滚动限制在可收缩容器中，首页 grid item 明确允许收缩；导航采用有明确窄屏布局的排列。

## 代码确认、待实时复现的问题

### C03：搜索输入每次重建整个扩展 DOM，丢失焦点（严重度：中，代码路径已确认）

- `src/content/hydrate/shared.js:4-8` 首页搜索、`16-20` 消息搜索的 input handler 更新 state 后调用 `rerender()`。
- `src/content/runtime/boot-kulms.js:113-121` 用 `root.innerHTML = ...` 整体替换 DOM。旧 input 被移除，新 input 没有焦点/caret 恢复逻辑；连续输入、IME 合成、屏幕阅读定位可能中断。
- 安全复现：在首页「その他のコース」搜索框键入两字符，观察 activeElement 与 caret；不需要网络或表单提交。
- 可优化为局部更新列表，或显式保留焦点、selection 与 composition 生命周期；不建议仅为每个输入恢复末尾 caret。

### C04：「週表示」是无行为的按钮（严重度：低，代码已确认）

- `src/content/render/home.js:60` 渲染 `<button class="ku-button">…週表示</button>`，没有 data-action；`hydrate/shared.js:3-71` 没有匹配该按钮的 handler。
- 相邻「今日/前周/后周」均有 data-action handler，因此此按钮看起来可操作但不能切换视图。需浏览器确认用户可见表现。

### C14：禁用扩展后未完成的首页加载会重新挂载 UI（严重度：中，实际函数离线复现）

- `boot-kulms.js:36-54` 的设置 listener 在禁用时调用 `releaseNative`（134-140），但未撤销异步页面任务或使现有任务失效。
- `enrichHomeAsync`（374-400）等待加载后无条件写 `state.currentView` 并 `rerender()`；`rerender`（113-122）没有 enabled / generation / page-leaving 检查，且 `ensureRoot`（124-132）在 root 缺失时重新创建。
- 离线使用真实四个函数与 deferred Promise stub：禁用后 root=false、state 属性已删除；消息 Promise 完成后 root=true、enabled=false、state 属性仍缺失。证据 `artifacts/audit-2026-09-30/course-runtime-disable-race.json`。没有浏览器或真实网络请求，不称为本次网页已复现。
- GitNexus trace 确认 `enrichHomeAsync → rerender → ensureRoot`；定义经 Serena 核验。
- 同类待处理的 `init/buildView` 完成也需要检查生命周期。建议有统一页面任务 generation / enabled guard，禁用时中止请求并让已有结果失效。

### C15：课程章节箭头与右侧导航存在无效反馈（严重度：低，代码已确认）

- `render/course.js:19` 使用 `.ku-collapse-head` 的 div 和向上箭头；`critical.css:1065-1076` 设 `cursor:pointer`。全仓源代码搜索没有课程 collapse handler，也不是原生 details/summary，故视觉上可折叠但点击不会折叠。
- `render/course.js:32` 仅初始第一个右导航项加 active；`hydrate/shared.js:62-66` 点击仅 scrollIntoView，没有更改 active 或绑定 scroll observer。后续章节导航仍显示首项选中。
- syllabus 有其独立 IntersectionObserver（`hydrate/syllabus.js`），但该脚本不在 KU-LMS content-script 清单内，不能认为它补足课程导航。
- 可在课程页安全点击章节 header 与右导航核验，不需要打开材料或提交。

### C16：现有源码契约测试会固化用户名错误（验证改进，代码已确认）

- `scripts/verify-course-title-syllabus-normalization.mjs:17` 断言 `collectContext` 源码必须包含 `shortenCourseTitle(rawUserName)`，断言描述明确要求课程页 topbar identity 使用归一化后的课程标题。这与 C11 当前应展示账户姓名的行为冲突；修复时该验收要求也需纠正。
- `scripts/verify-content-parsers-contract.mjs:12` 只断言 `parseSchedule` 源码含 rowIndex 时限推导，不能验证真实表格中多个课程/标题行/列偏移的处理。
- 建议后续将关键契约改为离线当前 DOM 摘要驱动的行为检查（账户菜单与课程品牌同时出现、无 `.courseTree-levelTitle` 的其他课程列表、搜索连续输入），且清楚标明测试输入捕获时间。测试通过本身不足以证明当前网站适配完整。

## 条件性风险（不是当前网站已发生的 bug）

### C05：时间表一个格子只读取第一门课

- `parsers/home.js:32-35` 固定把 tbody 行下标作为时限、跳过第一列、对每个格子 `querySelector('a')`。
- 若同格多个课程，会丢后续课程；行标题不连续/有 header 或 colspan 时会错位。
- 当前实时 evidence `multiCourseCells:0`、`tableRows:9`，多课程条件未触发；不要把此项写成当前网页已丢课。

### C06：材料 parser 依赖 folder，独立材料会被漏掉

- `parsers/course.js:60-83` 的 `parseCourseDocument` 仅扫描 `.cl-contentsList_folder` 内部 `.cl-contentsList_listGroupItem`；与 `parseUpcomingFromCourse`（90-96）相比，没有无 folder 的 fallback。
- 当前若网站输出无 folder 的独立列表，教材 UI 会为空，但到期 parser 仍可读出项目。需要当前教材页 DOM 证实是否存在此结构。

### C07：缺少利用次数被当作已知的 0 次

- `extractCourseItem`（`parsers/course.js:148-150`）缺少「利用回数」时 `usageCount=0`；`parseUpcomingFromCourse`（120-122）对所有项目设 `usageKnown:true`。
- 无次数字段、次数 class 改变、或「履歴」链接文字不含数字的项目可能被标为已知未利用，影响首页提醒优先级。利用次数本身也不能证明作业是否提交。
- 必须核对实时材料条目实际 status/usage 字段；不要依据此字段宣称作业未提交。

### C08：日期 parser 格式较窄且只有一端时误认为终止日期

- `utils/core.js:27-43` 的 regex 要求 `YYYY/M/D` 后出现冒号，不支持纯日期或日文年月日；首末匹配即 start/end。
- 仅一个有日期的起始端（如「2026/09/01 00:00 ～」）会同时成为终止端；`parseUpcomingFromCourse` 据此过滤未来/过去（course.js:103-105）。
- 此项需要当前利用可能期间字符串确认，当前不能宣称网站已改成不支持格式。
- 离线实际函数验证：完整双端日期可解析；纯日期得到 null；仅起始端被同时作为结束；非法 2/30、2/31 由 Date 静默归一化到 3 月。证据 `artifacts/audit-2026-09-30/course-core-offline-checks.json`，只代表构造输入条件。

### C09：章节 slug 可能冲突/同名章节被合并

- `course.js:69-74` 按 title 合并不同 folder；`core.js:349-351` 的 slugify 折叠标点/大小写，如 `A B` 与 `A-B` 都得 `a-b`；教材 section id 与右导航依赖该值（render/course.js:18、30）。
- 相同标题 folder 会合并；不同标题同 slug 会有重复 id，导航总是跳第一个。需要当前 folder 标题确认是否触发。
- 离线函数输出确认 `A B` / `A-B` 均为 `a-b`，`!!!` / `???` 均为 `section`，见 core offline evidence。

### C10：报告/得点表只按固定列位置读取

- `parsers/course.js:171-191` 报告读取固定 8 列，不按表头映射；附件只保留第一个链接。
- `parsers/course.js:234-243` 得点只保存 3 列；`render/course.js:162-178` 固定渲染 3 列。
- 仅当当前网站新增列、调整顺序、rowspan、一个报告多附件时才构成信息丢失；须用当前 DOM 核验。

## 本轮覆盖边界与核验补充

- 搜索焦点已在当前主页确认，见主报告 B06；IME 组合输入未单独实测。
- 前后周与今日可切换；“週表示”和章节交互问题仍以源码无 handler 为证据。
- 当前报告为空，无法对照真实非空报告内容。主报告 B15 用临时合成 DOM 确认当前 CSS 中报告行 display:block 与固定列轨道问题，已移除测试节点。
- 日期/利用次数/章节 slug 的离线构造验证只证明条件，不替代当前网站。
- 已检查当前课程的 2 个 folder / 2 个材料项目没有丢失；timeline 当前原生也暂为空，没有当前 timeline 丢项证据。
- 当前 `ku-lms-course-dom-evidence.json` / `ku-lms-scores-evidence.json` 显示材料仍使用 folder；scores 仍为 3 列、unittitle/foot 结构，当前教材、得点与总计文字一致。材料 evidence 的 `extensionMaterialCount:0` 来自不匹配渲染类名的采样，不代表材料实际丢失，实际 `.ku-section-item`/text 有 2 条。
