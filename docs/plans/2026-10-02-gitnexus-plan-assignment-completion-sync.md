# 课题手动完成状态与 Google 同步开发计划

> 标准版（更新：主页按手动完成状态过滤）；仅规划，未修改功能代码、测试或配置。
> Evidence verified at commit 174219b1cc8464efc8f995dc2853c03afe94223b；GitNexus 索引提交与 HEAD 一致，源码优先；图关联异常、Serena 不可用、PDG 未启用，详见 §12。
> Evidence provenance schema 2；global dirty digest f31384ab601a126cb21399c47002f00a4e92cb77a638e9cd379c0606e4bf43bb；30 个已排序引用路径；仅排除本计划路径。

## Objective (§1)

为「試験・アンケート・レポート・自習」增加可确认切换的手动完成标签，在课程页和近期课题中一致显示、持久保存并通过现有 Google 同步入口同步；主页排除已完成课题，利用回数不再作为排除依据；隐藏课程卡片标题区域的滚动条，保留滚动。

## Current Behaviour (§2–3)

- [verified] `src/content/parsers/course.js:52` 的课程列表与 `:69` 的近期课题都调用 `extractCourseItem`；`:117` 已解析类型、詳細、履歴和利用回数，但没有独立完成状态。`:142` 起存在标题推断覆盖原始类型的逻辑。
- [verified] `webclass/course.php/26170340/index.html:266` 的詳細与履歴链接含课程 ID、教材 ID 和会话参数；稳定身份可以从路径提取，不能存完整会话 URL。
- [verified] `src/content/render/course.js:30` 的右侧区域已有詳細／利用回数标签；`src/content/render/home.js:22` 和 `:91` 分别渲染主页近期课题、全部近期课题。
- [verified] `src/background/todo-store.js:89` 起通过 service worker 队列写 `chrome.storage.local`；操作 ID 防重、revision 防止陈旧覆盖；工作区及 Google 账号隔离已存在。
- [verified] `todo-replica.js:22` 仅接受 course/todo 实体，采用因果事件与显式冲突解决；`todo-drive.js:4` 和 `:65` 限定 v1 云端格式；`todo-sync.js:84` 起连接预览指纹只覆盖课程和 TODO。
- [verified] `src/content/critical.css:805` 的 `.ku-class-title-link` 设置 `overflow:auto`；`src/content/utils/core.js:113` 的主页近期筛选会排除已有利用回数的课题，全部近期课题另按期限窗口筛选。

- [verified] `services/cache.js:29`、`:112` 和 `:207` 会把旧利用回数过滤结果写回缓存；`services/refresh.js:25`、`runtime/boot-kulms.js:477` 和 `render/home.js:15` 各有前 5 条截断。仅改页面过滤会漏掉候补项、且无法从旧缓存恢复被删课题。

## Findings (§4–5)

- [graph] `impact(extractCourseItem, upstream, maxDepth:2)` 返回 **CRITICAL**，109 个受影响节点、82 个直接节点、26 个流程；部分关联明显不对应源码，不作为完整调用关系或修改范围依据。全部 82 个直接节点仍待实施前核对，不能视为已经排除风险。
- [verified] 针对上述异常交叉查源，`extractCourseItem` 在生产代码的直接调用位于 `parseCourseDocument` 两处和 `parseUpcomingFromCourse` 一处；测试还会替换该函数。计划保留原返回字段，增量加入身份及原始类型，不改参数语义。
- [graph] `impact(KuTodoReplica, upstream)` 返回 UNKNOWN、0 caller；源码已证实 store、sync、课程范围测试实际使用它，零结果不代表无影响。主要回归边界是本地队列、同步合并、旧备份及弹窗冲突操作。
- [graph] `pdg_query(extractCourseItem, controls)` 返回 “no PDG layer”；`trace(parseUpcomingFromCourse → extractCourseItem)` 遇到同名测试替身和缺失 UID，未得到可信链路，改用上述已核实源码关系。标准版不刷新索引。

- [graph/verified] 本次 `context` 与 `impact(Function:src/content/utils/core.js:isUpcomingDueSoonUnused, upstream, maxDepth:2)` 确认直接调用方 `pruneUpcomingItems`；impact 返回 **CRITICAL**、direct=1、processes_affected=73，二层仍有异常关联。唯一 d=1 调用方已纳入缓存改动；源码核实其三个调用点为缓存读取、课程采集保存、刷新目标准备。

## Proposed Changes (§6)

