# KU-LMS 现有离线验证基线（2026-09-30）

本次共有 23 个 `scripts/verify-*.mjs`：11 个通过、12 个失败、0 个超时。此数量是既有测试基线，不是扩展 bug 数量。失败原因均定位在当前验证脚本的可复现性或过时契约；通过也不能证明当前 LMS 网站适配完整。

完整命令、exit code、stdout/stderr、失败分类与证据来源见 `artifacts/audit-2026-09-30/checks.json`。本审查者新执行剩余 14 个（6 通过、8 失败）；此前 services/render 审查者已经执行的 9 个只合并已有记录，没有重复运行。

## 安全与执行范围

运行前已检查剩余脚本及 `scripts/lib/content-source.mjs`：读取本地 manifest、源代码、文档与历史 fixture；采用 Node VM 隔离和模拟 window/chrome/storage/navigation；整段 source 执行移除了 `main.js` boot 入口。四个脚本调用 `execFileSync('python', ...)`，仅使用 pathlib/BeautifulSoup 解析本地 fixture，没有网络客户端或浏览器连接。

实际执行仅为 `node scripts/<name>.mjs` 子进程，60 秒超时；没有打开浏览器、发起真实 LMS 请求或表单提交，也没有安装依赖、补造缺失文档或改动脚本。原验证器按自己的 helper 生成少量 `.omx/artifacts` JSON。历史 fixture 只作为这些脚本的测试输入，不当作当前网站证据。

## 全部结果

| 验证脚本（均在 scripts/） | 结果 | 首个失败原因 / 说明 | 本次执行者 |
| --- | --- | --- | --- |
| verify-content-load-order-smoke.mjs | 通过 | — | course |
| verify-content-modularization-baseline.mjs | 失败 | 过时的 `bootKulms();` 字面量要求 | course |
| verify-content-parsers-contract.mjs | 通过 | — | course |
| verify-content-render-hydrate-contract.mjs | 通过 | — | render（未重跑） |
| verify-content-services-safety-contract.mjs | 通过 | — | services（未重跑） |
| verify-content-syllabus-contract.mjs | 失败 | 过时的 `bootSyllabus();` 字面量要求 | course |
| verify-course-grades-tabs.mjs | 通过 | — | course |
| verify-course-title-syllabus-normalization.mjs | 失败 | 缺少个人 `.omx/plans` PRD | course |
| verify-deadlines-syllabus-session-safety.mjs | 失败 | 过时的副作用抑制 helper 名称要求 | services（未重跑） |
| verify-extension-settings-autologin.mjs | 通过 | — | services（未重跑） |
| verify-home-all-upcoming-assignments-page.mjs | 通过 | — | course |
| verify-home-notice-card-parity.mjs | 通过 | — | course |
| verify-home-refresh-login-loop-safety.mjs | 失败 | VM 缺少 `buildAllUpcomingUrl` 依赖 | services（未重跑） |
| verify-home-safe-refresh-deadlines.mjs | 通过 | — | course |
| verify-home-upcoming-session-safety.mjs | 通过 | — | services（未重跑） |
| verify-login-page-redesign.mjs | 失败 | 缺少个人 `.omx/plans` PRD | render（未重跑） |
| verify-logout-page-redesign.mjs | 失败 | 缺少个人 `.omx/plans` PRD | render（未重跑） |
| verify-message-context-navigation-contract.mjs | 失败 | 本地 Python 缺少 `bs4` | course |
| verify-message-detail-outbox-layout.mjs | 失败 | 缺少个人 `.omx/plans` PRD | course |
| verify-message-detail-subtitle-guardrail.mjs | 失败 | 缺少个人 `.omx/plans` PRD | course |
| verify-notice-messages-outbox-recyclebox-redesign.mjs | 失败 | 缺少个人 `.omx/plans` PRD | course |
| verify-review-followups.mjs | 失败 | 缺少个人 `.omx/plans` PRD | course |
| verify-syllabus-detail-redesign.mjs | 通过 | — | render（未重跑） |

## 失败根因

### 3 个过时的源码字面量契约

- `verify-content-modularization-baseline.mjs:29` 要求 main.js 包含 `bootKulms();`，当前 `src/content/main.js:6` 是有效的 `bootKulms().catch(...)`。验证器误把增加 Promise 拒绝处理视为不再调用。其 syllabus bootstrap 对应断言（34）也过时，但执行在 main 断言先失败。
- `verify-content-syllabus-contract.mjs:11` 同样要求 `bootSyllabus();`；当前 `src/content/syllabus-main.js:6` 是 `bootSyllabus().catch(...)`。本次失败不证明启动调用消失。
- 既有 `verify-deadlines-syllabus-session-safety.mjs:13` 要求 builder 直接包含 `shouldSuppressRefreshSideEffects`；当前 `boot-kulms.js:405` 调用 `shouldSuppressCourseTraversalSideEffects`，`services/refresh.js:263-265` 合并 refresh 与 all-upcoming 的抑制。证据来自 services 审查及本次源码核对。

### 7 个缺失的个人计划文档

这些脚本在运行实际行为断言之前读取个人 `.omx/plans` 文档，本 checkout 缺失，触发 ENOENT：

- `verify-course-title-syllabus-normalization.mjs:8`：`prd-ku-lms-course-title-syllabus-normalization.md`。
- `verify-message-detail-outbox-layout.mjs:11` 和 `verify-message-detail-subtitle-guardrail.mjs:9`：`prd-ku-lms-message-detail-subtitle-guardrail.md`。
- `verify-notice-messages-outbox-recyclebox-redesign.mjs:10`：`prd-ku-lms-notice-detail-outbox-recyclebox-redesign.md`。
- `verify-review-followups.mjs:7`：`prd-ku-lms-review-followups.md`。
- 既有 login/logout redesign 验证器：`prd-ku-lms-login-page-redesign.md`、`prd-ku-lms-logout-page-redesign.md`。见 `audit-2026-09-30-render.md:125-126`。

后续应将真正必要的行为约束放在仓库内稳定 fixture/契约中；个人计划文档的存在不应成为解析与渲染测试的前置条件。

### 1 个 Python 环境依赖缺失

`verify-message-context-navigation-contract.mjs:22` 的本地 Python fixture 解析器导入 `bs4.BeautifulSoup` 失败。脚本通过 bare `python` 调用，当前 `/usr/bin/python`（3.14.7）没有 `bs4`；这属于验证环境依赖，不是当前 LMS 请求或扩展功能故障。本次未安装依赖或切换主开发环境。

### 1 个不完整的 VM harness

既有 `verify-home-refresh-login-loop-safety.mjs:125` 调用真实 `renderHome` 时，sandbox 没提供新的 `buildAllUpcomingUrl`，抛出 ReferenceError；浏览器 manifest 链实际包含其定义。此失败不能直接判为线上函数不存在。证据来自 `services-offline-summary.json`，本次核对脚本调用点。

## 结果的限制与后续验证改进

这些脚本大量使用源码 `includes/regex` 和历史 fixture。已确认当前网页「其他课程消失」「课程名当用户名」等问题不会因此自动被捕获。特别是 `verify-course-title-syllabus-normalization.mjs:17` 仍把“课程页身份使用归一化课程标题”作为契约，未来修复身份时应更正该要求，而不是保留错误行为来满足测试。

后续建议补充当前 DOM 摘要驱动的行为场景：无 `.courseTree-levelTitle` 的课程列表、账户菜单与课程 brand 同时存在、连续输入/IME、延迟 Promise 完成与禁用/采集视图切换，以及过滤列表下的全选。此轮只记录现有基线，没有修改测试。
