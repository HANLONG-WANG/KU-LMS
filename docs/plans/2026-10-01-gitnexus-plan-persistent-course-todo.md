# GitNexus Engineering Plan — 持久化课程 TODO

> Task: 按 LMS 课程卡片管理待办，支持主页一览、单课程编辑和扩展弹窗编辑。
> Evidence verified at commit 79a22c58dd180e564d2c777f9b0fb988e94c977d; GitNexus index 4 commits behind, freshness: accept，源码优先；未刷新索引。
> Evidence provenance schema 2; global dirty digest c2ee5991fd0aa17007564567b53636a12152cfea9bda75d398e323d970e70b16; cited-path manifest 17 sorted entries; exact generated plan path excluded.

## Objective (§1)
用户已确认标准深度、以整门课程卡片为单位。一门课程可有多个 TODO，三个入口共享一份数据；本轮仅事实确认、计划和 UI 草案。

## Current Behaviour (§2–3)
- [verified] manifest.json 为 MV3，已有 storage 权限、service worker 与 default_popup；无需为基本 TODO 功能增加网络权限。
- [verified] src/popup/popup.html 与 popup.css 当前只有设置表单，宽 320px；popup.js:14 的 initPopup 只读取扩展设置。
- [verified] renderHome（src/content/render/home.js:3）调用 renderSchedule；renderScheduleCard（src/content/render/shared.js:80）输出课程标题、元信息/シ、截止提醒。
- [verified] src/content/critical.css:719 课程卡片固定 128px 高；实际后台页面在 2048px 视口中卡片约 188×128px，长标题已占多行。
- [verified] parseSchedule（src/content/parsers/home.js:26）提取课程链接、标题和节次；buildCourseCacheKey（src/content/utils/core.js:228）按 courseId 生成不带会话参数的课程地址。
- [verified] readCourseUpcomingCache（src/content/services/cache.js:69）读取 sessionStorage 并按 TTL 过滤；syncCourseUpcomingCacheIdentity:131 会清理会话缓存，不能复用为 TODO 数据库。
- [verified] src/shared/settings.js 的设置已经使用 chrome.storage.local；其 API 不可用时的成功 fallback 不适用于 TODO。service-worker.js:7 有现有消息路由可扩展。
- [verified] Chrome DevTools 仅后台读取 page 1 的 DOM/截图，未置前或修改 LMS；实际扩展弹窗未打开，弹窗现状依据源码，未证明已安装扩展与 HEAD 完全一致。

## Findings (§4–5)
- [graph] query(home timetable course card syllabus popup storage) 定位缓存/刷新流程；context(renderHome) 找到上游 renderPage；trace(renderHome → renderScheduleCard) 得到 renderHome → renderSchedule → renderScheduleCard。
- [graph] impact(renderScheduleCard, upstream, depth=2, file=src/content/render/shared.js) 返回 risk HIGH、direct=1、impactedCount=2；直接依赖 renderSchedule，间接 renderHome，涉及 ensureRoot/renderPage 首页渲染流程。已向用户提示 HIGH。
- [verified] Serena find_referencing_symbols(renderScheduleCard) 确认 renderSchedule 回调直接调用，与源码相符；实施需保留其参数兼容性并回归调用方。
- [graph] pdg_query(renderSchedule, controls) 返回 no PDG layer；不重建语句边。图谱陈旧且 PDG 缺失，不能视作完整影响分析。runner 可用 node .gitnexus/run.cjs，索引记录 CLI 1.6.11；本轮未验证当前 runner 构建身份，不刷新。

