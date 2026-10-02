# 当前课程页常驻 TODO 面板开发计划

> 标准版。用户最终选择：页面内始终展开的 TODO 面板，并压缩 timeline；计划及后续开发均不得自动 commit，也不自动暂存或推送。
> Evidence verified at commit 5c00423401a7ab9e0038d2c31c751c97e777c661（main）。GitNexus 1.6.12 索引位于 06cc6f2；与当前提交相比仅 AGENTS.md、CLAUDE.md 不同，相关功能源码一致；freshness:accept，本轮不刷新索引。
> Evidence provenance schema 2；global dirty digest 0a9c85780067d9afcd0764f307b60891e3cee927ee11eaeb5ec7826d10fd82cd；18 个排序引用路径；仅排除本计划路径。

## Objective (§1)

将课程教材页左栏改为“上方当前课程 TODO、下方紧凑 timeline”。TODO 列表、新增入口和就地编辑始终作为页面内容展开；列表与写入都限定当前课程，不显示课程选择下拉。复用现有 TODO 数据、本地持久化和 Google 同步。

## Current Behaviour (§2–3)

- [verified] `src/content/render/course.js:3` 的 `renderCourseMaterials` 输出左 timeline、中间课题、右目录三个区域；`src/content/critical.css:1038` 的列宽为 320px／弹性正文／260px，`:2418` 起在 1180px 以下改为单列。
- [verified] 实际课程页顶栏为 sticky，timeline 和右目录处于普通流；左栏适合重新分配现有空间，而不用缩窄中间的课题正文。
- [verified] `src/content/services/todo.js:12` 的 `kuBindTodos` 只支持主页，并通过 `kuOpenTodoDialog` 打开抽屉；本次新增课程内嵌控制器，保留主页控制器的职责。
- [verified] `src/shared/todo-ui.js:3` 的 `mount` 接受 courseKey，但仅设置初始 selected；有筛选课程、编辑器课程两个 select，草稿过滤只看 courseScope。Serena 确认 `saveDraft`（`:114`）会从编辑器 select 重新赋值 courseKey，不能只隐藏下拉框。
- [verified] `src/background/todo-store.js:160` 的 catalog 支持 setScope:false；`src/shared/todo-client.js` 提供现有请求与存储订阅；可直接登记当前课程而不替换主页的学期范围。
- [verified] `src/content/runtime/boot-kulms.js:141` 的 rerender 会替换整个 root.innerHTML；内嵌编辑器必须跨同课重绘复用真实 DOM，否则会丢失输入和焦点。

## Findings (§4–5)

- [graph] `impact(renderCourseMaterials, upstream, depth:2)` 为 LOW，d=1 为 `renderPage`，涉及 2 个流程；课程材料渲染与已有课题状态标签纳入回归。
- [graph] `impact(bindInteractiveHandlers, upstream, depth:2)` 为 **HIGH**，d=1 为 `rerender`，涉及 3 个流程；增加挂载钩子必须配对清理并防止每次重绘重复挂载。
- [graph/source] `impact(KuTodoUI.mount)` 为 UNKNOWN；源码确认主页抽屉 `services/todo.js:123`、扩展弹窗 `src/popup/todo-popup.js:10` 和相关测试都在调用。固定课程模式应是可选参数，默认调用语义保持兼容。
- [graph/source] trace 未找到主页抽屉到编辑器的调用路径，PDG selected 查询也未给出可用语句锚点；实际调用、课程取值和保存约束由源码与 Serena 核实，不把空结果视作无影响证明。

## Proposed Changes (§6)

页面布局：保留现有三列宽度；左侧新容器内堆叠两个卡片，上方 TODO 获得主要空间，下方 timeline 限制为约 160–200px 的最大高度。时间线无活动时自动收紧，所有活动保留在内部滚动区域，不按数量删除。TODO 不设收起开关，不使用抽屉、遮罩或悬浮启动按钮。
宽屏左侧容器 align-self:start 并吸顶到导航栏下方，整体高度受视口约束；TODO 内容区与 timeline 分别滚动，标题和新增入口易于访问。空间不足或进入 1180px 单列布局时取消吸顶，TODO 保持展开并排在课题正文之前；编辑区可滚动访问全部输入和保存按钮。
TODO 面板显示“TODO · 未完成数”、当前课程名、未完成／已完成／回收站、新增、列表与本课草稿；点击条目在面板内编辑。0 条时仍显示面板和新增入口。固定模式移除筛选区及编辑表单中的两个课程 select，资料名称只读；资料切换／创建和整库备份使用已有全局入口。

