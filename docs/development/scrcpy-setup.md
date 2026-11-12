# scrcpy 开发资料与资源准备

更新日期：2026-11-13。本文维护资源、源码与运行约定；开发进度和实测证据统一记录在 [路线图](../ROADMAP.md)。

## 已准备的资源

| 资源 | 当前状态 | 用法 |
| --- | --- | --- |
| 本地参考源码 | `/Users/mac/Dev/Desktop/scrcpy`，版本声明为 `5.0.1`，检查时工作区无修改 | 阅读协议与必要时定制；本项目不依赖该绝对路径构建 |
| Android 端 server | [scrcpy-server-v5.0.1](../../src-tauri/resources/scrcpy/scrcpy-server-v5.0.1) | 随应用携带，Rust 通过 ADB 推送至设备并启动 |
| 资源锁定清单 | [manifest.json](../../src-tauri/resources/scrcpy/manifest.json) | 记录版本、固定下载地址、大小和 SHA-256；Rust 据此校验并启动 server |
| 上游许可 | [LICENSE](../../src-tauri/resources/scrcpy/LICENSE) | 与 server 一起打包 |
| 本机 ADB | `/Users/mac/Env/scrcpy-macos-aarch64-v4.0/adb`；实际版本 `37.0.0-14910828` | 当前可用，版本来自 `adb version`，不能从工具目录名推断 |
| 桌面 scrcpy 客户端 | PATH 指向 `scrcpy-macos-aarch64-v4.0` 工具目录 | 内嵌实现不依赖其桌面窗口，也不使用此目录中的旧 server |

本轮下载的是 Android 端 server 资源，不是 macOS 可执行程序。文件虽然没有 `.jar` 扩展名，仍是包含 Android DEX 的压缩包；应由手机上的 `app_process` 启动，不能在电脑上直接执行。