## Proposed Changes (§6)
- [inferred] 新增独立 TODO repository：chrome.storage.local 为主存储；service worker 为唯一写入方，按 workspace 串行处理，等待持久化成功再返回成功；客户端通过 storage.onChanged 更新视图。
- [inferred] 数据：schemaVersion、workspaceId、revision、courses、todos、drafts、appliedOperationIds。课程 key 为 origin + courseId，保存标题/学期/节次快照；年度仅作元信息，不用标题、周次或 acs_ 作身份。无法解析 ID 时禁用创建并说明原因。
- [inferred] TODO：UUID、courseKey、text、completedAt、createdAt、updatedAt、revision、deletedAt；首版正文与完成状态足够，截止时间/优先级/自动导入 LMS 作业暂不纳入。
- [inferred] 客户端提交最小操作与 expectedRevision、operationId；同项冲突显示两份内容并保留输入，不静默覆盖；不同项并发安全合并，重复请求幂等。worker 重启从持久化状态恢复，不依靠全局内存保数据。
- [inferred] 数据无 TTL；换周、换学期、课程消失、退出登录、清缓存和扩展更新不主动删除；课程目录仅 upsert，不用当前学期列表覆盖全部。归档/已完成可再次查看。
- [inferred] 编辑草稿输入即提交持久化请求，不只依赖关闭事件或长 debounce；明确显示保存中/已保存/失败，仅确认落盘才称已保存。关闭前尚未确认的输入仍有边界，必须恢复已持久化草稿并提供重试。
- [inferred] 删除为软删除，支持撤销与回收站；永久删除单独确认。导出 JSON 仅含课程/TODO，导入校验 schema、尺寸与字段，预览合并/冲突；导入和迁移前留一份可恢复快照，失败保持原始数据，未知未来版本只读。
- [verified] Chrome 官方说明 storage.local 在清理缓存/浏览记录后仍保留，但卸载扩展会清除；外部备份才能覆盖卸载、换电脑或配置文件损坏。https://developer.chrome.com/docs/extensions/reference/api/storage
- [inferred] UI：课程卡片改为标题、编号、独立操作行「シ」「☑ 未完成数」、底部截止提醒；推荐统一 min-height 156px，长标题可展开/完整提示，窄屏保留课表横向滚动并放大触控目标。零项仍显示入口「☑ +」。
- [inferred] 主页右侧在作业截止面板下新增「マイTODO」一览，默认当前学期未完成、显示总数与“全部”；展开完整分组列表，不让有限预览隐藏其他项目的存在。单课程抽屉含新增、编辑、完成、已完成折叠、回收站。
- [inferred] 弹窗约 400px 宽，默认 TODO，保留“设置”页；课程选择/搜索、全部课程分组、直接编辑、备份与恢复。即使无 LMS 标签页也从目录工作；目录为空提示先访问主页。弹窗明确当前本地工作区，不能因未登录而清空。
- [verified] output/course-todo-design.html 为示例交互草案，能切换主页/弹窗、进入课程、新增、编辑、完成并同步计数；不保存真实数据、不代表已实现。桌面截图与离线交互已检查；正式抽屉、删除/恢复与备份流程按计划实现。

## Implementation Sequence (§7)
1. 固定消息协议、课程身份和本地工作区规则；新建共享客户端与背景 repository，先实现严格错误、幂等、版本冲突、迁移/恢复测试。
2. 登记当前主页课程目录与其他课程，异步加载 TODO；保持首页先渲染，目录只做增量更新，避免重复绑定或整页重绘丢失编辑草稿。
3. 增加 renderScheduleCard、renderHomeOtherCourses 操作入口及 renderHome 一览；抽屉复用同一编辑组件，事件与课程跳转隔离。每个既有函数编辑前重新 impact，HIGH 风险保留回归覆盖。
4. 扩展 initPopup 与双页 UI，新增目录/列表/编辑/草稿恢复；保留现有设置保存逻辑。TODO 初始化错误不得阻断设置页。
5. 完成回收站、导出导入、错误/空状态与可访问性；测试后 detect_changes(scope=all)，完整检查非 partial/truncated 输出，再按项目要求 gitnexus analyze 刷新索引。

## Test Strategy (§8)
- 数据：重启浏览器/worker、reload/update、跨学期、目录缺课、并发写/冲突/重试、空间不足、读取错误、损坏数据、迁移失败、导入重复、删除恢复；不通过卸载真实扩展做破坏性验证。
- UI：三个入口计数同步、无 LMS 标签页编辑、关闭重开恢复已保存草稿、0/1/99+ 项、长中文/日文标题、五天五节、三标记共存、窄屏/键盘/Esc/焦点返回、恶意正文按文本显示。
- [verified] package.json 的 npm test 调用 scripts/verify-all.mjs 自动发现 verify-*.mjs；现有 scripts/verify-audit-popup-regressions.mjs、scripts/verify-home-week-window-schedule.mjs 可补回归。本轮不运行会生成项目检查报告的完整功能测试。