| 文件／入口 | 计划改动 |
| --- | --- |
| `src/content/render/course.js`：`renderCourseMaterials` | 把原 timeline 区包进新的左侧容器，在其上方放置 TODO 卡片和编辑器挂载槽；timeline 内容区增加独立滚动容器，保留活动文字、链接、空态和错误态。 |
| 新建 `src/content/services/course-todo.js`（拟建） | 独立维护当前课程的内嵌编辑器，使用规范 courseKey、active workspace 和现有 KuTodoClient；缺少课程目录时 catalog(setScope:false)，再挂载编辑器。通过既有订阅／onUpdate 更新计数，避免重绘整个课程正文。 |
| `src/shared/todo-ui.js`：`KuTodoUI.mount` 内 `scopedCourses`、`accept`、`render`、`start`、`saveDraft`、`submit` | 增加可选 fixedCourseKey（拟定 API），让过滤、草稿、编辑目标和写入 payload 都绑定此 key。固定模式直接从模型取课程，移除两个 select 后不再读取它们；资料／范围变化、selected 清空都不能退回其他课程。 |
| `src/shared/todo-ui.js`：渲染、事件注册和返回的 selectCourse／setScope | 固定模式不渲染课程切换控件、重复课程切换按钮和全局资料／备份管理控件；外部 selectCourse/setScope 不能解除固定课程。主页和扩展弹窗仍用默认模式。 |
| `src/content/hydrate/shared.js`：`bindInteractiveHandlers`、`cleanupRouteHydration`；`manifest.json` | 在 LMS 入口加载新控制器，增加课程面板挂载／清理钩子；同课重绘把已挂载 host 移回新槽位，保留输入、光标与滚动位置；切课／退出销毁实例和订阅并拒绝晚到响应。 |
| `src/content/critical.css` | 左栏卡片布局、吸顶及高度预算，TODO 与 timeline 滚动边界，长课程名与 320px 窄屏布局；沿用现有 TODO 组件样式。 |
| `scripts/verify-todo-ui.mjs`、`scripts/verify-todo-course-scope.mjs`；新建 `scripts/verify-course-todo-panel.mjs`（拟建） | 验证真正的课程锁定、课程直接进入、内嵌 DOM 保留、数据更新与页面生命周期，并覆盖时间线和既有入口的回归。 |

当前课程的普通 TODO 沿用现有新增、编辑、完成／撤销、删除／恢复、草稿与搜索；不把课题手动完成记录混入 TODO 计数。无需新增数据库、存储版本迁移或另一套 Google 同步。

## Implementation Sequence (§7)

1. 在 main 工作区重新核实待改符号的 GitNexus impact 和 Serena 引用；保留其他用户改动。不得自动创建分支、暂存、commit 或 push。
2. 先实现共享编辑器的固定课程模式和单元／DOM 测试，保证所有读取与保存路径使用同一 courseKey，移除下拉框后不产生空节点取值错误。
3. 实现课程控制器：从 view.course.course 解析身份，读取资料、登记当前课程并以内嵌模式挂载；即使未先访问主页也可新增，catalog 不改变主页的 courseScope。
4. 调整左栏：TODO 常时展开，timeline 置于下方并限高；宽屏吸顶，窄屏正常流布局。保留时间线内容及课题完成标签、詳細等原交互。
5. 完成重绘和异步保护：同课保留 host／编辑器，切课隔离 A／B 的草稿与回调；外部资料切换时保持课程固定，保留旧资料的输入并阻止误保存；课题状态更新不应销毁 TODO 编辑区。
6. 运行针对性测试和 npm test，做浏览器滚动／编辑验收，完整 detect_changes(scope:all) 后更新索引。交付工作区差异及验证结果；用户“不 commit”指令覆盖技能的默认提交步骤。

## Test Strategy (§8)