资源来源为 [官方 v5.0.1 Release](https://github.com/Genymobile/scrcpy/releases/tag/v5.0.1)。server 大小为 `733930` 字节；校验值来自该 release 的 GitHub API 资产 `digest`，并与实际下载内容比对。

## 恢复与检查

在项目根目录执行，需要 Python 3，使用标准库，无额外 Python 依赖：

```sh
# 缺失或不匹配时下载锁定资源；已经匹配时直接复用。
python3 scripts/prepare-scrcpy.py

# 只验证大小及 SHA-256，不联网、不修改文件。
python3 scripts/prepare-scrcpy.py --check
```

脚本不追随 `latest`，下载完整并通过校验后才替换目标文件。升级或定制 server 时，必须同时更新清单、资源、启动版本参数与协议适配；仅修改文件名不构成升级。

[Tauri 配置](../../src-tauri/tauri.conf.json) 登记 server、清单和许可为 bundle resources。Rust 使用 Tauri 的 Resource 路径解析读取 `resources/scrcpy/scrcpy-server-v5.0.1`，不依赖启动时的工作目录。

ADB 复用本机已安装版本，界面提供路径配置，留空时查询 PATH，不将当前机器的绝对路径写死到应用。Finder 启动环境可能与终端不同；找不到时填写可执行文件绝对路径。只有确有需要时才下载平台对应的官方工具包。

## 源码阅读入口

下表路径均相对于用户的本地 clone，链接固定为同版本的上游文件，不读取提交历史。

| 阅读目的 | 文件 |
| --- | --- |
| 版本与构建参数 | [meson.build](https://github.com/Genymobile/scrcpy/blob/v5.0.1/meson.build)、[server/build.gradle](https://github.com/Genymobile/scrcpy/blob/v5.0.1/server/build.gradle) |
| 整体结构和启动过程 | [doc/develop.md](https://github.com/Genymobile/scrcpy/blob/v5.0.1/doc/develop.md)、[Server.java](https://github.com/Genymobile/scrcpy/blob/v5.0.1/server/src/main/java/com/genymobile/scrcpy/Server.java) |
| 版本检查和 server 参数 | [Options.java](https://github.com/Genymobile/scrcpy/blob/v5.0.1/server/src/main/java/com/genymobile/scrcpy/Options.java) |
| 三路 socket、dummy byte、设备名 | [DesktopConnection.java](https://github.com/Genymobile/scrcpy/blob/v5.0.1/server/src/main/java/com/genymobile/scrcpy/device/DesktopConnection.java) |
| 媒体头、session 元数据及帧标志 | [Streamer.java](https://github.com/Genymobile/scrcpy/blob/v5.0.1/server/src/main/java/com/genymobile/scrcpy/device/Streamer.java)、[app/src/demuxer.c](https://github.com/Genymobile/scrcpy/blob/v5.0.1/app/src/demuxer.c) |
| PCM 格式与采集 | [AudioConfig.java](https://github.com/Genymobile/scrcpy/blob/v5.0.1/server/src/main/java/com/genymobile/scrcpy/audio/AudioConfig.java)、[AudioRawRecorder.java](https://github.com/Genymobile/scrcpy/blob/v5.0.1/server/src/main/java/com/genymobile/scrcpy/audio/AudioRawRecorder.java) |
| 控制消息编号与序列化 | [app/src/control_msg.h](https://github.com/Genymobile/scrcpy/blob/v5.0.1/app/src/control_msg.h)、[app/src/control_msg.c](https://github.com/Genymobile/scrcpy/blob/v5.0.1/app/src/control_msg.c) |
| 手机端输入处理 | [ControlMessageReader.java](https://github.com/Genymobile/scrcpy/blob/v5.0.1/server/src/main/java/com/genymobile/scrcpy/control/ControlMessageReader.java)、[Controller.java](https://github.com/Genymobile/scrcpy/blob/v5.0.1/server/src/main/java/com/genymobile/scrcpy/control/Controller.java) |
| 仅在确定需要定制时构建 | [doc/build.md](https://github.com/Genymobile/scrcpy/blob/v5.0.1/doc/build.md) |

本地版本声明已检查，但未来本地 clone 可能升级或被修改。协议依据始终是资源清单对应版本；定制前先核对源码，不将不同版本混用。

## 第 2 步的接入约定

采用已验收调研中的单一路径：Rust 管理 server 与 ADB 隧道，Tauri 二进制 Channel 传媒体，页面内 WebCodecs/Canvas 与 AudioWorklet 播放。详细分帧与背压要求只维护在 [调研文档](../research/scrcpy-embedding.md)。

启动参数基线为 `5.0.1`、`tunnel_forward=true`、`video_codec=h264`、`audio_codec=raw`、`max_size=1280`、`max_fps=30`、`video_bit_rate=4000000`；默认开启控制通道。设置 `clipboard_autosync=false`、`power_on=false`，保留协议元数据与清理能力。实际参数由 Rust 会话模块统一构造。

本地源码核对补充：

- socket 名是 `scrcpy_` 加 **8 位补零十六进制** scid；同一标识用于启动参数和 forward，不能随意截断。
- 第一条 socket 的 dummy byte 可用于确认 server 已接受连接；设备名在三条连接建立后才发送，不能先等待完整设备名再连接音频和控制。
- v5.0.1 的元数据开关名是 `send_stream_meta`，不是根据旧教程猜出的 `send_codec_meta`；初期沿用默认开启状态，不使用关闭全部元数据的 `raw_stream=true`。
- 首个客户端只需最小视频、PCM 和点击/滑动链路；设备列表界面、连接向导及完整快捷操作在后续路线图步骤完善。

## 会话和故障定位

连接并授权设备后运行 `npm run tauri dev`，或构建并打开 macOS 应用。点击开始会初始化页面媒体能力，再推送 server、建立三路 socket；音频失败时保留视频并显示原因。停止和正常退出会释放本次会话的隧道与远端临时文件。

应用只允许一个桌面进程。重复启动会唤起现有窗口；测试新版前应先退出旧版。macOS 可在投屏期间运行 `python3 scripts/check-single-instance.py` 检查重复启动保护，不会发送手机输入。

界面中的帧率是实际绘制帧数，静态画面可能接近零；音频缓冲不是端到端延迟。定位卡顿时同时检查欠载/超载、解码队列以及 `adb forward --list` 中是否意外存在多个对应会话，不根据单一 FPS 数字判断音频质量。