## Implementation Context (§11)
```json
{
  "implementation_context": {
    "task_summary": "按课程卡片管理持久化 TODO；主页一览、课程面板、扩展弹窗共享数据。标准规划，本轮不实现功能。",
    "evidence_provenance": {
      "schema_version": 2,
      "head_commit": "79a22c58dd180e564d2c777f9b0fb988e94c977d",
      "generated_plan_path": "docs/plans/2026-10-01-gitnexus-plan-persistent-course-todo.md",
      "global_dirty_digest": {
        "algorithm": "sha256",
        "canonicalization": "gitnexus-evidence-provenance-v2 NUL-framed UTF-8 records",
        "value": "c2ee5991fd0aa17007564567b53636a12152cfea9bda75d398e323d970e70b16"
      },
      "cited_path_manifest": [
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
          "head_digest": "sha256:79940b08f498d2b9e2442802162c93df9f6006e6c1c6274fe74f0fd41ad638bb",
          "index_digest": "sha256:79940b08f498d2b9e2442802162c93df9f6006e6c1c6274fe74f0fd41ad638bb",
          "worktree_digest": "sha256:79940b08f498d2b9e2442802162c93df9f6006e6c1c6274fe74f0fd41ad638bb",
          "untracked_digest": "absent"
        },
        {
          "path": "output/course-todo-design.html",
          "object_kind": {
            "head": "absent",
            "index": "absent",
            "worktree": "absent",
            "untracked": "regular"
          },
          "state": "untracked",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "absent",
          "index_digest": "absent",
          "worktree_digest": "absent",
          "untracked_digest": "sha256:d18b08cc3de21b937956438e46ac1ccf596beb5bfadaeebe69843e4739979787"
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
          "head_digest": "sha256:221fb9356f84e18451364050cbf5caa7d6d5bdd09214befbea159237f5e7738b",
          "index_digest": "sha256:221fb9356f84e18451364050cbf5caa7d6d5bdd09214befbea159237f5e7738b",
          "worktree_digest": "sha256:221fb9356f84e18451364050cbf5caa7d6d5bdd09214befbea159237f5e7738b",
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
          "path": "scripts/verify-audit-popup-regressions.mjs",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:5c63dec69b967008e8db18a1272ddfccb1d6d60cfcf177644731efbd918460f1",
          "index_digest": "sha256:5c63dec69b967008e8db18a1272ddfccb1d6d60cfcf177644731efbd918460f1",
          "worktree_digest": "sha256:5c63dec69b967008e8db18a1272ddfccb1d6d60cfcf177644731efbd918460f1",
          "untracked_digest": "absent"
        },
        {
          "path": "scripts/verify-home-week-window-schedule.mjs",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:ef7da22a65374bf615e6e0ca11181ce9021a0346986f4ffbcd549c037be82b2e",
          "index_digest": "sha256:ef7da22a65374bf615e6e0ca11181ce9021a0346986f4ffbcd549c037be82b2e",
          "worktree_digest": "sha256:ef7da22a65374bf615e6e0ca11181ce9021a0346986f4ffbcd549c037be82b2e",
          "untracked_digest": "absent"
        },
        {
          "path": "src/background/service-worker.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:b08934342271c93bedbe36314503e0c084bc8d523b8b219b697955fe3fc06228",
          "index_digest": "sha256:b08934342271c93bedbe36314503e0c084bc8d523b8b219b697955fe3fc06228",
          "worktree_digest": "sha256:b08934342271c93bedbe36314503e0c084bc8d523b8b219b697955fe3fc06228",
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
          "head_digest": "sha256:7ddab835a83321a8e2ca6dc827e324d7429cb2c1f0c043b2fe538e6467f33902",
          "index_digest": "sha256:7ddab835a83321a8e2ca6dc827e324d7429cb2c1f0c043b2fe538e6467f33902",
          "worktree_digest": "sha256:7ddab835a83321a8e2ca6dc827e324d7429cb2c1f0c043b2fe538e6467f33902",
          "untracked_digest": "absent"
        },
        {
          "path": "src/content/parsers/home.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:46780da96472bddfd13432220ec7f29560719f61cd3400a6eae758d7adb4f385",
          "index_digest": "sha256:46780da96472bddfd13432220ec7f29560719f61cd3400a6eae758d7adb4f385",
          "worktree_digest": "sha256:46780da96472bddfd13432220ec7f29560719f61cd3400a6eae758d7adb4f385",
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
          "head_digest": "sha256:ee1005ed669ef1f3c9e44d3b0c323f65a876ab79bae1adaed54a47c02ebd4500",
          "index_digest": "sha256:ee1005ed669ef1f3c9e44d3b0c323f65a876ab79bae1adaed54a47c02ebd4500",
          "worktree_digest": "sha256:ee1005ed669ef1f3c9e44d3b0c323f65a876ab79bae1adaed54a47c02ebd4500",
          "untracked_digest": "absent"
        },
        {
          "path": "src/content/render/shared.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:3e957af3ca0f6a3b6a31d196ffab31463ca5c5f9adf971f02a5e0bbd41230e8d",
          "index_digest": "sha256:3e957af3ca0f6a3b6a31d196ffab31463ca5c5f9adf971f02a5e0bbd41230e8d",
          "worktree_digest": "sha256:3e957af3ca0f6a3b6a31d196ffab31463ca5c5f9adf971f02a5e0bbd41230e8d",
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
          "path": "src/popup/popup.css",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:726824e601ba88a6ef71ee4dc570ddf4872febed1557bc594d0d90b45e2900b7",
          "index_digest": "sha256:726824e601ba88a6ef71ee4dc570ddf4872febed1557bc594d0d90b45e2900b7",
          "worktree_digest": "sha256:726824e601ba88a6ef71ee4dc570ddf4872febed1557bc594d0d90b45e2900b7",
          "untracked_digest": "absent"
        },
        {
          "path": "src/popup/popup.html",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:d5ca4a6048f548d3e46e5a74fb218ee35e3c1a22ed759373ec93c08fe2bc52c0",
          "index_digest": "sha256:d5ca4a6048f548d3e46e5a74fb218ee35e3c1a22ed759373ec93c08fe2bc52c0",
          "worktree_digest": "sha256:d5ca4a6048f548d3e46e5a74fb218ee35e3c1a22ed759373ec93c08fe2bc52c0",
          "untracked_digest": "absent"
        },
        {
          "path": "src/popup/popup.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:2957787c6b21c9ce2ebeb18d2098a246c8db4c4937f69498d0e5f6d6f25f78a3",
          "index_digest": "sha256:2957787c6b21c9ce2ebeb18d2098a246c8db4c4937f69498d0e5f6d6f25f78a3",
          "worktree_digest": "sha256:2957787c6b21c9ce2ebeb18d2098a246c8db4c4937f69498d0e5f6d6f25f78a3",
          "untracked_digest": "absent"
        },
        {
          "path": "src/shared/settings.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:38d9b0b1526d9866a9753d042770a98de4e069c083c9fd3bcbe91d3950d891c7",
          "index_digest": "sha256:38d9b0b1526d9866a9753d042770a98de4e069c083c9fd3bcbe91d3950d891c7",
          "worktree_digest": "sha256:38d9b0b1526d9866a9753d042770a98de4e069c083c9fd3bcbe91d3950d891c7",
          "untracked_digest": "absent"
        }
      ]
    },
    "files_to_modify": [
      {
        "file": "manifest.json",
        "intended_change": "加载新共享脚本与首页 TODO 服务，保持脚本顺序"
      },
      {
        "file": "src/background/service-worker.js",
        "intended_change": "增加独立 TODO 消息路由与串行写入入口"
      },
      {
        "file": "src/content/render/shared.js",
        "intended_change": "renderScheduleCard 添加操作区"
      },
      {
        "file": "src/content/render/home.js",
        "intended_change": "renderHome 增加一览；renderHomeOtherCourses 添加入口"
      },
      {
        "file": "src/content/critical.css",
        "intended_change": "操作区、课程面板、响应式布局"
      },
      {
        "file": "src/popup/popup.html",
        "intended_change": "TODO/设置双页"
      },
      {
        "file": "src/popup/popup.css",
        "intended_change": "400px 左右弹窗与列表布局"
      },
      {
        "file": "src/popup/popup.js",
        "intended_change": "initPopup 初始化 TODO，保留设置流程"
      },
      {
        "file": "src/shared/todo-client.js (new)",
        "intended_change": "消息协议、订阅、错误分类"
      },
      {
        "file": "src/background/todo-store.js (new)",
        "intended_change": "版本化持久化、冲突与幂等、草稿、备份导入导出"
      },
      {
        "file": "src/content/services/todo.js (new)",
        "intended_change": "课程目录增量登记、页面绑定与面板交互"
      }
    ],
    "tests": [
      {
        "file": "scripts/verify-todo-store.mjs (new)",
        "scenarios": [
          "并发更新不同项不丢数据",
          "相同项版本冲突保留输入",
          "重试操作不重复创建",
          "worker 重启恢复",
          "quota/读取错误不写空库",
          "导入损坏数据不覆盖",
          "删除可恢复与升级迁移"
        ]
      },
      {
        "file": "scripts/verify-todo-ui.mjs (new)",
        "scenarios": [
          "三入口同步",
          "课程 key 排除 acs_",
          "跨周/学期不删除",
          "草稿恢复",
          "XSS 转义",
          "长期未访问课程仍可编辑"
        ]
      },
      {
        "file": "scripts/verify-audit-popup-regressions.mjs",
        "scenarios": [
          "TODO 初始化失败仍可使用设置",
          "原有设置保存和账号行为不回归"
        ]
      },
      {
        "file": "scripts/verify-home-week-window-schedule.mjs",
        "scenarios": [
          "长标题、三个标记同时显示",
          "五天五节布局保持",
          "小屏不遮挡按钮"
        ]
      }
    ],
    "verification_commands": [
      "npm test",
      "node scripts/verify-todo-store.mjs (新增后)",
      "node scripts/verify-todo-ui.mjs (新增后)",
      "GitNexus detect_changes(scope=all) before index refresh",
      "gitnexus analyze after validation (escalate if needed)"
    ],
    "pdg_constraints": [],
    "assumptions": [
      "当前一个浏览器配置文件使用一个本地 TODO 工作区；不能用显示姓名或设置用户名直接判定当前登录身份。实现前核实稳定账号 ID；如不可得，明确本地资料选择，不自动把新账号归入旧账号。",
      "本地持久化不等于卸载后恢复；外部导出备份是恢复来源。",
      "首次课程目录来自当前实际读取页面；未访问学期不会凭空出现课程。"
    ],
    "open_questions": [
      "是否需要跨设备自动同步？首版暂不包含。",
      "生产版单课程面板推荐抽屉；草案使用内嵌面板展示相同内容。"
    ],
    "avoid": [
      "不修改 LMS 服务端，不抓取所有课程来建立目录",
      "不存储带 acs_ 的课程链接或账号密码到 TODO 备份",
      "不复用 sessionStorage 缓存，不设 TODO TTL，不按当前课表覆盖目录",
      "读取失败不得回写空库；不得默认成功",
      "不把图谱低影响或空边当作无风险；实施前重做 impact",
      "不提交或部署本轮设计"
    ]
  }
}
```

## Assumptions and Open Questions (§12)
- [assumed] 首版为当前浏览器本地持久化加手动导出恢复，无跨设备自动同步；同步可后续设计，不能拿 storage.sync 直接替代冲突处理。
- [verified] 现有缓存使用显示姓名隔离，不是可靠账号主键；实际页面未发现 hidden user/account/student 标识。[assumed] 实施前核实稳定 ID；无法确认时明确本地工作区选择，不猜身份、不用已保存用户名代表当前登录者，不删除旧工作区。
- [assumed] 首次只登记读到的课程，未访问学期需要用户访问后加入目录；首版不自动巡回访问全部课程。
- [inferred] 卸载后无外部备份不能承诺恢复；更新/刷新中的代码迁移也必须实测。自动云同步、附件、提醒推送、逐次授课分组明确延后。

## Definition of Done (§13)
三个入口对同一课程共享 CRUD 与计数；确认保存的数据经关闭/重启/换学期不丢；冲突和失败不静默覆盖；误删可恢复、导出可还原；设置/シ/截止提醒不回归；无课程标题或 acs_ 身份混淆；测试、完整图变更检查和索引刷新完成。
