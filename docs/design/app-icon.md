# 应用图标

设计方向由用户确认：深蓝底、薄荷绿与青色，手机轮廓与连接桥，无文字，圆角方形，四角透明。使用内置 imagegen 生成，未使用 API/CLI 生图。

## 资源与接入

- [原始透明 PNG](../../assets/branding/app-icon.png)：1254 × 1254，保留生成结果及 alpha。
- [桌面图标](../../src-tauri/icons/)：PNG、ICO、ICNS 及 Windows Store 图标；统一由原图通过 Tauri icon 工具转换。
- [页面图标](../../public/branding/)：16、32、64、128、180、256、512、1024 像素 PNG；欢迎页、设备页、工作台共享品牌图片。
- [favicon](../../public/favicon.ico) 和 `index.html` 中的 PNG/apple-touch-icon 入口。
- `tauri.conf.json` 的 `bundle.icon` 使用上述桌面资源；Tauri 由此选择 Windows 图标资源、Unix 默认窗口 PNG、macOS 应用/Dock ICNS。macOS 原生标题栏不另加自绘图标。

圆角已包含在图片 alpha 中，无需 CSS 裁切，也未铺白底。转换沿用 Tauri CLI 的多分辨率容器。此桌面项目不引入 CLI 顺带生成的 Android/iOS 资源目录。

## 再生成格式

在项目根目录执行 `npx tauri icon assets/branding/app-icon.png --output <临时输出目录>`，将输出目录顶层的 PNG、ICO、ICNS 复制到 `src-tauri/icons/`。页面 PNG 可通过 `--png 16 --png 32 --png 64 --png 128 --png 180 --png 256 --png 512 --png 1024` 单独输出，再复制到 `public/branding/`；将 `icon.ico` 同步到 `public/favicon.ico`。

图标配置更新后需要重新构建应用和安装包，才能替换已生成产物中的图标。验收证据与待验项只记录在[路线图](../ROADMAP.md)。

## 最终生成提示词

```text
Create one production-ready desktop application icon for Remote Debug Bridge, an Android device debugging and screen mirroring app. Single square 1024x1024 image, tightly framed rounded-square tile with real transparent corners outside the tile, no surrounding canvas margin, no drop shadow outside the tile. Deep midnight navy #0b1326 tile, softly rounded corners. Central bold geometric symbol combining an upright smartphone outline with a short elegant connecting bridge/link crossing its lower center, in mint green #4edea3 and cyan #4cd7f6. Clear distinctive minimal silhouette legible at 16 and 32 pixels, thick consistent strokes, carefully balanced negative space, subtle premium dimensional lighting confined inside the tile, mostly flat graphic aesthetic matching a dark developer tool. No letters, no words, no Android mascot, no watermark, no mockup, no scene, no extra icons. Export a finished precisely cut out icon with alpha transparency outside rounded corners.
```
