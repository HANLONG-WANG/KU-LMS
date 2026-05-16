# OMX MCP 与 CLI 对照表：Codex 禁用 MCP Server 版

> 目的：让 Codex 在执行任务时避免调用任何 `omx` MCP server 工具，统一改用 `omx` CLI。
>
> 硬规则：凡是看到 `mcp__omx_*` 工具，都不要调用 MCP；必须按下表替换为 shell 命令形式的 `omx ... --json`。

---

## 1. Codex 执行规则

### 1.1 禁止项

Codex 不应调用以下任何 MCP 工具：

```text
mcp__omx_state__.*
mcp__omx_memory__.*
mcp__omx_trace__.*
mcp__omx_code_intel__.*
mcp__omx_wiki__.*
```

### 1.2 必须使用 CLI

统一使用以下模式：

```bash
omx <group> <command> --input '<json-object>' --json
```

无输入参数时使用：

```bash
omx <group> <command> --input '{}' --json
```

少数命令不需要 `--input`，按表中命令原样执行。

### 1.3 参数迁移规则

MCP 调用中的参数 JSON，应原样作为 CLI 的 `--input` 参数传入。

例如 MCP 调用：

```text
mcp__omx_wiki__.wiki_query({"query":"architecture","limit":5})
```

必须替换为：

```bash
omx wiki wiki_query --input '{"query":"architecture","limit":5}' --json
```

---

## 2. 总览

| MCP namespace | CLI group | 覆盖工具数 | 说明 |
|---|---:|---:|---|
| `mcp__omx_state__` | `omx state` | 5 | 状态读写、清理、活动状态、状态详情 |
| `mcp__omx_memory__` | `omx notepad` / `omx project-memory` | 10 | notepad 与 project memory 读写 |
| `mcp__omx_trace__` | `omx trace` | 2 | trace 时间线与摘要 |
| `mcp__omx_code_intel__` | `omx code-intel` | 9 | LSP 与 ast-grep 代码智能 |
| `mcp__omx_wiki__` | `omx wiki` | 8 | wiki ingest/query/lint/add/list/read/delete/refresh |
| **合计** |  | **34** | 下方列出全部工具 |

---

## 3. `mcp__omx_state__` 对照表

| MCP namespace / tool | CLI 替代命令 | 输入模板 / 备注 |
|---|---|---|
| `mcp__omx_state__.state_read` | `omx state read --input '{"mode":"..."}' --json` | 读取指定 mode 的状态。示例：`{"mode":"ralph"}` |
| `mcp__omx_state__.state_write` | `omx state write --input '{...}' --json` | 写入状态。将 MCP 参数 JSON 原样传给 `--input`。 |
| `mcp__omx_state__.state_clear` | `omx state clear --input '{...}' --json` | 清理状态。将 MCP 参数 JSON 原样传给 `--input`。 |
| `mcp__omx_state__.state_list_active` | `omx state list-active --json` | 列出 active 状态；此命令不需要 `--input`。 |
| `mcp__omx_state__.state_get_status` | `omx state get-status --input '{...}' --json` | 获取状态详情。将 MCP 参数 JSON 原样传给 `--input`。 |

### 常用示例

```bash
omx state read --input '{"mode":"ralph"}' --json
omx state list-active --json
omx state get-status --input '{"mode":"ralph"}' --json
```

---

## 4. `mcp__omx_memory__` 对照表

### 4.1 Notepad

| MCP namespace / tool | CLI 替代命令 | 输入模板 / 备注 |
|---|---|---|
| `mcp__omx_memory__.notepad_read` | `omx notepad notepad_read --input '{...}' --json` | 读取 notepad。示例：`{"section":"all"}`。 |
| `mcp__omx_memory__.notepad_write_priority` | `omx notepad notepad_write_priority --input '{...}' --json` | 写入 priority notepad。 |
| `mcp__omx_memory__.notepad_write_working` | `omx notepad notepad_write_working --input '{...}' --json` | 写入 working notepad。 |
| `mcp__omx_memory__.notepad_write_manual` | `omx notepad notepad_write_manual --input '{...}' --json` | 写入 manual notepad。 |
| `mcp__omx_memory__.notepad_prune` | `omx notepad notepad_prune --input '{...}' --json` | 裁剪 / 清理 notepad。 |
| `mcp__omx_memory__.notepad_stats` | `omx notepad notepad_stats --input '{}' --json` | 查看 notepad 统计信息。 |

### 4.2 Project Memory

| MCP namespace / tool | CLI 替代命令 | 输入模板 / 备注 |
|---|---|---|
| `mcp__omx_memory__.project_memory_read` | `omx project-memory project_memory_read --input '{...}' --json` | 读取 project memory。示例：`{"section":"all"}`。 |
| `mcp__omx_memory__.project_memory_write` | `omx project-memory project_memory_write --input '{...}' --json` | 写入 project memory。 |
| `mcp__omx_memory__.project_memory_add_note` | `omx project-memory project_memory_add_note --input '{...}' --json` | 增加 project memory note。 |
| `mcp__omx_memory__.project_memory_add_directive` | `omx project-memory project_memory_add_directive --input '{...}' --json` | 增加 project memory directive。 |

### 常用示例