| 文件／入口 | 计划改动与约束 |
| --- | --- |
| `src/content/parsers/course.js`：`extractCourseItem`、`parseUpcomingFromCourse` | 添加教材 ID、原始分类及可跟踪类型，统一得到「规范课程 key + 教材 ID」身份；詳細／履歴路径优先，启动链接的 `set_contents_id` 仅结合可靠课程上下文回退。原始分类优先，缺少分类时才有限推断；资料和 LTI 不因标题含“課題”而误标。 |
| `src/content/services/cache.js`：`serializeCourseUpcomingItem`、`hydrateCourseUpcomingItem`；`services/all-upcoming.js`：`serializeAllUpcomingItem`、`buildAllUpcomingIdentityKey` | 缓存和恢复保留身份与可跟踪类型；旧缓存从已有链接恢复，无法恢复则等待正常刷新。聚合去重优先用稳定身份，避免同名同截止课题合并。缓存不保存完成态，显示时读取持久状态。`pruneUpcomingItems` 只筛期限／有效期，不因利用回数或完成状态删候选项；`rememberCourseUpcoming`、`loadUpcomingFromCourseCache`、`getRefreshEntries` 同步检查。旧缓存可能已丢弃利用过的课题，升级时标识候选缓存需刷新并沿用正常采集入口补齐，不把旧缓存当完整数据，也不清除持久完成记录。 |
| `src/content/utils/core.js`：`isUpcomingDueSoonUnused`、`upcomingPriorityRank`、`compareUpcomingItems` | 移除基于 hasUsage 的排除和排序降级；期限规则保留现有 7 天及利用可能期间约束。在共用页面服务另设纯函数按稳定身份与已加载工作区状态排除 completed=true；冲突暂按未完成保留，没有记录默认未完成。现有误导性函数名若调整必须语义重命名并验证引用，禁止全文替换。 |
| `src/content/services/refresh.js`：`startHomeRefresh`；`src/content/runtime/boot-kulms.js`：`enrichHomeAsync` | 删除候选数据阶段的前 5 条截断，保留全部有效候选；主页统一执行合并去重→期限筛选→完成状态过滤→排序→取前 5 条，不允许上游先裁剪。 |
| `src/background/todo-store.js`：`workspace`、`database`、`create` 内分发 | 在工作区新增独立 `assignmentCompletions` 集合；记录稳定身份、课程、标题快照、类型、显式 completed、updatedAt、revision。没有记录默认未完成，改回未完成仍保存显式事件。新增幂等 set 操作，使用 expectedRevision／工作区校验；状态与待同步事件同次落盘。课程页首次进入也能登记课程，不能覆盖主页的 courseScope。 |
| `src/background/todo-replica.js`：`valueOf`、`event`、`record`、`project`、`conflicts`、`resolve` | 增加完成状态实体，使用原有因果父节点；同状态并发视为一致，异状态并发保留两版，临时展示未完成并提示冲突，可通过确认选择目标状态，合并所有当前 heads。正常因果后继覆盖旧状态，不用设备时钟决定胜负。 |
| `src/background/todo-drive.js`：`create` 内传输；`todo-sync.js`：`create` 内拉取、上传、预览与确认 | 复用 OAuth、账号核对、自动触发、离线 outbox 和重试；新增完成状态独立 Drive 格式标记，TODO 的既有 v1 标记及字段保持兼容。新客户端拉取两种批次并联合校验，上传按实体分流；完成事件不得进入旧 TODO 批次，避免旧设备拒绝未知实体导致 TODO 同步失败。连接预览指纹、数量与确认检查包含完成状态。 |
| `src/popup/google-sync.js`：同步渲染与冲突操作 | 显示完成状态的同步计数及冲突，按实体选择文案与请求参数；完成状态冲突不得被仅适用 TODO 的课程范围过滤静默隐藏。 |
| 新增 `src/content/services/task-completion.js`（拟建）；现有 `KuTodoClient` 作为请求／订阅通道 | 提供状态批量加载、共用标签渲染和确认弹窗；每个页面一次加载，storage 变更后更新同身份标签并重新计算主页候选列表／补足前 5 条；完成后移出主页，在课程页或全部列表改回未完成后按期限条件重新纳入。重绘限制在近期课题区域，保留其他 UI 和焦点；避免逐课题请求和刷新 LMS 页面。请求失败显示重试状态，不能把读取失败伪装成未完成。 |
| `render/course.js`：`renderCourseMaterials`；`render/home.js`：`renderHome`、`renderAllUpcoming` | 在詳細／利用回数之后追加同尺寸圆角按钮；文案用日文 `未完了`／`完了`，未完成中性色、完成绿色并有文字。近期列表和全部列表显示同样标签，默认也允许确认切换。主页仅显示未完成候选，有利用回数也可以显示；课程页与「すべて見る」仍保留已完成项和状态标签，作为查看及改回未完成的入口。完成状态读取成功后再决定主页最终列表；加载／错误时显示相应状态。全部候选已完成时显示无待完成课题的空态，不能再用原生提醒误报有未完成项；确实未采集的课程仍提示读取。 |
| `src/content/hydrate/shared.js`：`bindInteractiveHandlers`、`cleanupRouteHydration`；`manifest.json` | 挂载／卸载新服务，处理路由重绘、关闭弹窗、取消旧异步回调及取消订阅；仅 LMS 入口加载模块，保持 syllabus 入口可独立启动。 |
| `src/content/critical.css` | 新增标签及确认弹窗样式；仅对 `.ku-class-title-link` 设置 `scrollbar-width:none` 和 `::-webkit-scrollbar` 隐藏规则，保持 `overflow:auto`，保留滚轮、触控板及键盘可达性。 |

