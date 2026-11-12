# Remote Debug Bridge

Tauri 2 桌面应用，使用原生 TypeScript + Vite 和 Rust。

## 项目文档

- [AGENTS：协作规则与文档入口](AGENTS.md)
- [PRD：产品范围、交互和验收](docs/PRD.md)
- [实施路线图：从工程到交付共 5 步](docs/ROADMAP.md)
- [设计原型：三页原稿与视觉规范](docs/design/README.md)
- [调研：scrcpy 音视频内嵌 Tauri 页面](docs/research/scrcpy-embedding.md)
- [scrcpy 资料与资源准备：源码入口、版本锁定、ADB 环境](docs/development/scrcpy-setup.md)

## 开发

安装 Rust、Node.js 和对应平台的 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)。

```sh
npm install
python3 scripts/prepare-scrcpy.py --check
npm run tauri dev
```

## 构建

```sh
npm run tauri build
```

`npm run dev` 仅启动前端，Rust 调用需要通过 Tauri 启动。

连接已开启 USB 调试并授权的 Android 设备，在应用内选择目标并点击“开始投屏”。ADB 默认从 PATH 查找；若 Finder 启动时找不到，请在界面填写 `adb` 可执行文件的完整路径。音频首轮使用 Android 12+，播放音量与静音只影响电脑端。

当前页面是第 2 步的音视频工作台，提供同页画面/声音、点击拖动、返回/桌面/最近任务/音量键及停止重连。三页完整界面与无线配对在后续步骤实现；已通过 ADB 建立的连接可出现在设备列表中。应用采用单实例，重复启动会唤起已有窗口。

验证状态和剩余验收项统一记录在 [路线图](docs/ROADMAP.md)。macOS 的重复启动回归检查需先打开构建后的应用，再运行 `python3 scripts/check-single-instance.py`；投屏中执行还会检查 ADB 隧道未变化。

- `src/main.ts`、`src/bridge.ts`：页面交互与 Tauri 命令
- `src/media.ts`、`src/pcm-worklet.ts`：视频解码、画面呈现与有界 PCM 音频缓冲
- `src-tauri/src/adb.rs`、`src-tauri/src/scrcpy/`：设备发现、协议与会话资源管理
- `src-tauri/resources/scrcpy/`：锁定版 server、校验清单及许可
- 根目录 `Cargo.toml`：Rust workspace

应用标识为 `com.remotedebugbridge.app`，发布前可在 `src-tauri/tauri.conf.json` 调整。
