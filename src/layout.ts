import { workbenchControls, terminalMarkup } from "./workbench";
import { icon } from "./icons";
export { icon } from "./icons";

export function layout(): string {
  return `
<main class="pages">
    <div id="notice" role="status" aria-live="polite" aria-atomic="true" hidden></div>
    <section id="page-welcome" class="page">
      <div class="welcome-hero">
        <div class="welcome-badge"><span class="dot"></span><span>REMOTE DEBUG BRIDGE</span><span class="badge-divider">/</span><code>ANDROID WORKSPACE</code></div>
        <h1>欢迎使用 Android 调试工作台</h1>
        <p class="hero-copy">一个基于 ADB 的轻量设备调试工具。<br>可视化控制、实时投屏与命令交互，在同一个窗口完成。</p>
        <div class="actions"><button data-page="devices" class="primary hero-cta">${icon("devices")}开始选择设备 ${icon("arrow")}</button></div>
      </div>
      <div class="quick-start"><div class="section-title"><h2 class="cyan">${icon("bolt")}三步连接指南 <small>QUICK START</small></h2><span class="muted">无需复杂配置</span></div>
      <div class="guide-grid">
        <article class="guide"><div class="guide-top"><span class="step">01</span>${icon("code")}</div><h3>开启 USB 调试</h3><p>进入手机「设置 › 关于手机」，连续点击「版本号」7 次开启开发者选项，并启用「USB 调试」。</p><span class="guide-tag">${icon("check")}设置 › 开发者选项</span></article>
        <article class="guide"><div class="guide-top"><span class="step">02</span>${icon("cable")}</div><h3>连接数据线或无线 ADB</h3><p>使用 USB 数据线直连电脑，或在同一 Wi-Fi 局域网下，通过配对码进行无线连接。</p><span class="guide-tag">${icon("wifi")}USB / 无线调试</span></article>
        <article class="guide"><div class="guide-top"><span class="step">03</span>${icon("shield")}</div><h3>手机端确认授权</h3><p>手机弹出 USB 调试授权提示时，勾选「始终允许这台计算机」并确认，完成设备授权。</p><span class="guide-tag">${icon("key")}RSA 密钥授权</span></article>
      </div></div>
    </section>
    <section id="page-devices" class="page" hidden>
      <div class="page-heading"><div><p class="eyebrow green"><span class="pill green">HARDWARE TELEMETRY HUB</span> <span id="device-environment" class="pill">环境未检测</span></p><h1>设备连接与管理 <span>(Device Manager)</span></h1><p id="device-summary" class="muted">检测本地设备，选择调试目标。</p></div><div class="actions"><button data-page="welcome" class="text-button">${icon("book")}连接指引</button><button id="refresh">${icon("refresh")}刷新设备列表 <code>adb devices</code></button><button id="focus-wireless">${icon("wifi")}无线配对向导</button><button id="restart-adb" class="danger-text">${icon("power")}重启 ADB 服务 <code>kill-server</code></button></div></div>
      <div class="devices-grid"><div><div class="section-title"><h2>${icon("network")}活动目标设备 <span id="device-count" class="pill">0</span></h2><span id="scan-state" class="muted">每 5 秒刷新</span></div><div id="device-list" class="device-list"></div></div>
      <aside id="wireless-panel" class="wireless panel"><div class="section-title"><h2>${icon("wifi")}局域网无线连接向导</h2><span class="pill cyan">TCP/IP</span></div><div class="segmented" role="tablist" aria-label="无线连接方式"><button id="tab-connect" role="tab" aria-selected="true">直连模式 <small>(IP:Port)</small></button><button id="tab-pair" role="tab" aria-selected="false">配对码 <small>(Android 11+)</small></button></div>
        <form id="wireless-form"><label for="wireless-host">手机 IP 地址</label><input id="wireless-host" placeholder="192.168.1.100" required spellcheck="false"><div id="connect-fields"><label for="connect-port">连接端口</label><input id="connect-port" type="number" min="1" max="65535" placeholder="无线调试首页显示的端口" required></div><div id="pair-fields" hidden><label for="pair-port">配对端口</label><input id="pair-port" type="number" min="1" max="65535" placeholder="配对码弹窗显示的端口" disabled required><label for="pair-code">6 位配对码</label><input id="pair-code" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" placeholder="仅用于本次配对" disabled required></div><button id="wireless-submit" class="secondary wide" type="submit">${icon("cable")}连接设备</button></form>
        <p id="wireless-help" class="hint">手机与电脑需在同一局域网。输入无线调试首页的连接端口；传统 TCP/IP 模式常用 5555。</p><p id="wireless-result" role="status" class="result" hidden></p><div class="history-heading"><h3>最近成功连接</h3><button id="clear-history" class="text-button">清空</button></div><div id="connection-history"></div>
      </aside></div>
    </section>
    <section id="page-workbench" class="page workbench" hidden>
      <div class="workbench-grid"><aside class="control-panel"><div class="workbench-back"><button data-page="devices" class="text-button">${icon("back")}返回设备列表</button></div><div class="workbench-heading panel"><div><p class="eyebrow cyan">${icon("terminal")}LIVE WORKSPACE</p><label for="workbench-device">当前设备</label><div class="device-picker"><select id="workbench-device" aria-describedby="workbench-meta"><option value="">选择设备</option><option value="add-wireless">＋ 添加无线设备…</option></select><button id="workbench-refresh" title="刷新设备列表" aria-label="刷新设备列表">${icon("refresh")}</button></div><p id="workbench-meta" class="muted">选择在线设备，或添加无线设备</p></div></div><section class="session-panel panel"><div class="section-title"><h2>${icon("screen")}投屏会话</h2><span id="state" class="pill" role="status" aria-label="投屏状态">未开始投屏</span></div><div class="actions"><button id="start" class="primary" disabled>${icon("play")}开始投屏</button><button id="stop" disabled>${icon("stop")}停止</button></div><p class="hint">画面和声音在当前窗口播放。</p></section>${workbenchControls()}<section class="control-section"><h2>${icon("volumeUp")}音频播放 <small>AUDIO</small></h2><label class="check"><input type="checkbox" id="mute"> 静音</label><input type="range" id="volume" min="0" max="100" value="80" aria-label="播放音量"><p id="audio-state" class="hint">尚未接收音频</p></section><section class="control-section"><h2>${icon("stats")}运行状态 <small>TELEMETRY</small></h2><dl class="stats"><dt>画面尺寸</dt><dd id="dimensions">—</dd><dt>已显示帧</dt><dd id="frames">0</dd><dt>显示帧率</dt><dd id="fps">—</dd><dt>音频缓冲</dt><dd id="audio-buffer">—</dd><dt>解码队列</dt><dd id="decode-queue">0</dd></dl></section><div class="session-log"><span>${icon("info")}会话消息</span><pre id="message" role="log" aria-live="polite">尚未开始投屏</pre></div>${terminalMarkup()}</aside>
      <article class="viewer panel"><div class="viewer-bar"><div class="viewer-title">${icon("screen")}<div><h2>实时设备投屏</h2><strong id="device-name">等待设备</strong></div></div><select id="view-scale" aria-label="视口缩放"><option value="fit">适应区域</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option></select><button id="fullscreen" title="全屏显示">${icon("expand")}全屏</button></div><div id="viewport"><canvas id="screen" width="720" height="1280" aria-label="设备实时画面" tabindex="0"></canvas><div id="placeholder">${icon("screen")}<h2>设备画面将在这里显示</h2><p>选择在线设备后，点击「开始投屏」</p><button id="focus-device">选择设备 ${icon("arrow")}</button></div></div><div id="stream-info" class="stream-info">等待音视频数据</div></article></div>
    </section>
</main>
<dialog id="wireless-dialog" aria-labelledby="wireless-dialog-title"><div class="wireless-dialog-heading"><h2 id="wireless-dialog-title">${icon("wifi")}添加无线设备</h2><button id="wireless-close" aria-label="关闭无线连接窗口">${icon("close")}</button></div><div id="wireless-dialog-content"></div></dialog>
<dialog id="restart-dialog"><h2>重启本机 ADB 服务？</h2><p>这会停止当前投屏，并中断本机其他 ADB 客户端的连接。完成后将重新检测设备。</p><div class="actions"><button id="cancel-restart">取消</button><button id="confirm-restart" class="danger">确认重启</button></div></dialog>`;
}