确认弹窗显示课题名、当前状态与目标状态，提供取消／确认；取消、Escape 和关闭都不写入。确认期间禁用重复提交，保存成功后更新所有标签；失败保留原状态并可重试。弹窗具备焦点限制、背景 inert 和关闭后焦点恢复。多标签页或同步改变 revision／工作区时拒绝陈旧确认，刷新后重新确认，不能悄悄覆盖。

## Implementation Sequence (§7)

1. 核实四种真实 DOM 分类、教材 ID 回退、路线重绘；实施前恢复可用 Serena（若仍不可用则明确记录替代证据），对每个将编辑的现有函数执行 impact 并查明图异常。确认实际原始分类中“課題”是否代表报告类别。
2. 完成身份解析与两个缓存通道的贯通；再实现独立完成集合和版本迁移。数据库升级到旧客户端会拒绝的新版本（建议 3），副本格式显式升级；v1/v2 本地数据迁移前备份，旧数据补空集合。导出／导入读取旧备份并支持新字段，避免导入时丢失完成记录或制造新的课题身份。
3. 完成实体同步、分流格式、连接预览与冲突闭环，先通过多设备离线／重启／旧客户端兼容测试；迁移与未知格式失败时保留原始数据。
4. 接入课程页、主页和全部近期课题的标签、确认交互、订阅与生命周期；完成缓存保留和过滤顺序改造，移除利用回数排除／降级及上游前 5 条截断。完成保存或云端更新后立即刷新主页显示与空态，候补项自动补位；其他入口改回未完成可恢复。手动标记不会提交 LMS 课题、改变利用回数或掺入普通 TODO 列表／计数。
5. 局部隐藏滚动条；运行针对性测试及 `npm test`，浏览器验收布局和滚动。代码验证后先 `detect_changes(scope:all)`，检查意外符号／流程且不接受 partial/truncated，再运行 `node .gitnexus/run.cjs analyze` 更新索引；提交前再次确保图检查完整，保留用户已有 AGENTS.md／CLAUDE.md 改动。

## Test Strategy (§8)

- 身份与解析：四类可标记，资料／LTI 不可标记；会话参数、详情／历史／启动链接得到同一身份；同名课题不同 ID、跨课程、重命名、改截止日期不串记录；旧缓存恢复、缓存清理和重新采集不清掉完成记录；无可靠身份时禁止写入而非用标题拼接。
- 新建 `scripts/verify-task-completion.mjs`（模型／页面集成场景）：确认与取消、双向切换、重复点击、写入失败、过期 revision、确认期间换工作区、多入口实时更新、后台同步更新、读取失败／加载态、路由切换和异步返回；四类及狭窄视口 DOM 覆盖。
- 扩展已有 `scripts/verify-todo-store.mjs`、`verify-todo-sync.mjs`、`verify-todo-drive.mjs`：旧数据库／备份迁移、worker 重启、两设备相同／相反修改、冲突解决再同步、离线重试、响应丢失、401／账号变化、格式隔离、旧设备继续 TODO 同步；TODO 原有测试全部通过。
- 更新 `verify-home-unknown-usage.mjs`、`verify-home-upcoming-session-safety.mjs`、`verify-home-all-upcoming-assignments-page.mjs` 中“已利用必须排除”的旧断言，并补充 `verify-home-safe-refresh-deadlines.mjs` 的刷新回归；测试使用有效期间，覆盖利用回数有／无／未知 × 完成／未完成、默认无记录、跨设备切换、前 5 条均完成而第 6 条未完成、全部完成空态、状态读取失败、保留候选缓存与旧缓存刷新。
- [verified] `package.json` 只有 `npm test`；`scripts/verify-all.mjs:5` 自动发现 verify 脚本并生成 checks.json。新测试可单独运行 `node scripts/verify-task-completion.mjs`；先针对性验证，再跑完整 `npm test`。本计划阶段不运行会生成仓库产物的测试，不声称已有通过结果。
- 浏览器验收：实际四类课题标签位置、長标题／利用回数并排、窄窗口换行、Tab／Enter／Escape、弹窗焦点恢复；课程卡无可见滚动条且滚轮／触控板／键盘仍可访问长内容。跨设备真实 Google 同步在既有授权条件下核验，不以模拟测试替代真实结果。

## Implementation Context (§11)

