# Kedo 开发说明（未完成）

Kedo 基于 Readest Personal Edition；原项目使用 GNU AGPL-3.0，保留根目录 LICENSE 及第三方许可证。开发副本内的 Kedo 功能仍在验证，不应作为正式发行版。

构建使用 Node 24、pnpm 和 Rust。首次构建前将 apps/readest-app/.env.example 和 .env.tauri.example 分别复制为 .env 和 .env.tauri；示例只含本地占位值，Readest 云服务需要另行配置。macOS ARM64 通过 `DEVELOPER_DIR=/path/to/Xcode.app/Contents/Developer pnpm exec tauri build --target aarch64-apple-darwin --config src-tauri/tauri.kedo.conf.json`（在 apps/readest-app 下执行）。路径需按本机 Xcode 实际位置修改。构建标识为 `app.kedo.reader`，与 Readest 隔离；不会自动复制原书库。迁移前须先备份并退出两款应用，不能简单假设不同版本的数据库或 WebKit 存储兼容。

书库导入菜单新增“转换或翻译书籍”，使用现有自定义翻译配置。在线翻译会把文本发送到选择的服务，可能产生费用。PDF 仅提取文字层，按页生成目录；原始章节、图片、复杂排版无法保证，扫描件目前没有 OCR；为避免遗漏内容，含空白页的 PDF 也可能被拒绝。EPUB 重新生成过程中尽可能保留图片与链接，但逐文本节点翻译可能影响上下文和格式，输出需要核验。长篇翻译可能因服务限流失败；失败或取消不会提供完成文件。文件仅在应用内存中处理，不修改原文件。不要将个人书籍、密钥、数据目录或本地环境配置提交到版本库。

本说明不是验收报告；构建结果、测试结果、签名及公证状态应以实际执行记录为准。

原书库迁移候选路径：Readest 和 Kedo 的设置菜单都保留“备份与恢复”。先分别备份两个应用的数据，再考虑从 Readest 导出并在 Kedo 恢复；恢复会合并书库并可能覆盖同一本书的文件，不应在未备份时执行。此迁移流程尚未在本构建中完成验收。
