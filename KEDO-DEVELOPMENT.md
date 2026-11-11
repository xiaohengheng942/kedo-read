# Kedo 开发说明（未完成）

Kedo 基于 Readest Personal Edition；原项目使用 GNU AGPL-3.0，保留根目录 LICENSE 及第三方许可证。开发副本内的 Kedo 功能仍在验证，不应作为正式发行版。

构建使用 Node 24、pnpm 和 Rust。首次构建前将 apps/readest-app/.env.example 和 .env.tauri.example 分别复制为 .env 和 .env.tauri；示例只含本地占位值，Readest 云服务需要另行配置。macOS ARM64 通过 `DEVELOPER_DIR=/path/to/Xcode.app/Contents/Developer pnpm exec tauri build --target aarch64-apple-darwin --config src-tauri/tauri.kedo.conf.json`（在 apps/readest-app 下执行）。路径需按本机 Xcode 实际位置修改。构建标识为 `app.kedo.reader`，与 Readest 隔离；不会自动复制原书库。迁移前须先备份并退出两款应用，不能简单假设不同版本的数据库或 WebKit 存储兼容。

书库导入菜单新增“转换或翻译书籍”，支持现有 Azure、Google、Yandex 以及可用的自定义翻译配置。在线翻译会把文本发送到选择的服务，可能产生费用。PDF 优先提取文字层，对无文字页面尝试 Apple Vision 本机 OCR 并跳过空白页，按页生成目录；原始章节、图片、复杂排版无法保证。识别不到文字的非空页面会报错；识别仅支持中英文，当前页面识别期间取消可能需要等待该页面完成。EPUB 重新生成过程中尽可能保留图片与链接，但逐文本节点翻译可能影响上下文和格式，输出需要核验。长篇翻译可能因服务限流失败；失败或取消不会提供完成文件。文件仅在应用内存中处理，不修改原文件。不要将个人书籍、密钥、数据目录或本地环境配置提交到版本库。

本说明不是验收报告；构建结果、测试结果、签名及公证状态应以实际执行记录为准。

原书库迁移候选路径：Readest 和 Kedo 的设置菜单都保留“备份与恢复”。先分别备份两个应用的数据，再考虑从 Readest 导出并在 Kedo 恢复；恢复会合并书库并可能覆盖同一本书的文件，不应在未备份时执行。此迁移流程尚未在本构建中完成验收。

2026-11-11 验证记录：生成的无文字层中文、英文扫描页经独立 Apple Vision 辅助程序识别出预期文字；这不等于已通过应用内 OCR 到 EPUB 的端到端验证。隔离 QA 窗口中曾出现系统选择器选中文件但“打开”不可用、自动化操作超时的情况；原因未确定，需要在目标机器继续排查。内置三服务在下拉列表中可见；真实整本书翻译、长任务限流稳定性未完成验收。新版本不应标记为正式交付。