```json
{
  "implementation_context": {
    "task_summary": "四类课题手动完成、确认切换、TODO 同级持久化与 Google 同步、近期课题状态展示和课程标题无可见滚动条；主页以手动完成状态替代利用回数过滤，先过滤再取前5条",
    "evidence_provenance": {
      "schema_version": 2,
      "head_commit": "174219b1cc8464efc8f995dc2853c03afe94223b",
      "generated_plan_path": "docs/plans/2026-10-02-gitnexus-plan-assignment-completion-sync.md",
      "global_dirty_digest": {
        "algorithm": "sha256",
        "canonicalization": "gitnexus-evidence-provenance-v2 NUL-framed UTF-8 records",
        "value": "f31384ab601a126cb21399c47002f00a4e92cb77a638e9cd379c0606e4bf43bb"
      },
      "cited_path_manifest": [
        {
          "path": "AGENTS.md",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "unstaged",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:116454dc583cd49d39fc148f395c6a64f431fdbdaa8a7852faa3223ea15daeb9",
          "index_digest": "sha256:116454dc583cd49d39fc148f395c6a64f431fdbdaa8a7852faa3223ea15daeb9",
          "worktree_digest": "sha256:29e5f6e07911daaca172ce298e4ca77567ac3798653e6eb21d460742b1236d39",
          "untracked_digest": "absent"
        },
        {
          "path": "manifest.json",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:6414e0ed3acf92becfdb5640ccd9ebaf1b6358945b88ff90f0839c813ee08572",
          "index_digest": "sha256:6414e0ed3acf92becfdb5640ccd9ebaf1b6358945b88ff90f0839c813ee08572",
          "worktree_digest": "sha256:6414e0ed3acf92becfdb5640ccd9ebaf1b6358945b88ff90f0839c813ee08572",
          "untracked_digest": "absent"
        },
        {
          "path": "package.json",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:b633d2c2faa59be4347471d2f2d80c822801354eea331449bc4e6adea6789137",
          "index_digest": "sha256:b633d2c2faa59be4347471d2f2d80c822801354eea331449bc4e6adea6789137",
          "worktree_digest": "sha256:b633d2c2faa59be4347471d2f2d80c822801354eea331449bc4e6adea6789137",
          "untracked_digest": "absent"
        },
        {
          "path": "scripts/verify-all.mjs",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:0aa5b943f449d8410d9e7198443910de1dc8616126832cdd443227b64a76d44d",
          "index_digest": "sha256:0aa5b943f449d8410d9e7198443910de1dc8616126832cdd443227b64a76d44d",
          "worktree_digest": "sha256:0aa5b943f449d8410d9e7198443910de1dc8616126832cdd443227b64a76d44d",
          "untracked_digest": "absent"
        },
        {
          "path": "scripts/verify-home-all-upcoming-assignments-page.mjs",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:d56bd362efbb1d19438549aa055ec1f8ce5316351c0529a5de9933445d8b2c8f",
          "index_digest": "sha256:d56bd362efbb1d19438549aa055ec1f8ce5316351c0529a5de9933445d8b2c8f",
          "worktree_digest": "sha256:d56bd362efbb1d19438549aa055ec1f8ce5316351c0529a5de9933445d8b2c8f",
          "untracked_digest": "absent"
        },
        {
          "path": "scripts/verify-home-safe-refresh-deadlines.mjs",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:36f247b83f58f325782be633f6cb8ca71f4d31892b9d12fb9c6dad08beac287b",
          "index_digest": "sha256:36f247b83f58f325782be633f6cb8ca71f4d31892b9d12fb9c6dad08beac287b",
          "worktree_digest": "sha256:36f247b83f58f325782be633f6cb8ca71f4d31892b9d12fb9c6dad08beac287b",
          "untracked_digest": "absent"
        },
        {
          "path": "scripts/verify-home-unknown-usage.mjs",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:c152b5c3d30508a9bbe0b54a4fa65bf6a4bc1adece354ec129fa1373285ebe64",
          "index_digest": "sha256:c152b5c3d30508a9bbe0b54a4fa65bf6a4bc1adece354ec129fa1373285ebe64",
          "worktree_digest": "sha256:c152b5c3d30508a9bbe0b54a4fa65bf6a4bc1adece354ec129fa1373285ebe64",
          "untracked_digest": "absent"
        },
        {
          "path": "scripts/verify-home-upcoming-session-safety.mjs",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:303492829e24e2f4031d6d6e1c22a1510e83e8bc45140cdb5128a7deced1985d",
          "index_digest": "sha256:303492829e24e2f4031d6d6e1c22a1510e83e8bc45140cdb5128a7deced1985d",
          "worktree_digest": "sha256:303492829e24e2f4031d6d6e1c22a1510e83e8bc45140cdb5128a7deced1985d",
          "untracked_digest": "absent"
        },
        {
          "path": "scripts/verify-todo-drive.mjs",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:d552a631e73a166af45953782d32ad0e4ef206e508bfd317cb1d219ba22b9d1d",
          "index_digest": "sha256:d552a631e73a166af45953782d32ad0e4ef206e508bfd317cb1d219ba22b9d1d",
          "worktree_digest": "sha256:d552a631e73a166af45953782d32ad0e4ef206e508bfd317cb1d219ba22b9d1d",
          "untracked_digest": "absent"
        },
        {
          "path": "scripts/verify-todo-store.mjs",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:06d3855a2f65eadbfeb2e85bd102dcba052ce82ff3320297eff024f3b27631b4",
          "index_digest": "sha256:06d3855a2f65eadbfeb2e85bd102dcba052ce82ff3320297eff024f3b27631b4",
          "worktree_digest": "sha256:06d3855a2f65eadbfeb2e85bd102dcba052ce82ff3320297eff024f3b27631b4",
          "untracked_digest": "absent"
        },
        {
          "path": "scripts/verify-todo-sync.mjs",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:1660ebd8eb57069512248c3dd8c305c5fdf6b26da7cdbf91e348cbc7c9c1759c",
          "index_digest": "sha256:1660ebd8eb57069512248c3dd8c305c5fdf6b26da7cdbf91e348cbc7c9c1759c",
          "worktree_digest": "sha256:1660ebd8eb57069512248c3dd8c305c5fdf6b26da7cdbf91e348cbc7c9c1759c",
          "untracked_digest": "absent"
        },
        {
          "path": "scripts/verify-todo-ui.mjs",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:6cfb639d0347c2a450d97c00ddc58eca7b4ba30776a967b9f459ef971e1f05fa",
          "index_digest": "sha256:6cfb639d0347c2a450d97c00ddc58eca7b4ba30776a967b9f459ef971e1f05fa",
          "worktree_digest": "sha256:6cfb639d0347c2a450d97c00ddc58eca7b4ba30776a967b9f459ef971e1f05fa",
          "untracked_digest": "absent"
        },
        {
          "path": "src/background/todo-drive.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:246cebf43211715536cc82666c37e772bc19afbf74f275d89b6b043b733ea35f",
          "index_digest": "sha256:246cebf43211715536cc82666c37e772bc19afbf74f275d89b6b043b733ea35f",
          "worktree_digest": "sha256:246cebf43211715536cc82666c37e772bc19afbf74f275d89b6b043b733ea35f",
          "untracked_digest": "absent"
        },
        {
          "path": "src/background/todo-replica.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:fe8ae2c9ff2c8cbb052d0b78b5d3751cbeb79696c5990a13f23fbabb1cc50a5f",
          "index_digest": "sha256:fe8ae2c9ff2c8cbb052d0b78b5d3751cbeb79696c5990a13f23fbabb1cc50a5f",
          "worktree_digest": "sha256:fe8ae2c9ff2c8cbb052d0b78b5d3751cbeb79696c5990a13f23fbabb1cc50a5f",
          "untracked_digest": "absent"
        },
        {
          "path": "src/background/todo-store.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:da991157e2c2d1ba58c1bd58b9e30431a0e0b107b1fa047b7b8e6308687609ac",
          "index_digest": "sha256:da991157e2c2d1ba58c1bd58b9e30431a0e0b107b1fa047b7b8e6308687609ac",
          "worktree_digest": "sha256:da991157e2c2d1ba58c1bd58b9e30431a0e0b107b1fa047b7b8e6308687609ac",
          "untracked_digest": "absent"
        },
        {
          "path": "src/background/todo-sync.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:906ac44c9cf5cb5f1b68cf4a46c5e56e7a83b274adfe09f8f7016b7c5ba6fc76",
          "index_digest": "sha256:906ac44c9cf5cb5f1b68cf4a46c5e56e7a83b274adfe09f8f7016b7c5ba6fc76",
          "worktree_digest": "sha256:906ac44c9cf5cb5f1b68cf4a46c5e56e7a83b274adfe09f8f7016b7c5ba6fc76",
          "untracked_digest": "absent"
        },
        {
          "path": "src/content/critical.css",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:99667de8b68b614bde537984780db087f786ef0da1121d073aeb009023127432",
          "index_digest": "sha256:99667de8b68b614bde537984780db087f786ef0da1121d073aeb009023127432",
          "worktree_digest": "sha256:99667de8b68b614bde537984780db087f786ef0da1121d073aeb009023127432",
          "untracked_digest": "absent"
        },
        {
          "path": "src/content/hydrate/shared.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:a9ff3bd9659639fa429f91251611dbc5bba858479a95d5f7062cf7ba22245edf",
          "index_digest": "sha256:a9ff3bd9659639fa429f91251611dbc5bba858479a95d5f7062cf7ba22245edf",
          "worktree_digest": "sha256:a9ff3bd9659639fa429f91251611dbc5bba858479a95d5f7062cf7ba22245edf",
          "untracked_digest": "absent"
        },
        {
          "path": "src/content/parsers/course.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:3100103d276ee7a8103360ef94b131397191d7ed7d0edf36797416f4b164b5f4",
          "index_digest": "sha256:3100103d276ee7a8103360ef94b131397191d7ed7d0edf36797416f4b164b5f4",
          "worktree_digest": "sha256:3100103d276ee7a8103360ef94b131397191d7ed7d0edf36797416f4b164b5f4",
          "untracked_digest": "absent"
        },
        {
          "path": "src/content/render/course.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:5007e1c832cc696cf890a5f52133b019b1207ee7900a5be3ec1b3b6d5a548675",
          "index_digest": "sha256:5007e1c832cc696cf890a5f52133b019b1207ee7900a5be3ec1b3b6d5a548675",
          "worktree_digest": "sha256:5007e1c832cc696cf890a5f52133b019b1207ee7900a5be3ec1b3b6d5a548675",
          "untracked_digest": "absent"
        },
        {
          "path": "src/content/render/home.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:169f4142c0bb35deba03513b74cefccfc0492290a5e220846f272cdac2612653",
          "index_digest": "sha256:169f4142c0bb35deba03513b74cefccfc0492290a5e220846f272cdac2612653",
          "worktree_digest": "sha256:169f4142c0bb35deba03513b74cefccfc0492290a5e220846f272cdac2612653",
          "untracked_digest": "absent"
        },
        {
          "path": "src/content/runtime/boot-kulms.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:ed6ac94dba2633f8a0f3c94aa984e565ae8fe23bb6cb48c2acf433a287752d35",
          "index_digest": "sha256:ed6ac94dba2633f8a0f3c94aa984e565ae8fe23bb6cb48c2acf433a287752d35",
          "worktree_digest": "sha256:ed6ac94dba2633f8a0f3c94aa984e565ae8fe23bb6cb48c2acf433a287752d35",
          "untracked_digest": "absent"
        },
        {
          "path": "src/content/services/all-upcoming.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:5d79876dee32e1c688785929f13d8c6f2e9d8233faaa2d9924263271ff194507",
          "index_digest": "sha256:5d79876dee32e1c688785929f13d8c6f2e9d8233faaa2d9924263271ff194507",
          "worktree_digest": "sha256:5d79876dee32e1c688785929f13d8c6f2e9d8233faaa2d9924263271ff194507",
          "untracked_digest": "absent"
        },
        {
          "path": "src/content/services/cache.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:da1d74dd0709cb5c638b54d20668f1b5a3a80ebce12bf82a979c345131238ca3",
          "index_digest": "sha256:da1d74dd0709cb5c638b54d20668f1b5a3a80ebce12bf82a979c345131238ca3",
          "worktree_digest": "sha256:da1d74dd0709cb5c638b54d20668f1b5a3a80ebce12bf82a979c345131238ca3",
          "untracked_digest": "absent"
        },
        {
          "path": "src/content/services/refresh.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:ee2c372a22acf0f536e1caa91380e809232a447e555da600bcb87345a15c48ef",
          "index_digest": "sha256:ee2c372a22acf0f536e1caa91380e809232a447e555da600bcb87345a15c48ef",
          "worktree_digest": "sha256:ee2c372a22acf0f536e1caa91380e809232a447e555da600bcb87345a15c48ef",
          "untracked_digest": "absent"
        },
        {
          "path": "src/content/services/todo.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:8591ec9786e4ea086020856a171f8b5ea6f2739371ab316bddf3a8e4da6bce02",
          "index_digest": "sha256:8591ec9786e4ea086020856a171f8b5ea6f2739371ab316bddf3a8e4da6bce02",
          "worktree_digest": "sha256:8591ec9786e4ea086020856a171f8b5ea6f2739371ab316bddf3a8e4da6bce02",
          "untracked_digest": "absent"
        },
        {
          "path": "src/content/utils/core.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:acaebccdbe9cbe24b9d16b313d9a31e4350e92890d23044cc7d032d434545594",
          "index_digest": "sha256:acaebccdbe9cbe24b9d16b313d9a31e4350e92890d23044cc7d032d434545594",
          "worktree_digest": "sha256:acaebccdbe9cbe24b9d16b313d9a31e4350e92890d23044cc7d032d434545594",
          "untracked_digest": "absent"
        },
        {
          "path": "src/popup/google-sync.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:ed6982367e4f305620245dfa4deecfc1ca64f3eda2cb1da62f18181728ff80d7",
          "index_digest": "sha256:ed6982367e4f305620245dfa4deecfc1ca64f3eda2cb1da62f18181728ff80d7",
          "worktree_digest": "sha256:ed6982367e4f305620245dfa4deecfc1ca64f3eda2cb1da62f18181728ff80d7",
          "untracked_digest": "absent"
        },
        {
          "path": "src/shared/todo-client.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:e6eaff1c8d367804dc447a8d27c910a6d44a58fc6b4e2698897b544ccc0b2547",
          "index_digest": "sha256:e6eaff1c8d367804dc447a8d27c910a6d44a58fc6b4e2698897b544ccc0b2547",
          "worktree_digest": "sha256:e6eaff1c8d367804dc447a8d27c910a6d44a58fc6b4e2698897b544ccc0b2547",
          "untracked_digest": "absent"
        },
        {
          "path": "webclass/course.php/26170340/index.html",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:5a0c904ca4695a3e0a1b1efe337ea8ab9984e1989ae5a033f80b262fd372f599",
          "index_digest": "sha256:5a0c904ca4695a3e0a1b1efe337ea8ab9984e1989ae5a033f80b262fd372f599",
          "worktree_digest": "sha256:5a0c904ca4695a3e0a1b1efe337ea8ab9984e1989ae5a033f80b262fd372f599",
          "untracked_digest": "absent"
        }
      ]
    },
    "files_to_modify": [
      {
        "file": "src/content/parsers/course.js",
        "symbols": [
          "extractCourseItem",
          "parseUpcomingFromCourse"
        ],
        "intended_change": "稳定教材身份与可跟踪分类"
      },
      {
        "file": "src/content/services/cache.js",
        "symbols": [
          "serializeCourseUpcomingItem",
          "hydrateCourseUpcomingItem",
          "pruneUpcomingItems",
          "rememberCourseUpcoming",
          "loadUpcomingFromCourseCache",
          "getRefreshEntries"
        ],
        "intended_change": "缓存身份字段及旧缓存恢复；候选缓存不因利用回数或完成状态丢项，旧不完整缓存需正常刷新"
      },
      {
        "file": "src/content/services/all-upcoming.js",
        "symbols": [
          "serializeAllUpcomingItem",
          "buildAllUpcomingIdentityKey"
        ],
        "intended_change": "身份贯通与准确去重"
      },
      {
        "file": "src/background/todo-store.js",
        "symbols": [
          "workspace",
          "database",
          "create"
        ],
        "intended_change": "完成集合、迁移、幂等带版本写入及备份兼容"
      },
      {
        "file": "src/background/todo-replica.js",
        "symbols": [
          "valueOf",
          "event",
          "record",
          "project",
          "conflicts",
          "resolve"
        ],
        "intended_change": "完成实体因果合并及显式冲突解决"
      },
      {
        "file": "src/background/todo-drive.js",
        "symbols": [
          "create"
        ],
        "intended_change": "独立完成批次格式、保留旧 TODO 格式"
      },
      {
        "file": "src/background/todo-sync.js",
        "symbols": [
          "create"
        ],
        "intended_change": "两个批次通道、完整连接预览及同步控制"
      },
      {
        "file": "src/popup/google-sync.js",
        "symbols": [
          "render"
        ],
        "intended_change": "完成状态的同步及冲突界面"
      },
      {
        "file": "src/content/services/task-completion.js",
        "symbols": [],
        "intended_change": "新建：共用状态服务、标签及确认弹窗；主页按完成状态选择候选，订阅更新触发补位和空态重算"
      },
      {
        "file": "src/content/render/course.js",
        "symbols": [
          "renderCourseMaterials"
        ],
        "intended_change": "右侧完成标签"
      },
      {
        "file": "src/content/render/home.js",
        "symbols": [
          "renderHome",
          "renderAllUpcoming"
        ],
        "intended_change": "近期课题两个入口的完成标签；主页排除已完成、先过滤后取前5，全部列表保留完成项"
      },
      {
        "file": "src/content/hydrate/shared.js",
        "symbols": [
          "bindInteractiveHandlers",
          "cleanupRouteHydration"
        ],
        "intended_change": "挂载清理与失效回调保护"
      },
      {
        "file": "src/content/critical.css",
        "symbols": [],
        "intended_change": "标签／弹窗样式及局部隐藏滚动条"
      },
      {
        "file": "manifest.json",
        "symbols": [],
        "intended_change": "LMS 内容脚本加载新模块"
      },
      {
        "file": "src/content/utils/core.js",
        "symbols": [
          "isUpcomingDueSoonUnused",
          "upcomingPriorityRank",
          "compareUpcomingItems"
        ],
        "intended_change": "移除利用回数排除与排序降级，保留期限规则"
      },
      {
        "file": "src/content/services/refresh.js",
        "symbols": [
          "startHomeRefresh"
        ],
        "intended_change": "候选阶段不截断前5条"
      },
      {
        "file": "src/content/runtime/boot-kulms.js",
        "symbols": [
          "enrichHomeAsync"
        ],
        "intended_change": "异步候选加载不截断前5条"
      }
    ],
    "tests": [
      {
        "file": "scripts/verify-task-completion.mjs",
        "new": true,
        "scenarios": [
          "四类型与资料/LTI排除",
          "稳定身份和旧缓存恢复",
          "确认/取消与双向切换",
          "多入口同步与生命周期",
          "写失败/加载失败/陈旧revision/工作区切换",
          "利用次数与完成状态交叉矩阵",
          "完成保存及远端更新后主页移除并补位",
          "全部完成正确空态",
          "状态未加载/读取失败不展示伪造未完成列表"
        ]
      },
      {
        "file": "scripts/verify-todo-store.mjs",
        "scenarios": [
          "v1/v2迁移及备份",
          "完成记录独立且幂等",
          "worker重启及容量错误",
          "新旧备份导入导出"
        ]
      },
      {
        "file": "scripts/verify-todo-sync.mjs",
        "scenarios": [
          "两设备离线同状态/相反状态",
          "显式冲突解决",
          "上传响应丢失/重启",
          "完成状态变化使连接预览失效",
          "账号和工作区隔离"
        ]
      },
      {
        "file": "scripts/verify-todo-drive.mjs",
        "scenarios": [
          "两种批次标记隔离",
          "旧设备TODO协议保持可用",
          "未知格式/账号校验/401/429"
        ]
      },
      {
        "file": "scripts/verify-todo-ui.mjs",
        "scenarios": [
          "普通TODO计数及列表不混入完成实体",
          "既有TODO交互无回归"
        ]
      },
      {
        "file": "scripts/verify-home-unknown-usage.mjs",
        "scenarios": [
          "有利用回数但未完成保留",
          "未知利用次数不误判完成",
          "期限边界保持"
        ]
      },
      {
        "file": "scripts/verify-home-upcoming-session-safety.mjs",
        "scenarios": [
          "候选缓存保留已利用/已完成项",
          "旧缓存刷新",
          "完成切换恢复无需再抓取有效缓存"
        ]
      },
      {
        "file": "scripts/verify-home-all-upcoming-assignments-page.mjs",
        "scenarios": [
          "更新旧主页排除断言",
          "主页排除完成项但全部列表保留",
          "全部列表改回未完成后主页恢复"
        ]
      },
      {
        "file": "scripts/verify-home-safe-refresh-deadlines.mjs",
        "scenarios": [
          "刷新未提前截断候选",
          "前5条均已完成时后续项补位",
          "课程采集保持既有会话保护"
        ]
      }
    ],
    "verification_commands": [
      "node scripts/verify-task-completion.mjs",
      "node scripts/verify-todo-store.mjs",
      "node scripts/verify-todo-sync.mjs",
      "node scripts/verify-todo-drive.mjs",
      "npm test",
      "node .gitnexus/run.cjs detect-changes --scope all --repo .",
      "node .gitnexus/run.cjs analyze"
    ],
    "assumptions": [
      "默认日文未完了/完了；主页和全部近期课题均可确认切换",
      "沿用当前TODO工作区与Google账号边界",
      "来源类型优先；现场核实課題与レポート分类关系",
      "身份无法可靠恢复时禁用标记并提示重新读取",
      "主页不按利用回数排除；仅已完成记录排除，原有期限与可用期间仍适用",
      "课程页与全部近期课题保留已完成项供查看和撤销",
      "不完整旧候选缓存需正常刷新，不能立即恢复历史上已经删除的数据"
    ],
    "open_questions": [
      "当前会话无Serena，实施前尝试启用，失败则明确报告替代证据",
      "GitNexus返回CRITICAL且存在源码不支持的关联；82个d1节点未逐一验证，必须复核而非假定安全",
      "PDG不可用；trace源符号缺失UID，未得到可靠图路径",
      "本轮没有真实浏览器/Google同步验收，实施时执行",
      "新增筛选函数impact为CRITICAL；d1 pruneUpcomingItems已核实纳入，二层异常仍需实施时复核"
    ],
    "avoid": [
      "不修改用户已有AGENTS.md/CLAUDE.md改动",
      "不把利用回数等同完成",
      "不用标题/截止日期/会话URL作为持久身份",
      "不从LMS刷新缓存删除完成记录",
      "不将完成记录加入TODO列表/计数",
      "不把新实体上传到旧TODO云端标记",
      "不将storage或sync失败伪装为已保存/已同步",
      "不对整个课程表或页面隐藏滚动条",
      "不得以UNKNOWN零调用或异常图结果免除impact检查",
      "本轮只生成计划，不实施功能",
      "不在持久候选缓存中按完成状态删项",
      "不先取前5条再按完成状态过滤",
      "不得保留利用回数导致的隐藏或排序降级",
      "不把主页过滤规则扩展为课程页和全部列表隐藏完成项"
    ]
  }
}
```

