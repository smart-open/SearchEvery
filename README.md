# SearchEvery (SearchEvery)

一个基于 Tauri + Vite + Rust 的跨平台桌面应用，用于高效检索与聚合文件/数据资源。项目同时包含前端（Vite/React）和后端（Rust/Tauri）部分，并提供一键运行和一键打包脚本。

## 产品介绍
- 目标：提供“随处搜索”的统一入口，整合本地文件与扩展数据源的检索体验。
- 特点：轻量、原生窗口、支持多平台（Windows、macOS、Linux），安装包体积小、启动速度快。

## 功能介绍
- 全局索引与扫描：后端 Rust 模块负责目录扫描（scanner.rs）、索引构建（indexer.rs）。
- 搜索与去重：提供搜索（search.rs）与去重（dedup.rs）能力，支持高亮显示（前端 utils/highlight.tsx）。
- 主题与界面：支持主题切换（ThemeDropdown.tsx），样式可在 src/styles.css 与 constants/themes.ts 中扩展。
- 事件与热键：统一事件处理（hooks/useTauriEvents.ts）与搜索热键（hooks/useSearchHotkeys.ts）。
- 图标：多尺寸 ICO（16/32/48/64/256）已生成并合并到 src-tauri/icons/icon.ico，文本颜色为 #3fa106，圆角加倍。

## 软件截图
- 示例界面（示例图，仅供占位）：

  ![SearchEvery 示例界面](src/assets/zsm.png)

- 建议将实际截图放在 `public/assets/images/` 目录，并按页面或功能命名，例如：
  - `public/assets/images/home.png`（首页/主界面）
  - `public/assets/images/search.png`（搜索结果页）
  - `public/assets/images/settings.png`（设置页）
  - `public/assets/images/logs.png`（日志查看/说明）

  将图片添加后，可在此处以 Markdown 形式插入：

  ```md
  ![首页](/public/assets/images/home.png)
  ![搜索](/public/assets/images/search.png)
  ![设置](/public/assets/images/settings.png)
  ![日志](/public/assets/images/logs.png)
  ```

## 目录结构（简要）
- 前端：src/（React + Vite），dist/（打包产物）
- 后端：src-tauri/（Rust/Tauri），icons/（应用图标），tauri.conf.json（Tauri 配置）
- 脚本：run.bat、run.sh（开发运行）；build.bat、build.sh（一键打包）

## 环境准备
请确保满足 Tauri 官方前置条件（详见 https://tauri.app/v1/guides/getting-started/prerequisites）：

- 通用
  - Node.js ≥ 18（建议使用 LTS），npm 或 pnpm
  - Rust 工具链（通过 https://rustup.rs 安装），cargo 可用
  - Tauri CLI（可通过 npx 调用或安装 dev 依赖）

- Windows
  - Visual Studio Build Tools（含“Desktop development with C++”与 Windows SDK）
  - WebView2 Runtime（https://developer.microsoft.com/en-us/microsoft-edge/webview2/）

- macOS
  - Xcode 与命令行工具：`xcode-select --install`

- Linux（Debian/Ubuntu 示例）
  - `sudo apt update && sudo apt install -y libgtk-3-dev libwebkit2gtk-4.0-dev libayatana-appindicator3-dev librsvg2-dev`

## 开发运行
1) 安装依赖
- npm: `npm install`
- pnpm: `pnpm install`

2) 一键启动（推荐）
- Windows: 双击 `run.bat` 或在终端执行 `run.bat`
- macOS/Linux: `chmod +x run.sh && ./run.sh`

脚本将：
- 结束可能残留的应用进程，避免 Windows 文件锁影响
- 启动 Tauri 开发模式（同时运行前端开发服务器）

3) 手动方式（可选）
- 启动前端开发：`npm run dev`
- 启动 Tauri：`npx tauri dev`

开发预览地址（前端）：`http://localhost:5173/`

## 打包发布
推荐使用一键打包脚本，或手动分步执行：

- 一键打包
  - Windows: 双击 `build.bat` 或在终端执行 `build.bat`
  - macOS/Linux: `chmod +x build.sh && ./build.sh`

- 手动方式
  1) 构建前端：`npm run build`（生成 dist/）
  2) 构建桌面应用：`npx tauri build`

打包产物位置（Windows）：
- `src-tauri/target/release/bundle/msi/`
- `src-tauri/target/release/bundle/nsis/`

注意：
- Windows 下 Tauri 会生成 MSI 与 NSIS 安装包。
- macOS 与 Linux 的包类型根据系统与配置不同而异（dmg、AppImage、deb、rpm 等）。
- 若打包失败，请先确认已满足“环境准备”中的所有前置条件。

## 日志输出
- 日志目录：可执行文件同级的 `logs/` 目录（自动创建）。
- 命名约定：
  - 当前运行日志：`SearchEvery.log`
  - 每日日志：`SearchEvery-yyyy-dd-mm.log`
- 配置项：
  - 级别：通过环境变量 `RUST_LOG`（默认 `info`）控制，例如 `RUST_LOG=debug`
  - 扫描日志采样：`SE_SCAN_LOG_SAMPLE_EVERY`（默认 `100`）
  - 索引日志采样：`SE_INDEX_LOG_SAMPLE_EVERY`（默认 `200`）
  
说明：扫描与索引过程会按设定间隔进行采样输出，避免日志量过大，同时在关键流程节点（开始、结束、分支决策）输出信息级别日志以便定位问题。

## 配置说明
- `src-tauri/tauri.conf.json`
  - `productName`: 应用显示名称（当前为 `SearchEvery`）
  - `bundle.active`: 打包开关（已启用）
  - `bundle.icon`: 指向 `src-tauri/icons/icon.ico`（多尺寸合并）
  - `build.distDir`: 前端静态资源目录（当前为 `../dist`）
- 前端入口与构建配置：`vite.config.ts`

## 常见问题
- 图标不更新：开发模式下桌面窗口可能缓存图标，重新启动或打包后更明显。
- Windows 文件锁：脚本已在启动/打包前尝试结束残留进程，避免锁导致失败。
- 前端资源找不到：确保执行了 `npm run build` 生成 `dist/` 或检查 `build.distDir` 设置。

## 许可
本项目用于原型与产品开发，许可与版权请根据实际需求补充（可选：MIT/Apache-2.0 等）。

## 版本控制
- 默认分支：`master`
- 远端仓库：`origin https://github.com/smart-open/SearchEvery.git`