# 离线验证

在项目根目录运行：

```sh
npm ci
npm test
```

依赖只用于开发验证，不进入扩展 manifest；扩展仍直接加载 `src/`。Node.js 22 或更新版本可运行这些脚本。`package-lock.json` 固定依赖；[LinkeDOM](https://github.com/WebReflection/linkedom) 用于本地 HTML fixture 的 DOM 解析，不加载资源或执行页面脚本。

`npm test` 自动执行 `scripts/verify-*.mjs`（排除总入口本身），逐项打印 PASS/FAIL，并将完整输出写入 `artifacts/fixes-2026-09-30/checks.json`。失败时命令返回非零退出码。无需 Python、BeautifulSoup 或个人 `.omx/plans` 文件。

新增审查回归区分当前结构摘要、合成边界输入和历史 fixture；使用真实 parser、renderer、handler、生命周期和队列函数。网络、表单提交、课程导航只使用明确的 stub，不访问真实 LMS 或大纲服务。至少一个对应回归在原 HEAD 下失败，防止只验证修复后的实现形状。

浏览器复查沿用唯一 LMS 标签页串行进行。不要通过作业/考试、真实表单、转发、删除或故意并发访问来验证；登录自动提交、错误页、网络超时和采集状态机使用离线回归。每次受保护的导航都应在 document-start 设置 `data-ku-audit-no-submit="true"` 并阻止 submit，不能假设一次刷新注入的拦截会跨页持续；检查结束后刷新恢复正常 DOM。加载未打包扩展时，源文件变化后需确认 Chrome 已加载新版本，再将观察记录到修复报告。

按用户确认的产品预期，保存用户名和密码后默认自动登录；旧设置保持该行为。popup 可独立关闭自动登录以仅填充；检查模式始终阻止自动提交，禁用、离页和凭据变化会取消已排队的尝试。