- A 课程只显示 A 的待办、已完成、回收站和草稿；两个课程 select 均不存在。模拟 selectCourse(B)、setScope(B)、不同资料及旧草稿恢复，确保不会显示／修改 B 数据。
- 首次直接进入课程、目录缺失、0 条、多条、同名不同 courseKey、URL 会话参数变化；验证 catalog(setScope:false)、主页范围不变及计数不含课题完成记录。
- 新增／编辑／完成／撤销／删除／恢复，输入后立即导航、保存失败、丢失响应重试；同课 rerender 不重置 textarea 或重复订阅，切课与退出后的迟到结果不会恢复旧面板或写错课程。
- 长 TODO、长课程名、输入法组合态、外部同步更新以及同时更新课题完成标签；确认内嵌编辑不中断。资料切换时旧草稿仍属于原资料，不迁移到当前资料。
- 浏览器验收：普通及长课程页滚动、timeline 0／少／大量活动、所有时间线链接可访问、低高度视口、1180px 临界宽度和 320px 窄屏；面板始终展开，正文无被遮挡的操作，Tab 和键盘滚动可用。
- 命令：node scripts/verify-todo-ui.mjs、node scripts/verify-todo-course-scope.mjs、node scripts/verify-task-completion.mjs、npm test。`scripts/verify-all.mjs:5` 会自动发现新增 verify 脚本。本轮不运行会生成报告的测试，不声称新功能已实现或验证通过。

## Implementation Context (§11)

