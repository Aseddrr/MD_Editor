# LightMark

LightMark 是一个面向 Windows 的轻量 Markdown 浏览与编辑器。桌面外壳使用 Tauri 2，界面使用原生 TypeScript、HTML 和 CSS，不依赖 React、Vue、Monaco 或 CodeMirror。

当前版本：`0.1.1`。

## 功能

- 新建、打开、保存和另存为 `.md` / `.markdown` 文件。
- 打开文件夹并显示 Markdown 文件树，支持按文件名筛选。
- Markdown 实时预览，渲染结果经过 DOMPurify 清理。
- 自动提取 ATX 与 Setext 标题，并从大纲跳转到编辑器和预览。
- 当前文档搜索以及上一个、下一个匹配。
- 粗体、斜体、行内代码、链接、标题和列表格式操作。
- 拖入 Markdown 文件直接打开。
- 安装后可作为 `.md` / `.markdown` 默认应用；双击文件会直接打开，已有窗口会被复用并聚焦。
- 浅色、深色主题，以及编辑、预览、分栏三种视图。
- 已保存文档修改后自动保存，并保留最近 10 个文件。
- 保存失败、未保存新文档和退出时的丢失保护。
- 卸载前检测仍在运行的 LightMark，避免留下被占用的主程序。

## 环境要求

- Windows 10 或 Windows 11。
- Microsoft Edge WebView2 Runtime。
- Node.js 20.19+、22.12+ 或更新的受支持版本。
- Rust stable MSVC 工具链。
- Visual Studio 2022 的“使用 C++ 的桌面开发”工作负载与 Windows SDK。

## 开发

```powershell
npm install
npm run tauri dev
```

只启动前端页面时可以使用 `npm run dev`，但文件读写和系统对话框仅在 Tauri 窗口中可用。

## 检查与测试

```powershell
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

## Windows 生产构建

```powershell
npm run tauri build
```

可执行文件位于 `src-tauri/target/release/`，NSIS 安装包位于 `src-tauri/target/release/bundle/nsis/`。

## 快捷键

| 快捷键 | 操作 |
| --- | --- |
| `Ctrl+N` | 新建文档 |
| `Ctrl+O` | 打开文件 |
| `Ctrl+Shift+O` | 打开文件夹 |
| `Ctrl+S` | 保存 |
| `Ctrl+Shift+S` | 另存为 |
| `Ctrl+F` | 文内搜索 |
| `Ctrl+B` | 粗体 |
| `Ctrl+I` | 斜体 |
| `Ctrl+E` | 行内代码 |
| `Ctrl+K` | 链接 |

## 数据与边界

- 文档按 UTF-8 读取和保存；打开已有文件时会保留其 LF 或 CRLF 换行风格。
- 为避免界面被异常大文件阻塞，单个文档上限为 16 MiB。
- 文件夹树会跳过隐藏目录、`.git`、`.idea`、`.vscode`、`node_modules` 和 `target`。
- 首版是单文档编辑器，不提供多标签、所见即所得编辑、插件或云同步。
- 预览链接不会替换应用页面；点击时只显示链接目标。
- HTTPS 图片可以显示；首版不重写相对于本地 Markdown 文件的图片路径。

## 项目结构

- `src/`：编辑器界面、状态、Markdown、搜索、目录树和本地偏好。
- `src-tauri/src/files.rs`：Markdown 文件读写和目录扫描。
- `src-tauri/tauri.conf.json`：窗口、安全策略和 Windows 打包配置。
- `docs/superpowers/`：已批准设计与实施计划。
