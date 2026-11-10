# Kedo 候选项目评估

调研日期：2026-11-11。当前 Kedo 实验代码没有引入以下项目的源码或二进制；Readest 自身及其依赖的许可证仍须保留。

- [BookForge](https://github.com/JunjoSick/bookforge)：MIT，Rust，提供 macOS 安装方式，面向 EPUB 翻译，支持 OpenAI 兼容服务和模拟运行。其结构保护及断点续译值得后续评估，但作为外部进程集成要解决配置、任务取消、资源与更新；此处未验证其 Apple Silicon 包或与 Readest 配置的兼容性。
- [PDF Craft](https://github.com/oomol-lab/pdf-craft)：项目 MIT，模型和依赖另有许可。项目文档列出的本地 OCR 需要 CUDA/NVIDIA，远程 OCR 需要 Python、Poppler 和可用的 OCR 服务。不能据此声称本机 Apple Silicon 可离线运行；没有打包模型或接入远程服务。
- [ebook-translator](https://github.com/mess/ebook-translator)：GPL-3.0，Java 11+，面向无 DRM EPUB 和 DeepL。额外 Java 运行时及单一服务配置增加集成负担；未引入。
- [calibre](https://github.com/kovidgoyal/calibre)：GPL-3.0，支持 macOS 和多格式转换。该机器有 calibre，但其大型独立运行时及打包维护成本使其未被嵌入或作为 Kedo 的必备外部程序；没有验证其在本机的转换质量。

当前实验使用 Readest 已有的 PDF.js、EPUB 构建器及自定义翻译器，以减少新增运行依赖。这一选择尚不能解决扫描件 OCR、PDF 图片和复杂排版恢复。没有使用或下载上述项目的 OCR 模型；若将来引入，需逐一核验模型许可和 Apple Silicon 运行条件。
