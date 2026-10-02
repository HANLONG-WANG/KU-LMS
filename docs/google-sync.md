# Google Drive TODO 同步

同步使用 Google Drive 的 `appDataFolder` 和 `drive.appdata` 权限。一个 Google 账号对应一个云端待办库；每台电脑选择一份本地资料接入。正式待办（含截止时间）、完成/删除状态和课程目录同步，草稿、LMS 密码、登录参数及本地偏好不上传。当前页面的课程显示范围也只保存在本机；两台电脑可以分别查看不同学期，历史 TODO 仍完整同步。

## 首次配置

1. **先导出每份需要保留的本地 TODO。** 当前未打包扩展没有固定 key；首次应用固定 ID 会使用另一个 Chrome 存储空间。不要先卸载旧扩展。
2. 项目已准备好 `config/google-sync.json` 中的公开密钥，目标扩展 ID 为 `admekobmcbfklgmppbheadhcicfmifdc`。配置准备命令可重复执行且不会更换已有密钥：`node scripts/configure-google-sync.mjs --prepare`。此命令不修改现有 manifest。
3. 在 [Google Cloud Console](https://console.cloud.google.com/) 建立/选择项目，启用 Google Drive API。
4. 配置 Google Auth Platform 的 Branding、Audience 和 Data Access。个人用途使用 External；处于 Testing 时将自己的 Google 邮箱加入测试用户。添加唯一 Drive scope：`https://www.googleapis.com/auth/drive.appdata`。
5. 创建 **Chrome Extension** 类型 OAuth Client，Item ID 使用上述目标扩展 ID。需要的是 Client ID，不需要 Client Secret。
6. 备份完成后运行：

   ```sh
   node scripts/configure-google-sync.mjs --apply --client-id "实际的ClientID.apps.googleusercontent.com" --confirm-backup
   ```

7. 将同一份配置后的扩展复制到两台电脑。按 Chrome 提示重新加载或作为新扩展加载；需要时导入之前导出的 TODO。确认数据恢复后再处理旧安装。
8. 打开扩展的「Google 同步」，连接账号并核对首次合并预览；确认后上传。另一台电脑用相同账号连接并确认。

公开 key/Client ID 可以随扩展分发，不能把 OAuth token 或客户端密钥写入项目。OAuth 测试状态可能需要周期性重新授权；长期使用按控制台要求配置发布状态。首次真实授权与两台电脑联调需要用户完成以上账号配置。

## 同步行为与边界

- 本地数据库在首次成功写入时升级到 schema 4，防止旧扩展静默丢弃截止时间和同步历史；原 schema 1/2/3 数据可正常读取，升级前会备份。复制历史使用 schema 3。
- 本地修改和待上传记录在同一个 `chrome.storage.local` 数据库写入中持久化。写入失败不显示成功。
- Drive 中追加不可变 JSON 变更批次，不覆盖一个共享大文件。上传响应丢失时可能生成重复批次，但事件 ID 去重，不会重复创建 TODO。
- 父版本关系用于区分先后编辑与并发编辑，不依赖电脑时间排序。冲突按整条 TODO 保留，不做字段级自动合并；仅截止时间不同也会产生可选择的冲突版本，清除时间是明确的变更。删除与编辑冲突也保留分支。
- 云端拉取校验账号、格式、依赖关系和大小；分页或下载失败不将云端视为空库。
- 修改后合并短时请求；后台一分钟检查一次，失败按指数退避。Chrome 休眠/关闭时不能承诺实时同步，重新打开后继续。
- 每次同步先核对 Google 身份。切换成另一个账号会暂停上传；不同账号应使用不同本地资料。
- 断开连接保留本地数据、未上传变更与云端历史；不会撤销其他应用的授权。
- 绑定同步后禁止整库快照回退，以免抹掉因果历史。可通过导出/合并导入恢复内容。
- 首版保留同步历史与删除标记，不自动清理离线设备可能需要的历史。受本地安全容量限制，达到上限会明确失败并保留先前数据，不自动丢弃记录。
- 云同步不能代替外部备份。导出会将未解决冲突中的其他文本版本另存为独立待办，避免漏掉内容。用户可从 Drive 的应用管理中删除应用数据，这会删除云端历史。

## 截止时间版本升级

新版上传的 TODO 批次使用 `schemaVersion: 2`，但保留 `kuTodoFormat: ku-lms-todo-v1` 的发现标记及 `format`。这样旧版能发现文件，并在读取时拒绝新版内容，而不是忽略文件后继续上传不完整的数据。新版兼容读取旧 schema 1 批次；课题完成状态的独立批次仍为 schema 1。

首次上传新版 TODO 批次后，旧设备在下一次拉取到该文件时显示“云端同步格式或账号不匹配，未覆盖本地数据”，该次同步在合并和上传之前停止。本地记录、草稿和待上传修改保留，但整个同步流程（包括课题状态）会被阻断。更新其他设备的扩展、重新加载并重试即可继续，无需断开账号、清空数据或重建云端库。

这不是服务器端写入锁：旧设备在新版文件出现之前已经通过拉取检查的一次同步，仍可能完成旧格式上传。该并发事件按原有父版本关系合并并保留冲突，不依据时间戳覆盖新版记录；建议各设备一起更新。首次新版写入之前，云端只有旧格式时旧设备仍可同步。

## 技术与测试

- `todo-replica.js`：带父版本的多值记录、合并、删除标记与冲突选择。
- `todo-drive.js`：OAuth token 只用于请求头；Drive 分页、不可变 multipart 上传、错误分类与超时。
- `todo-sync.js`：首次合并预览、账号绑定、持久待上传队列处理、alarms 重试。
- `google-sync.js`：弹窗中的连接、同步状态和冲突选择；LMS 内容脚本不能启动 OAuth 操作。
- `npm test` 包括本地 TODO 回归、离线双机合并和 Drive 请求模拟。模拟测试不替代真实 Google OAuth/Drive 联调。
- `verify-todo-deadlines.mjs` 使用冻结的旧版 Drive 客户端，验证旧格式读取、新格式拒读且禁止后续上传、UTC 校验、离线冲突、清除时间、迁移备份和导入导出。

参考：[Chrome OAuth](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth)、[应用专用数据](https://developers.google.com/workspace/drive/api/guides/appdata)、[Drive 错误处理](https://developers.google.com/workspace/drive/api/guides/handle-errors)。
