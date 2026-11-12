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
python3 scripts/prepare-adb.py --check
npm run tauri dev
```

## 构建

```sh
npm run tauri build
```

macOS 通用 release 安装包（Apple Silicon + Intel）：

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri -- build --target universal-apple-darwin --bundles app,dmg --config '{"bundle":{"macOS":{"signingIdentity":"-"}}}'
```

产物位于 `target/universal-apple-darwin/release/bundle/`：`dmg/` 为安装镜像，`macos/` 为应用。上述命令使用本地 ad-hoc 签名，不含 Apple 公证；正式对外分发需配置 Developer ID 签名与公证。

`npm run dev` 仅启动前端，Rust 调用需要通过 Tauri 启动。

连接已开启 USB 调试并授权的 Android 设备，在应用内选择目标并点击“开始投屏”。ADB 已随应用内置，使用官方 Platform-Tools 37.0.1，无需安装 ADB 或设置 PATH。支持 macOS arm64/x86_64、Windows x64 和 Linux x86_64；Windows/Linux ARM64 尚不支持。Windows USB 驱动和 Linux USB 设备访问权限仍由宿主系统提供。音频首轮使用 Android 12+，播放音量与静音只影响电脑端。

应用包含欢迎指引、设备管理和投屏工作台三个主体页面，通过“选择设备 → 进入工作台”及返回按钮衔接，不包含原型演示用的全局导航。设备页提供真实详情、刷新、无线直连、配对码及成功地址历史；工作台提供同页画面/声音、点击拖动、快捷控制、手势、屏幕参数和命令终端。无线配对端口与连接端口需分别填写手机显示的值。应用采用单实例，重复启动会唤起已有窗口。

## 工作台使用

- 快捷控制可在未开始投屏时操作在线设备，包括亮屏、锁屏、电源、桌面、最近任务、返回、音量、设备静音、通知栏和截图。截图通过系统保存窗口选择位置，设备重启需要在应用内确认。播放器的静音与音量只改变电脑播放，独立于设备音量。
- 预设手势按设备当前显示区域计算坐标；效果受设备导航方式影响。画面支持适应区域、50% / 75% / 100% 缩放和全屏。
- 尺寸支持预设和自定义整数（每边 200–7680 px），DPI 为 72–1000；可设置方向、固定方向和触控轨迹。应用后会回读设备值，设备仍可能拒绝某些数值。
- “清除尺寸 / DPI 覆盖”恢复设备默认；“恢复本次修改”恢复本应用首次修改前的值。停止投屏、切换设备及正常退出时自动尝试恢复。断连或强制退出后保留恢复记录，同一 ADB 标识重连后可手动重试；USB 与无线地址暂不自动归并。
- 终端输入设备端 `adb shell` 后的命令，支持设备端管道及常用查询预设；每次最多 30 秒，stdout、stderr 各保留 256 KiB，超出时标记截断。显示退出状态和耗时，可取消；清空只清除显示。取消不会回滚设备操作，任意终端命令的副作用不属于参数自动恢复范围。

验证状态和剩余验收项统一记录在 [路线图](docs/ROADMAP.md)。macOS 的重复启动回归检查需先打开构建后的应用，再运行 `python3 scripts/check-single-instance.py`；投屏中执行还会检查 ADB 隧道未变化。

- `src/layout.ts`、`src/main.ts`、`src/bridge.ts`：主体布局、设备连接交互与 Tauri 命令
- `src/mirror.ts`：工作台投屏会话与输入交互
- `src/workbench.ts`、`src-tauri/src/workbench.rs`：工作台控制、终端与屏幕参数恢复
- `src-tauri/src/command.rs`：有超时、取消和输出上限的 ADB 子进程执行
- `src/media.ts`、`src/pcm-worklet.ts`：视频解码、画面呈现与有界 PCM 音频缓冲
- `src-tauri/src/adb.rs`、`src-tauri/src/scrcpy/`：设备发现、协议与会话资源管理
- `src-tauri/resources/adb/`：三平台内置 ADB、必要动态库、版本校验清单与许可；缺失时运行 `python3 scripts/prepare-adb.py` 恢复
- `src-tauri/resources/scrcpy/`：锁定版 server、校验清单及许可
- 根目录 `Cargo.toml`：Rust workspace

应用标识为 `com.remotedebugbridge.app`，发布前可在 `src-tauri/tauri.conf.json` 调整。
