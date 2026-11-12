# 设计原型来源

原稿由用户于 2026-11-12 提供，来源目录：`/Users/mac/Downloads/stitch_android_adb_control_toolbox`。本目录保存原文件副本，后续开发以仓库内副本为依据。

| 编号 | 页面 | 原始目录 | 仓库副本 |
| --- | --- | --- | --- |
| P1 | 欢迎指引 | `1._droidcraft` | [HTML](01-welcome/code.html)、[截图](01-welcome/screen.png) |
| P2 | 设备管理 | `2._droidcraft` | [HTML](02-devices/code.html)、[截图](02-devices/screen.png) |
| P3 | 调试工作台 | `3._droidcraft` | [HTML](03-workbench/code.html)，原稿未提供截图 |
| DS | 视觉规范 | `droidcraft_adb_studio_desktop` | [DESIGN.md](DESIGN.md) |

## 阅读边界

- HTML 与截图说明页面结构及交互意图，不代表功能已实现。原型依赖外部 Tailwind、字体和图片，截图中存在字体回退、图片缺失及重复设备选择器等导出问题。
- P3 使用模拟命令输出、固定设备参数和随机 FPS；手机内容是 HTML 示意，不是真实视频。实现时必须接入真实数据。
- `cmd sensor mock-hinge`、`cmd sensor set-hinge-angle` 和固定设备状态编号是原型中的演示写法，不能据此承诺所有 Android 设备可用。
- P2 无线配对页混用了扫码说明和配对码表单；产品要求以 [PRD](../PRD.md) 的连接流程为准。
- DS 的通用工作站说明包含脚本、反编译、文件管理等扩展愿景。首版范围以 PRD 为准，不因设计规范提到某功能就自动扩展开发范围。

## 视觉落地规则

- 保留深色分层背景、绿色主操作、青色连接/投屏强调色、等宽设备标识和命令输出。颜色优先采用实际三页 HTML 与 DS frontmatter 一致的 token：背景 `#0b1326`、低层面板 `#131b2e`、主色 `#4edea3`、次色 `#4cd7f6`、正文 `#dae2fd`。
- 以三页实际结构作为布局依据；DS 中更宽泛的多面板工作站布局不额外引入页面。
- 标题与正文使用易读无衬线字体，命令与数值用等宽字体。字体与图标本地可用，不以外部 CDN 可访问作为桌面应用启动条件。
- 纠正导出错误，保留一个清晰的当前设备选择入口。真实设备信息与连接状态在顶部、侧栏和工作台保持一致。
- 原型品牌名为 DroidCraft Studio，仓库与现有应用名为 Remote Debug Bridge；品牌更名须确认，不能随界面还原自动更改包名、应用标识或版本号。