## Assumptions and Open Questions (§12)

- [user requirement] 主页按手动完成状态排除已完成课题，不再按利用回数排除；未标记默认未完成，仍需满足期限／利用可能期间条件。本次指令仅改变主页过滤，课程页和「すべて見る」保留两种状态，便于改回未完成；UI 默认 `未完了／完了`。
- [assumed] 保存范围沿用当前 TODO 工作区和绑定 Google 账号；本次不新增 LMS 用户身份体系。四类现场 DOM、缺 ID 极端情况和真实同步仍需实施时验证，本轮依据源码及现有 HTML 样本，未连接浏览器。
- [verified/graph] Serena 本会话不可调用；PDG 未启用；索引 HEAD 一致但 context/impact 存在异常关联，trace 未得到可用路径。82 个直接节点未逐一证实，实施时复核是前置工作；不要把该 CRITICAL 或 replica 的 UNKNOWN 降级为低风险。标准版 freshness:accept，没有运行索引刷新或修复分析器。
- 暂不加入自动完成判断、额外过滤开关、其他提醒策略调整及无关重构。主页按完成状态过滤属于本次明确范围。

## Definition of Done (§13)

四类课题的确认切换、刷新／重启持久化、同工作区多入口一致和 Google 多设备同步均验证；主页已完成排除、已利用但未完成保留、撤销完成恢复、先过滤后取前 5 条及全部完成空态均验证；取消不写入、失败不伪成功、并发不静默丢状态，旧 TODO 数据及同步无回归；滚动条隐藏且内容仍可滚动；测试和浏览器结果可审阅，detect_changes 完整检查且最终索引更新。本轮交付仅为此计划。
