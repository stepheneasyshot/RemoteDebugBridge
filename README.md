# Remote Debug Bridge

Tauri 2 桌面应用，使用原生 TypeScript + Vite 和 Rust。

## 项目文档

- [AGENTS：协作规则与文档入口](AGENTS.md)
- [PRD：产品范围、交互和验收](docs/PRD.md)
- [实施路线图：从工程到交付共 5 步](docs/ROADMAP.md)
- [设计原型：三页原稿与视觉规范](docs/design/README.md)
- [调研：scrcpy 音视频内嵌 Tauri 页面](docs/research/scrcpy-embedding.md)

## 开发

安装 Rust、Node.js 和对应平台的 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)。

```sh
npm install
npm run tauri dev
```

## 构建

```sh
npm run tauri build
```

`npm run dev` 仅启动前端，Rust 调用需要通过 Tauri 启动。

- `src/`：TypeScript 前端
- `src-tauri/`：Rust 后端和 Tauri 配置
- 根目录 `Cargo.toml`：Rust workspace

应用标识为 `com.remotedebugbridge.app`，发布前可在 `src-tauri/tauri.conf.json` 调整。
