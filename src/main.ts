import { checkEnvironment, connectWireless, deviceDetails, listDevices, pairWireless, restartAdb, type Device, type DeviceDetails, type Environment } from "./bridge";
import { layout, icon } from "./layout";
import { createWorkbench } from "./workbench";
import { createMirror } from "./mirror";
import "./styles.css";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = layout();
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const workbench = createWorkbench(notify);
const mirror = createMirror(() => { void workbench.refresh(true); });
async function bindTarget(device: Device | undefined, path: string) {
  await workbench.setTarget(undefined, path);
  await mirror.setTarget(device, path);
  await workbench.setTarget(device, path);
}
const devicePicker = el<HTMLSelectElement>("workbench-device");
const wirelessDialog = el<HTMLDialogElement>("wireless-dialog");
const wirelessPanel = el("wireless-panel");
const wirelessHome = wirelessPanel.parentElement!;
let pickerOptions = "";
const wirelessForm = el<HTMLFormElement>("wireless-form");
const hostInput = el<HTMLInputElement>("wireless-host");
const connectPort = el<HTMLInputElement>("connect-port");
const pairPort = el<HTMLInputElement>("pair-port");
const pairCode = el<HTMLInputElement>("pair-code");
type Page = "welcome" | "devices" | "workbench";
let page: Page = "welcome";
const adbPath = ""; // Legacy IPC field; Rust always selects the bundled executable.
let revision = 0;
let environment: Environment | undefined;
let devices: Device[] = [];
let selected: Device | undefined;
let initialSelection = true;
let switching = false;
let operation = false;
let wirelessPending = false;
let scanning = false;
let scanFinished: Promise<void> = Promise.resolve();
let wirelessMode: "connect" | "pair" = "connect";
const details = new Map<string, DeviceDetails>();
let detailRequest = 0;
interface Connection { host: string; port: number; address: string }
let history: Connection[] = [];
try {
  localStorage.removeItem("adb-path");
  const saved: unknown = JSON.parse(localStorage.getItem("wireless-history") ?? "[]");
  if (Array.isArray(saved)) history = saved.filter((entry): entry is Connection => entry && typeof entry.host === "string" && entry.host.length <= 64 && typeof entry.address === "string" && entry.address.length <= 100 && Number.isInteger(entry.port) && entry.port > 0 && entry.port <= 65535).slice(0, 8);
} catch { /* Local preferences are optional. */ }
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
const transport = (device: Device) => ({ usb: "USB", wireless: "无线 ADB", emulator: "模拟器", unknown: "未知传输" })[device.transport];
const stateName = (state: string) => ({ device: "已连接", unauthorized: "待授权", offline: "离线", no: "无访问权限", recovery: "Recovery", sideload: "Sideload" } as Record<string, string>)[state] ?? state;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
function notify(text: unknown, error = false) {
  clearTimeout(noticeTimer);
  const notice = el("notice"); notice.hidden = false; notice.textContent = String(text); notice.classList.toggle("error", error);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, error ? 8000 : 3500);
}
function navigate(next: Page) {
  page = next;
  for (const name of ["welcome", "devices", "workbench"]) el(`page-${name}`).hidden = name !== next;
  if (next === "devices") void discover();
}
function controls() {
  for (const id of ["restart-adb", "tab-connect", "tab-pair", "wireless-submit"]) el<HTMLButtonElement>(id).disabled = operation || switching || wirelessPending;
  el<HTMLButtonElement>("refresh").disabled = operation || scanning || switching || wirelessPending;
  devicePicker.disabled = operation || switching || wirelessPending;
  el<HTMLButtonElement>("workbench-refresh").disabled = operation || scanning || switching || wirelessPending;
  el<HTMLButtonElement>("wireless-close").disabled = operation || switching || wirelessPending;
  hostInput.disabled = operation || wirelessPending;
  connectPort.disabled = operation || wirelessPending || wirelessMode !== "connect";
  pairPort.disabled = pairCode.disabled = operation || wirelessPending || wirelessMode !== "pair";
  document.querySelectorAll<HTMLButtonElement>("[data-target], [data-retry]").forEach((button) => { button.disabled = operation || switching || wirelessPending; });
}
function renderEnvironment() {
  const badge = el("device-environment");
  badge.textContent = environment?.daemonReady ? "ADB 已就绪" : "ADB 不可用";
  badge.classList.toggle("green", !!environment?.daemonReady);
  badge.classList.toggle("error-text", !environment?.daemonReady);
}
function renderTarget() {
  const visible = [...devices];
  if (selected && !visible.some(device => device.serial === selected!.serial)) visible.push(selected);
  const options = '<option value="" disabled>选择设备</option>' + visible.map(device =>
    `<option value="device:${escape(device.serial)}" ${device.state !== "device" ? "disabled" : ""}>${escape(device.model)} · ${transport(device)} · ${escape(device.serial)}${device.state !== "device" ? ` · ${escape(stateName(device.state))}` : ""}</option>`
  ).join("") + '<option value="add-wireless">＋ 添加无线设备…</option>';
  // Keep the native menu stable during unchanged background scans.
  if (options !== pickerOptions) { devicePicker.innerHTML = options; pickerOptions = options; }
  devicePicker.value = selected ? `device:${selected.serial}` : "";
  const info = selected && details.get(selected.serial);
  el("workbench-meta").textContent = selected ? `${transport(selected)} · ${selected.serial} · ${stateName(selected.state)}${info ? ` · Android ${info.android ?? "未知"} · ${info.resolution ?? "尺寸未知"}` : ""}` : "选择在线设备，或添加无线设备";
}
function metrics(info?: DeviceDetails): string {
  const entries = [
    ["OS & PLATFORM", info?.android ? `Android ${info.android}` : "未知", info?.api ? `API ${info.api}` : "API 未知"],
    ["DISPLAY METRICS", info?.resolution ?? "未知", info?.density ? `${info.density} DPI` : "密度未知"],
    ["POWER STATUS", info?.battery != null ? `${Math.round(info.battery)}%${info.charging == null ? "" : info.charging ? " · 充电中" : " · 未充电"}` : "未知", info?.temperature != null ? `${info.temperature.toFixed(1)} °C` : "温度未知"],
  ];
  return `<div class="device-metrics">${entries.map(([label, value, sub]) => `<div><span>${label}</span><strong>${escape(value)}</strong><small>${escape(sub)}</small></div>`).join("")}</div><p class="device-memory">${info?.memoryMb != null ? `系统可用物理内存总量 ${(info.memoryMb / 1024).toFixed(1)} GiB` : "选择设备后读取详情；无法读取的字段显示未知。"}</p>`;
}
function renderDevices() {
  const online = devices.filter((device) => device.state === "device");
  el("device-summary").textContent = `${online.length} 台在线 · ${devices.length - online.length} 台待处理；选择一台设备进入工作台。`;
  el("device-count").textContent = `${online.length} ONLINE`;
  el("device-count").classList.toggle("green", online.length > 0);
  const visible = [...devices];
  if (selected && !visible.some((device) => device.serial === selected!.serial)) visible.push(selected);
  el("device-list").innerHTML = visible.length ? visible.map((device) => {
    const current = selected?.serial === device.serial;
    const online = device.state === "device";
    const help = device.state === "unauthorized" ? "请解锁手机并确认 USB 调试授权，然后刷新设备列表。" : device.state === "no" ? "ADB 没有设备访问权限，请检查本机 USB 权限与驱动。" : "设备当前不可操作，请检查数据线、无线网络或手机调试设置。";
    return `<article class="device-card ${current ? "selected" : ""} ${online ? "" : "unavailable"}"><div class="device-card-heading"><div class="device-icon ${online ? "" : "muted"}">${icon(device.transport === "wireless" ? "wifi" : "phone")}</div><div class="device-identity"><h3>${escape(device.model)}</h3><div class="device-badges"><span class="pill ${online ? "green" : "warning"}">${online ? '<span class="dot"></span>' : ""}${stateName(device.state)}</span><span class="pill cyan">${transport(device)}</span>${current ? '<span class="current-label">TARGET DEFAULT · 当前目标</span>' : ""}</div><code><span>Serial:</span> ${escape(device.serial)}</code></div></div>${online ? metrics(details.get(device.serial)) : `<p class="device-warning">${help}</p>`}<div class="device-card-actions">${online ? `<button data-target="${escape(device.serial)}" class="${current ? "primary" : ""}">${current ? "进入调试工作台" : "选择并进入工作台"}${icon("arrow")}</button>` : `<button data-rescan>${icon("shield")}重新检测授权 / 连接</button>`}</div></article>`;
  }).join("") : `<div class="empty-state">${icon("devices")}<h3>${environment?.available === false ? "内置 ADB 不可用" : "等待你的第一台设备"}</h3><p>连接数据线并在手机上确认授权，<br>或使用右侧无线连接。</p><button data-page="welcome">查看连接指引 ${icon("arrow")}</button></div>`;
  renderTarget(); controls();
}
async function loadDetails(device: Device) {
  if (device.state !== "device") return;
  const current = ++detailRequest;
  const path = adbPath;
  try {
    const info = await deviceDetails(path, device.serial);
    if (current !== detailRequest || path !== adbPath || selected?.serial !== device.serial || selected.state !== "device") return;
    details.set(device.serial, info); renderDevices();
  } catch (error) {
    if (current === detailRequest && selected?.serial === device.serial) notify(`设备详情暂不可用：${String(error)}`, true);
  }
}
async function selectTarget(serial: string, enter = false) {
  if (switching || operation) return;
  const next = devices.find((device) => device.serial === serial);
  if (!next || next.state !== "device") { renderTarget(); return; }
  if (selected?.serial !== next.serial || selected?.state !== next.state) {
    switching = true; controls();
    try { await bindTarget(next, adbPath); selected = next; initialSelection = false; }
    catch (error) { notify(`切换设备失败：${String(error)}`, true); return; }
    finally { switching = false; renderDevices(); }
  }
  if (next) void loadDetails(next);
  if (enter && next?.state === "device") navigate("workbench");
}
async function discover(manual = false) {
  if (scanning) {
    if (manual) { await scanFinished; await discover(true); }
    return;
  }
  if (operation || switching) return;
  let finishScan!: () => void;
  scanFinished = new Promise<void>(resolve => { finishScan = resolve; });
  scanning = true; controls();
  const current = revision;
  try {
    const found = await listDevices(adbPath);
    if (current !== revision || operation || switching) return;
    const changed = JSON.stringify(devices) !== JSON.stringify(found);
    devices = found;
    el("scan-state").textContent = `最近检测 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
    if (selected) {
      const next = found.find((device) => device.serial === selected!.serial) ?? { ...selected, state: "offline" };
      if (next.state !== selected.state) {
        switching = true; controls();
        selected = next; detailRequest++; details.delete(next.serial);
        try { await bindTarget(next, adbPath); }
        finally { switching = false; controls(); }
        if (next.state !== "device") notify("当前目标已离线或未授权，投屏已停止。重新连接后可再次开始。", true);
        else void loadDetails(next);
      }
    } else if (initialSelection && found.filter((device) => device.state === "device").length === 1) {
      await selectTarget(found.find((device) => device.state === "device")!.serial);
    }
    if (changed || manual) renderDevices();
    if (manual && selected) void loadDetails(selected);
  } catch (error) {
    if (current !== revision || operation || switching) return;
    el("scan-state").textContent = "检测失败，可手动重试";
    if (selected?.state === "device") {
      switching = true; controls();
      selected = { ...selected, state: "offline" };
      try { await bindTarget(selected, adbPath); }
      finally { switching = false; controls(); }
    }
    devices = []; renderDevices(); notify(error, true);
  } finally { scanning = false; finishScan(); controls(); if (current !== revision) void discover(); }
}
async function inspectEnvironment() {
  if (operation || switching) return;
  operation = true; controls();
  try {
    el("device-environment").textContent = "检测中…";
    environment = await checkEnvironment(adbPath); renderEnvironment();
    if (environment.error) notify(environment.error, true); else el("notice").hidden = true;
  } catch (error) { notify(error, true); }
  finally { operation = false; controls(); }
  await discover(true);
}
function openWireless() {
  if (operation || switching || wirelessDialog.open) return;
  mode("connect");
  el("wireless-result").hidden = true;
  el("wireless-dialog-content").append(wirelessPanel);
  wirelessDialog.showModal();
  hostInput.focus();
}
wirelessDialog.addEventListener("cancel", event => {
  if (operation || switching || wirelessPending) event.preventDefault();
});
wirelessDialog.addEventListener("close", () => {
  if (wirelessDialog.open) return;
  pairCode.value = "";
  wirelessHome.append(wirelessPanel);
  if (page === "workbench") devicePicker.focus();
});
el("wireless-close").addEventListener("click", () => wirelessDialog.close());
devicePicker.addEventListener("change", () => {
  const value = devicePicker.value;
  // The action item must never replace the current target in the selector.
  devicePicker.value = selected ? `device:${selected.serial}` : "";
  if (value === "add-wireless") openWireless();
  else if (value.startsWith("device:")) void selectTarget(value.slice(7));
});
el("workbench-refresh").addEventListener("click", () => void discover(true));
el("focus-device").addEventListener("click", () => { devicePicker.focus(); void discover(true); });
function mode(next: "connect" | "pair") {
  wirelessMode = next;
  el("connect-fields").hidden = next !== "connect"; el("pair-fields").hidden = next !== "pair";
  el("tab-connect").setAttribute("aria-selected", String(next === "connect"));
  el("tab-pair").setAttribute("aria-selected", String(next === "pair"));
  el("wireless-submit").innerHTML = next === "connect" ? `${icon("cable")}连接设备 (adb connect)` : `${icon("shield")}使用配对码配对`;
  el("wireless-help").textContent = next === "connect" ? "填写无线调试首页的连接端口。它与配对码弹窗中的配对端口不同；传统 TCP/IP 模式常用 5555。" : "Android 11+：开发者选项 → 无线调试 → 使用配对码配对设备。配对码不保存。";
  pairCode.value = ""; controls();
}
function saveHistory() {
  try { localStorage.setItem("wireless-history", JSON.stringify(history)); } catch { /* Optional storage. */ }
  renderHistory();
}
function renderHistory() {
  el("connection-history").innerHTML = history.length ? history.map((entry, index) => `<button class="history-item" data-retry="${index}" title="重新连接">${icon("wifi")}<code>${escape(entry.address)}</code>${icon("arrow")}</button>`).join("") : '<p class="hint">成功连接后，地址会出现在这里。</p>';
  el<HTMLButtonElement>("clear-history").disabled = !history.length;
  controls();
}
async function wirelessRequest() {
  if (operation || switching || wirelessPending || !wirelessForm.reportValidity()) return;
  wirelessPending = true;
  try {
    const requestMode = wirelessMode;
    const host = hostInput.value.trim();
    const port = Number(requestMode === "connect" ? connectPort.value : pairPort.value);
    const code = pairCode.value; pairCode.value = "";
    const result = el("wireless-result"); result.hidden = false; result.classList.remove("error-text");
    result.textContent = requestMode === "connect" ? "正在连接…" : "正在配对…";
    operation = true; controls();
    let connectedAddress: string | undefined;
    try {
      if (requestMode === "pair") {
        await pairWireless(adbPath, host, port, code);
        result.textContent = "配对成功。请填写无线调试首页的连接端口完成连接；若设备已自动上线，可直接从列表选择。";
        mode("connect");
      } else {
        connectedAddress = await connectWireless(adbPath, host, port);
        history = [{ host, port, address: connectedAddress }, ...history.filter((entry) => entry.address !== connectedAddress)].slice(0, 8);
        saveHistory(); result.textContent = `连接成功：${connectedAddress}`;
      }
    } catch (error) { result.textContent = String(error); result.classList.add("error-text"); }
    finally { operation = false; controls(); }
    await discover(true);
    if (connectedAddress) {
      await selectTarget(connectedAddress);
      if (wirelessDialog.open && selected?.serial === connectedAddress && selected.state === "device") {
        wirelessDialog.close();
        notify(`已连接并选择 ${selected.model}`);
      } else if (wirelessDialog.open) {
        result.textContent = "连接请求已完成，但目标尚未就绪。请重试连接或刷新设备列表。";
        result.classList.add("error-text");
      }
    }
  } catch (error) {
    const result = el("wireless-result"); result.hidden = false;
    result.textContent = String(error); result.classList.add("error-text");
  } finally { wirelessPending = false; controls(); }
}

document.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button");
  if (!button || button.disabled) return;
  if (button.dataset.page) navigate(button.dataset.page as Page);
  if (button.dataset.target) void selectTarget(button.dataset.target, true);
  if (button.hasAttribute("data-rescan")) void discover(true);
  if (button.dataset.retry !== undefined) {
    const entry = history[Number(button.dataset.retry)];
    if (!entry) return;
    mode("connect"); hostInput.value = entry.host; connectPort.value = String(entry.port); void wirelessRequest();
  }
});
el("refresh").addEventListener("click", () => void inspectEnvironment());
el("tab-connect").addEventListener("click", () => mode("connect"));
el("tab-pair").addEventListener("click", () => mode("pair"));
el("focus-wireless").addEventListener("click", () => hostInput.focus());
el("clear-history").addEventListener("click", () => { history = []; saveHistory(); });
wirelessForm.addEventListener("submit", (event) => { event.preventDefault(); void wirelessRequest(); });
const restartDialog = el<HTMLDialogElement>("restart-dialog");
el("restart-adb").addEventListener("click", () => restartDialog.showModal());
el("cancel-restart").addEventListener("click", () => restartDialog.close());
el("confirm-restart").addEventListener("click", async () => {
  restartDialog.close(); if (operation || switching) return;
  operation = true; revision++; controls();
  try { await workbench.setTarget(undefined, adbPath); await mirror.stop(); await restartAdb(adbPath); notify("ADB 服务已重启，正在重新检测设备。"); }
  catch (error) { notify(error, true); }
  finally { operation = false; controls(); }
  await inspectEnvironment();
  if (selected) await workbench.setTarget(selected, adbPath);
});
document.addEventListener("keydown", (event) => {
  if (!wirelessDialog.open && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") { event.preventDefault(); navigate("devices"); }
});
// One scan at a time; never change targets just because another device appears.
setInterval(() => { if (!document.hidden && (page === "devices" || page === "workbench" || selected)) void discover(); }, 5000);
renderDevices(); renderHistory(); void inspectEnvironment();