```bash
omx notepad notepad_read --input '{"section":"all"}' --json
omx notepad notepad_stats --input '{}' --json
omx project-memory project_memory_read --input '{"section":"all"}' --json
omx project-memory project_memory_add_note --input '{"note":"..."}' --json
omx project-memory project_memory_add_directive --input '{"directive":"..."}' --json
```

---

## 5. `mcp__omx_trace__` 对照表

| MCP namespace / tool | CLI 替代命令 | 输入模板 / 备注 |
|---|---|---|
| `mcp__omx_trace__.trace_timeline` | `omx trace trace_timeline --input '{...}' --json` | 查询 trace timeline。 |
| `mcp__omx_trace__.trace_summary` | `omx trace trace_summary --input '{}' --json` | 查询 trace summary。 |

### 常用示例

```bash
omx trace trace_timeline --input '{"limit":50}' --json
omx trace trace_summary --input '{}' --json
```

---

## 6. `mcp__omx_code_intel__` 对照表

### 6.1 LSP 工具

| MCP namespace / tool | CLI 替代命令 | 输入模板 / 备注 |
|---|---|---|
| `mcp__omx_code_intel__.lsp_diagnostics` | `omx code-intel lsp_diagnostics --input '{...}' --json` | 查询单文件 diagnostics。示例：`{"file":"src/app.ts"}`。 |
| `mcp__omx_code_intel__.lsp_diagnostics_directory` | `omx code-intel lsp_diagnostics_directory --input '{...}' --json` | 查询目录 diagnostics。 |
| `mcp__omx_code_intel__.lsp_document_symbols` | `omx code-intel lsp_document_symbols --input '{...}' --json` | 查询文档 symbols。 |
| `mcp__omx_code_intel__.lsp_workspace_symbols` | `omx code-intel lsp_workspace_symbols --input '{...}' --json` | 查询 workspace symbols。 |
| `mcp__omx_code_intel__.lsp_hover` | `omx code-intel lsp_hover --input '{...}' --json` | 查询 hover 信息。 |
| `mcp__omx_code_intel__.lsp_find_references` | `omx code-intel lsp_find_references --input '{...}' --json` | 查询引用。 |
| `mcp__omx_code_intel__.lsp_servers` | `omx code-intel lsp_servers --input '{}' --json` | 列出 LSP servers。 |

### 6.2 ast-grep 工具

| MCP namespace / tool | CLI 替代命令 | 输入模板 / 备注 |
|---|---|---|
| `mcp__omx_code_intel__.ast_grep_search` | `omx code-intel ast_grep_search --input '{...}' --json` | ast-grep 搜索。 |
| `mcp__omx_code_intel__.ast_grep_replace` | `omx code-intel ast_grep_replace --input '{...}' --json` | ast-grep 替换。执行前应先审查匹配范围。 |

### 常用示例

```bash
omx code-intel lsp_diagnostics --input '{"file":"src/app.ts"}' --json
omx code-intel lsp_diagnostics_directory --input '{"directory":"src"}' --json
omx code-intel lsp_document_symbols --input '{"file":"src/app.ts"}' --json
omx code-intel lsp_workspace_symbols --input '{"query":"UserService"}' --json
omx code-intel lsp_hover --input '{"file":"src/app.ts","line":10,"character":5}' --json
omx code-intel lsp_find_references --input '{"file":"src/app.ts","line":10,"character":5}' --json
omx code-intel lsp_servers --input '{}' --json
omx code-intel ast_grep_search --input '{"pattern":"...","language":"typescript","path":"src"}' --json
omx code-intel ast_grep_replace --input '{"pattern":"...","replacement":"...","language":"typescript","path":"src"}' --json
```

---

## 7. `mcp__omx_wiki__` 对照表

| MCP namespace / tool | CLI 替代命令 | 输入模板 / 备注 |
|---|---|---|
| `mcp__omx_wiki__.wiki_ingest` | `omx wiki wiki_ingest --input '{...}' --json` | ingest wiki 内容。 |
| `mcp__omx_wiki__.wiki_query` | `omx wiki wiki_query --input '{...}' --json` | 查询 wiki。示例：`{"query":"architecture","limit":5}`。 |
| `mcp__omx_wiki__.wiki_lint` | `omx wiki wiki_lint --input '{}' --json` | lint wiki。 |
| `mcp__omx_wiki__.wiki_add` | `omx wiki wiki_add --input '{...}' --json` | 增加 wiki 条目。 |
| `mcp__omx_wiki__.wiki_list` | `omx wiki wiki_list --input '{}' --json` | 列出 wiki 条目。 |
| `mcp__omx_wiki__.wiki_read` | `omx wiki wiki_read --input '{...}' --json` | 读取指定 wiki 条目。 |
| `mcp__omx_wiki__.wiki_delete` | `omx wiki wiki_delete --input '{...}' --json` | 删除指定 wiki 条目。危险操作，执行前必须确认目标。 |
| `mcp__omx_wiki__.wiki_refresh` | `omx wiki wiki_refresh --input '{}' --json` | 刷新 wiki。 |

### 常用示例

```bash
omx wiki wiki_query --input '{"query":"architecture","limit":5}' --json
omx wiki wiki_list --input '{}' --json
omx wiki wiki_read --input '{"id":"..."}' --json
omx wiki wiki_lint --input '{}' --json
omx wiki wiki_refresh --input '{}' --json
```