```json
{
  "implementation_context": {
    "task_summary": "课程教材页左栏上方始终展开当前课程 TODO，压缩下方 timeline；无课程下拉，复用持久化与 Google 同步；计划及开发不自动 commit。",
    "files_to_modify": [
      {
        "file": "src/content/render/course.js",
        "symbols": [
          "renderCourseMaterials"
        ],
        "intended_change": "左侧容器：TODO 内嵌槽位置顶，timeline 限高滚动"
      },
      {
        "file": "src/content/services/course-todo.js",
        "symbols": [],
        "new": true,
        "intended_change": "课程内嵌控制器：身份/资料/目录登记，挂载、计数、DOM 保留、异步及清理"
      },
      {
        "file": "src/shared/todo-ui.js",
        "symbols": [
          "KuTodoUI.mount",
          "scopedCourses",
          "accept",
          "render",
          "start",
          "saveDraft",
          "submit",
          "selectCourse",
          "setScope"
        ],
        "intended_change": "可选 fixedCourseKey；移除固定模式的课程选择与全局管理控件，所有操作锁定当前课程"
      },
      {
        "file": "src/content/hydrate/shared.js",
        "symbols": [
          "bindInteractiveHandlers",
          "cleanupRouteHydration"
        ],
        "intended_change": "挂载和清理新课程控制器"
      },
      {
        "file": "manifest.json",
        "symbols": [],
        "intended_change": "仅 LMS 内容脚本入口加载新课程控制器"
      },
      {
        "file": "src/content/critical.css",
        "symbols": [],
        "intended_change": "左栏吸顶、TODO 主空间、紧凑 timeline、独立滚动及响应式"
      }
    ],
    "tests": [
      {
        "file": "scripts/verify-course-todo-panel.mjs",
        "new": true,
        "scenarios": [
          "首次直接打开当前课程，无需先访问主页即可登记并新增",
          "左栏 TODO 始终展开，timeline 完整可滚动",
          "0 条、加载失败与重试、真实未完成数",
          "同课重绘保留 DOM、输入、光标及滚动",
          "切课/资料变化/卸载/迟到响应不串课",
          "不改变主页 courseScope",
          "课题完成状态更新不会重建 TODO 编辑器"
        ]
      },
      {
        "file": "scripts/verify-todo-ui.mjs",
        "scenarios": [
          "固定模式移除两个课程 select",
          "新增/编辑/草稿始终写固定 courseKey",
          "固定模式隐藏整库管理而默认模式保留",
          "丢失响应、保存失败及草稿恢复",
          "默认主页抽屉/扩展弹窗兼容"
        ]
      },
      {
        "file": "scripts/verify-todo-course-scope.mjs",
        "scenarios": [
          "列表/已完成/回收站/草稿按固定课程隔离",
          "外部 selectCourse/setScope 不能解锁",
          "不同学期的当前课程也能单独编辑",
          "资料切换后不把原草稿写入新资料",
          "catalog setScope:false 保留主页范围"
        ]
      },
      {
        "file": "scripts/verify-task-completion.mjs",
        "scenarios": [
          "上一项课题状态功能继续通过，TODO 数量与课题状态分离"
        ]
      }
    ],
    "verification_commands": [
      "node scripts/verify-todo-ui.mjs",
      "node scripts/verify-todo-course-scope.mjs",
      "node scripts/verify-task-completion.mjs",
      "npm test",
      "node .gitnexus/run.cjs detect-changes --scope all --repo .",
      "node .gitnexus/run.cjs analyze --index-only --pdg --embeddings"
    ],
    "assumptions": [
      "落点是当前具有 timeline 的 course-materials 页面；实现时核对 route 和 view.course.course",
      "宽屏左栏吸顶；1180px 以下单列时取消吸顶但面板不收起；高度根据实际视口验收",
      "复用当前资料及 Google 绑定；课程面板只读显示资料名，全局资料/备份管理通过已有入口",
      "相关源码与索引 pin 一致但提交历史不同，实施前按当前源码核查图及语义引用"
    ],
    "open_questions": [
      "TODO 与 timeline 最终高度随长内容、编辑态和小高度屏幕微调，timeline 最大约160–200px、空状态自动收紧",
      "全局对象调用的图/Serena引用有遗漏，mount UNKNOWN 和空 trace/PDG 结果不能作安全证明"
    ],
    "avoid": [
      "用户明确要求：计划及开发均不得自动 git commit；不自动 git add/push 或创建分支",
      "不要实现抽屉或悬浮入口；TODO 在页面上始终展开",
      "不得只隐藏 select 而仍从它读取目标课程",
      "不要把当前课程登记写成全局 courseScope 的替换",
      "不要因同课 rerender 销毁编辑器、丢失输入或重复订阅",
      "切课或切换资料时不把旧草稿迁移到新对象",
      "不将课题完成状态并入普通 TODO 列表和计数",
      "不引入另一套存储或 Google 同步",
      "本轮只发布计划，不修改功能代码或测试"
    ],
    "evidence_provenance": {
      "schema_version": 2,
      "head_commit": "5c00423401a7ab9e0038d2c31c751c97e777c661",
      "generated_plan_path": "docs/plans/2026-10-02-gitnexus-plan-course-todo-panel.md",
      "global_dirty_digest": {
        "algorithm": "sha256",
        "canonicalization": "gitnexus-evidence-provenance-v2 NUL-framed UTF-8 records",
        "value": "0a9c85780067d9afcd0764f307b60891e3cee927ee11eaeb5ec7826d10fd82cd"
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
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:5168c8894477e24ec88d835bb7187997e647d552e3bd24c8f1f819279d3521d8",
          "index_digest": "sha256:5168c8894477e24ec88d835bb7187997e647d552e3bd24c8f1f819279d3521d8",
          "worktree_digest": "sha256:5168c8894477e24ec88d835bb7187997e647d552e3bd24c8f1f819279d3521d8",
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
          "head_digest": "sha256:5f6669a2285f0f67d2ef907dbd13181d7ba933c343daab41c26ec3ae7548b2b8",
          "index_digest": "sha256:5f6669a2285f0f67d2ef907dbd13181d7ba933c343daab41c26ec3ae7548b2b8",
          "worktree_digest": "sha256:5f6669a2285f0f67d2ef907dbd13181d7ba933c343daab41c26ec3ae7548b2b8",
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
          "path": "scripts/verify-task-completion.mjs",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:a2307b16be71942fbb049baa7409c620b46fdc993b198fd9f0421ad2678aa0eb",
          "index_digest": "sha256:a2307b16be71942fbb049baa7409c620b46fdc993b198fd9f0421ad2678aa0eb",
          "worktree_digest": "sha256:a2307b16be71942fbb049baa7409c620b46fdc993b198fd9f0421ad2678aa0eb",
          "untracked_digest": "absent"
        },
        {
          "path": "scripts/verify-todo-course-scope.mjs",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:4a3ea3b24ae085aa7487e18125e75b95b6fd82217a566c807c8fa60ab3d8775c",
          "index_digest": "sha256:4a3ea3b24ae085aa7487e18125e75b95b6fd82217a566c807c8fa60ab3d8775c",
          "worktree_digest": "sha256:4a3ea3b24ae085aa7487e18125e75b95b6fd82217a566c807c8fa60ab3d8775c",
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
          "head_digest": "sha256:4b0ea3b115cb19c67e11d0f52924fb2bf547c06bd5c5d65a4a8224b935bbdd6f",
          "index_digest": "sha256:4b0ea3b115cb19c67e11d0f52924fb2bf547c06bd5c5d65a4a8224b935bbdd6f",
          "worktree_digest": "sha256:4b0ea3b115cb19c67e11d0f52924fb2bf547c06bd5c5d65a4a8224b935bbdd6f",
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
          "head_digest": "sha256:a266181167513fbe04775b902249a3f82ef09d63ec462b45476839eb8a3caa27",
          "index_digest": "sha256:a266181167513fbe04775b902249a3f82ef09d63ec462b45476839eb8a3caa27",
          "worktree_digest": "sha256:a266181167513fbe04775b902249a3f82ef09d63ec462b45476839eb8a3caa27",
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
          "head_digest": "sha256:b15be2ee50c441878d6beed18d9bd36b83f479a4e82bb5c2f7dcdf4b3a281da5",
          "index_digest": "sha256:b15be2ee50c441878d6beed18d9bd36b83f479a4e82bb5c2f7dcdf4b3a281da5",
          "worktree_digest": "sha256:b15be2ee50c441878d6beed18d9bd36b83f479a4e82bb5c2f7dcdf4b3a281da5",
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
          "head_digest": "sha256:36be8be4fb211762969c3ee1586ea2aca76a81a8dfa295b9edc46d353def8c01",
          "index_digest": "sha256:36be8be4fb211762969c3ee1586ea2aca76a81a8dfa295b9edc46d353def8c01",
          "worktree_digest": "sha256:36be8be4fb211762969c3ee1586ea2aca76a81a8dfa295b9edc46d353def8c01",
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
          "head_digest": "sha256:607cdf296755b8ec381295f42be5425ee5cc0628c093296a09593460dd1c6cee",
          "index_digest": "sha256:607cdf296755b8ec381295f42be5425ee5cc0628c093296a09593460dd1c6cee",
          "worktree_digest": "sha256:607cdf296755b8ec381295f42be5425ee5cc0628c093296a09593460dd1c6cee",
          "untracked_digest": "absent"
        },
        {
          "path": "src/content/services/task-completion.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:aa5a64088478952beacde315844c259498ca8e306fec7c1fe747c4b33eac16a7",
          "index_digest": "sha256:aa5a64088478952beacde315844c259498ca8e306fec7c1fe747c4b33eac16a7",
          "worktree_digest": "sha256:aa5a64088478952beacde315844c259498ca8e306fec7c1fe747c4b33eac16a7",
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
          "path": "src/popup/todo-popup.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:996081cbe0b4d5accec235ecdfe41926b93efa8f057644735d71874b3c91cd37",
          "index_digest": "sha256:996081cbe0b4d5accec235ecdfe41926b93efa8f057644735d71874b3c91cd37",
          "worktree_digest": "sha256:996081cbe0b4d5accec235ecdfe41926b93efa8f057644735d71874b3c91cd37",
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
          "path": "src/shared/todo-ui.css",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:699d62c072c5a547e737b76d193121b312e40e38663b08100a43a9880f59904a",
          "index_digest": "sha256:699d62c072c5a547e737b76d193121b312e40e38663b08100a43a9880f59904a",
          "worktree_digest": "sha256:699d62c072c5a547e737b76d193121b312e40e38663b08100a43a9880f59904a",
          "untracked_digest": "absent"
        },
        {
          "path": "src/shared/todo-ui.js",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:cdd1f6367cbbb03b766b7bec36500f221f2742c540dbb2bb2373f466fa483a5e",
          "index_digest": "sha256:cdd1f6367cbbb03b766b7bec36500f221f2742c540dbb2bb2373f466fa483a5e",
          "worktree_digest": "sha256:cdd1f6367cbbb03b766b7bec36500f221f2742c540dbb2bb2373f466fa483a5e",
          "untracked_digest": "absent"
        }
      ]
    }
  }
}
```

## Assumptions and Open Questions (§12)

- [user requirement] 当前方案是页面内始终展开的 TODO，并压缩 timeline；不是抽屉或悬浮入口。具体高度以实际视口验收微调，TODO 优先，timeline 内容不丢失。
- [assumed] 落点为具有 timeline 的课程教材页；宽屏左栏吸顶，窄屏按单列流式排列但不收起。使用当前本地资料及其 Google 绑定，资料管理保留在既有全局入口。
- [graph] 索引提交 pin 与当前历史不同，但相关代码经 diff 确认一致；全局对象／回调的静态关联仍有遗漏，UNKNOWN、no_path、空 PDG 结果不能当作安全证明。
- [user requirement] 计划和后续开发均不自动 commit，也不自动暂存、推送；无需再次请求提交许可。

## Definition of Done (§13)

课程教材页的左栏上方始终展开当前课程 TODO，下方 timeline 紧凑且完整可滚动；可就地查看、增改和管理当前课程待办，无课程下拉、串课或重绘丢输入；本地保存和原同步链路正常，默认主页／扩展弹窗回归通过。交付保持为工作区改动，不产生提交。
