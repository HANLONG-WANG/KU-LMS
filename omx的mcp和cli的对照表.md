**对照表**

| MCP namespace / tool | CLI 对应 |
|---|---|
| `mcp__omx_state__.state_read` | `omx state read --input '{"mode":"..."}' --json` |
| `mcp__omx_state__.state_write` | `omx state write --input '{...}' --json` |
| `mcp__omx_state__.state_clear` | `omx state clear --input '{...}' --json` |
| `mcp__omx_state__.state_list_active` | `omx state list-active --json` |
| `mcp__omx_state__.state_get_status` | `omx state get-status --input '{...}' --json` |

| MCP namespace / tool | CLI 对应 |
|---|---|
| `mcp__omx_memory__.notepad_read` | `omx notepad notepad_read --input '{...}' --json` |
| `mcp__omx_memory__.notepad_write_priority` | `omx notepad notepad_write_priority --input '{...}' --json` |
| `mcp__omx_memory__.notepad_write_working` | `omx notepad notepad_write_working --input '{...}' --json` |
| `mcp__omx_memory__.notepad_write_manual` | `omx notepad notepad_write_manual --input '{...}' --json` |
| `mcp__omx_memory__.notepad_prune` | `omx notepad notepad_prune --input '{...}' --json` |
| `mcp__omx_memory__.notepad_stats` | `omx notepad notepad_stats --input '{}' --json` |
| `mcp__omx_memory__.project_memory_read` | `omx project-memory project_memory_read --input '{...}' --json` |
| `mcp__omx_memory__.project_memory_write` | `omx project-memory project_memory_write --input '{...}' --json` |
| `mcp__omx_memory__.project_memory_add_note` | `omx project-memory project_memory_add_note --input '{...}' --json` |
| `mcp__omx_memory__.project_memory_add_directive` | `omx project-memory project_memory_add_directive --input '{...}' --json` |

| MCP namespace / tool | CLI 对应 |
|---|---|
| `mcp__omx_trace__.trace_timeline` | `omx trace trace_timeline --input '{...}' --json` |
| `mcp__omx_trace__.trace_summary` | `omx trace trace_summary --input '{}' --json` |

| MCP namespace / tool | CLI 对应 |
|---|---|
| `mcp__omx_code_intel__.lsp_diagnostics` | `omx code-intel lsp_diagnostics --input '{...}' --json` |
| `mcp__omx_code_intel__.lsp_diagnostics_directory` | `omx code-intel lsp_diagnostics_directory --input '{...}' --json` |
| `mcp__omx_code_intel__.lsp_document_symbols` | `omx code-intel lsp_document_symbols --input '{...}' --json` |
| `mcp__omx_code_intel__.lsp_workspace_symbols` | `omx code-intel lsp_workspace_symbols --input '{...}' --json` |
| `mcp__omx_code_intel__.lsp_hover` | `omx code-intel lsp_hover --input '{...}' --json` |
| `mcp__omx_code_intel__.lsp_find_references` | `omx code-intel lsp_find_references --input '{...}' --json` |
| `mcp__omx_code_intel__.lsp_servers` | `omx code-intel lsp_servers --input '{}' --json` |
| `mcp__omx_code_intel__.ast_grep_search` | `omx code-intel ast_grep_search --input '{...}' --json` |
| `mcp__omx_code_intel__.ast_grep_replace` | `omx code-intel ast_grep_replace --input '{...}' --json` |

| MCP namespace / tool | CLI 对应 |
|---|---|
| `mcp__omx_wiki__.wiki_ingest` | `omx wiki wiki_ingest --input '{...}' --json` |
| `mcp__omx_wiki__.wiki_query` | `omx wiki wiki_query --input '{...}' --json` |
| `mcp__omx_wiki__.wiki_lint` | `omx wiki wiki_lint --input '{}' --json` |
| `mcp__omx_wiki__.wiki_add` | `omx wiki wiki_add --input '{...}' --json` |
| `mcp__omx_wiki__.wiki_list` | `omx wiki wiki_list --input '{}' --json` |
| `mcp__omx_wiki__.wiki_read` | `omx wiki wiki_read --input '{...}' --json` |
| `mcp__omx_wiki__.wiki_delete` | `omx wiki wiki_delete --input '{...}' --json` |
| `mcp__omx_wiki__.wiki_refresh` | `omx wiki wiki_refresh --input '{}' --json` |

**不是 `omx` CLI parity 的部分**

这些在你当前会话里有 MCP 工具，但不是 `omx` 自带 CLI 对照面：

- `mcp__chrome_devtools__.*`
- `mcp__codex_apps__google_calendar.*`
- `web.*`
- `image_gen.*`

也就是说，这几类不能简单写成 `omx xxx ...` 来替代。

**常用模板**

```bash
omx state read --input '{"mode":"ralph"}' --json
omx notepad notepad_read --input '{"section":"all"}' --json
omx project-memory project_memory_read --input '{"section":"all"}' --json
omx trace trace_summary --input '{}' --json
omx code-intel lsp_diagnostics --input '{"file":"src/app.ts"}' --json
omx wiki wiki_query --input '{"query":"architecture","limit":5}' --json
```

如果你要，我下一条可以直接给你一份“按用途分类”的速查版，比如“查状态 / 查代码 / 查 wiki / 写 memory”四类命令。
