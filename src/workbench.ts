import { icon } from "./icons";
import { cancelTerminal, changeScreen, quickAction, readScreen, runTerminal, saveScreenshot, setWorkbenchTarget, type Device, type ScreenChange, type ScreenSettings } from "./bridge";

export function workbenchControls(): string {
  const actions = [["wake","亮屏"],["sleep","锁屏"],["power","电源键"],["powerLong","长按电源"],["home","桌面"],["recent","最近任务"],["back","返回"],["volumeDown","音量 −"],["volumeUp","音量 +"],["muteDevice","设备静音切换"],["notifications","展开通知栏"],["screenshot","截图保存"],["reboot","重启设备"]];
  const gestures = [["homeSwipe","底部上滑"],["shortSwipe","短距离上滑"],["mediumSwipe","中距离上滑"],["longSwipe","快速长上滑"],["topSwipe","顶部下滑"],["shortSwipeDown","短距离下滑"],["mediumSwipeDown","中距离下滑"],["longSwipeDown","快速长下滑"],["leftBack","左侧返回"],["rightBack","右侧返回"],["backThree","连续返回 ×3"]];
  const keys: Record<string,string> = {wake:"224",sleep:"223",power:"26",powerLong:"longpress 26",home:"3",recent:"187",back:"4",volumeDown:"25",volumeUp:"24",muteDevice:"164"};
  const buttons = (items: string[][]) => items.map(([action,label]) => `<button data-action="${action}" aria-label="${label}" class="tool-tile ${action === "reboot" ? "danger-text" : ""}" disabled>${icon(action)}<span>${label}</span>${keys[action] ? `<small>key ${keys[action]}</small>` : ""}</button>`).join("");
  return `<section class="control-section"><h2>${icon("tune")}高频硬件与系统事件 <small>KEYEVENT</small></h2><div class="tool-grid">${buttons(actions)}</div></section><section class="control-section"><h2>${icon("swipe")}滑动手势控制 <small>GESTURES</small></h2><div class="tool-grid gesture-grid">${buttons(gestures.slice(0,8))}</div><p class="hint">按当前显示区域计算位置，适配设备当前尺寸。</p></section><section class="control-section"><h2>${icon("rightBack")}侧边滑动与返回 <small>EDGE BACK</small></h2><div class="tool-grid gesture-grid">${buttons(gestures.slice(8))}</div><p class="hint">手势效果取决于设备导航方式；连续返回按顺序发送。</p></section>
  <section class="control-section"><h2>${icon("rotate")}屏幕方向与旋转 <small>ROTATION</small></h2>  <form id="rotation-form"><label id="rotation-label">设备显示方向</label><div class="rotation-grid" role="group" aria-labelledby="rotation-label">${[0,90,180,270].map((value,index) => `<button type="button" data-tool data-rotation="${index}" aria-pressed="false" disabled><span class="rotation-icon" style="transform:rotate(${value}deg)">${icon("phone")}</span>${value}°</button>`).join("")}</div><label class="check"><input id="rotation-lock" data-tool type="checkbox" disabled>固定方向</label><div class="actions"><button id="auto-rotate" data-tool type="button" disabled>${icon("rotate")}自动旋转</button></div><button id="reset-rotation" class="reset-button wide" data-tool type="button" disabled>${icon("restore")}恢复原始方向</button></form><p class="hint">点击角度立即固定方向；关闭固定方向恢复自动旋转。恢复按钮还原本次修改前的角度和旋转设置。</p></section>
  <section class="control-section"><div class="section-title"><h2>${icon("size")}屏幕参数</h2><button id="read-screen" data-tool disabled>${icon("refresh")}刷新</button></div><p id="screen-summary" class="hint">等待设备</p><p id="restore-notice" class="result" hidden>此设备有尚未恢复的屏幕修改；停止投屏、切换设备或退出时会尝试恢复原值。</p>
  <form id="size-form"><label id="size-preset-label">屏幕比例 <span>ASPECT RATIO</span></label><div class="preset-grid" role="group" aria-labelledby="size-preset-label">${["21:9","18:9","16:9","4:3"].map(value => `<button type="button" data-tool data-size-preset="${value}" aria-pressed="false" disabled>${value}</button>`).join("")}</div><div class="two-fields"><label>宽度 px<input id="screen-width" data-tool type="number" min="200" max="7680" required disabled></label><label>高度 px<input id="screen-height" data-tool type="number" min="200" max="7680" required disabled></label></div><button class="wide" data-tool type="submit" disabled>${icon("size")}应用自定义尺寸</button><button id="reset-size" class="reset-button wide" data-tool type="button" disabled>${icon("restore")}恢复默认比例 / 尺寸</button><p class="hint">比例选项点击即生效；自定义宽高填写后应用。</p></form>
  <form id="density-form"><label for="screen-density">屏幕像素密度 <span>DENSITY / DPI</span></label><input id="density-slider" aria-label="像素密度 DPI" data-tool type="range" min="72" max="1000" disabled><div class="preset-grid">${[320,420,480,560].map(value => `<button type="button" data-tool data-dpi="${value}" aria-pressed="false" disabled>${value}</button>`).join("")}</div><div class="input-action"><input id="screen-density" data-tool type="number" min="72" max="1000" required disabled><button data-tool type="submit" disabled>应用数值</button></div><button id="reset-density" class="reset-button wide" data-tool type="button" disabled>${icon("restore")}恢复默认 DPI</button><p class="hint">预设点击即生效；滑块松开即应用，自定义数值按 Enter 或点击应用。</p></form>

  <label class="check"><input id="pointer-trace" data-tool type="checkbox" disabled>显示设备触控轨迹</label></section>`;
}
export function terminalMarkup(): string {
  return `<section class="terminal-panel panel"><div class="terminal-heading"><h2>${icon("terminal")}单次命令终端 <small>ADB SHELL</small></h2><div class="actions"><select id="terminal-preset" aria-label="命令预设"><option value="">常用查询…</option><option value="focus">当前前台窗口</option><option value="display">显示属性</option><option value="android">Android 版本</option><option value="battery">电池状态</option><option value="memory">应用内存（填写包名）</option><option value="packages">第三方应用</option></select><input id="package-name" placeholder="应用包名，例如 com.example.app" aria-label="应用包名" hidden></div></div><form id="terminal-form" class="input-action"><span class="shell-label">$ adb shell</span><input id="terminal-command" placeholder="输入设备端命令，支持管道；最多运行 30 秒" autocomplete="off" spellcheck="false" required><button id="terminal-run" class="primary" disabled>${icon("play")}执行</button><button id="terminal-cancel" type="button" disabled>${icon("stop")}取消</button><button id="terminal-clear" type="button">${icon("clear")}清空</button></form><p id="terminal-status" class="hint">输出仅保存在当前页面；取消不会回滚设备端已发生的操作。</p><pre id="terminal-output" tabindex="0" aria-label="命令输出"></pre></section><dialog id="reboot-dialog"><h2>重启当前设备？</h2><p id="reboot-target"></p><p>会先尝试恢复本次屏幕修改，设备将暂时离线。</p><div class="actions"><button id="reboot-cancel">取消</button><button id="reboot-confirm" class="danger">确认重启</button></div></dialog>`;
}
export function createWorkbench(notify: (message: unknown, error?: boolean) => void) {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  let id: number | null = null, generation = 0, terminalBusy = false;
  let operations: Promise<void> = Promise.resolve();
  let device: Device | undefined;
  let settings: ScreenSettings | undefined;
  let densityDragging = false;
  let rebootId: number | null = null;
  const dialog = el<HTMLDialogElement>("reboot-dialog");
  const command = el<HTMLInputElement>("terminal-command");
  function controls() {
    document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>("[data-action], [data-tool]").forEach((node) => { node.disabled = id === null; });
    el<HTMLButtonElement>("terminal-run").disabled = id === null || terminalBusy;
    el<HTMLButtonElement>("terminal-cancel").disabled = id === null || !terminalBusy;
    command.disabled = terminalBusy || id === null;
  }
  function render(value: ScreenSettings) {
    settings = value;
    el("screen-summary").textContent = `${value.size ?? "尺寸未知"} · ${value.density ?? "未知"} DPI · ${value.rotation == null ? "方向未知" : value.rotation * 90 + "°"}`;
    const [width,height] = value.size?.split("x") ?? ["",""];
    el<HTMLInputElement>("screen-width").value = width; el<HTMLInputElement>("screen-height").value = height;
    // An earlier request may finish while the user is dragging the next DPI value.
    if (!densityDragging) {
      el<HTMLInputElement>("screen-density").value = value.density ?? "";
      el<HTMLInputElement>("density-slider").hidden = value.density == null;
      if (value.density != null) el<HTMLInputElement>("density-slider").value = value.density;
    }
    el<HTMLInputElement>("rotation-lock").checked = value.locked === true;
    el<HTMLInputElement>("pointer-trace").checked = value.pointer === true;
    el("restore-notice").hidden = !value.pendingRestore;
    renderPresets();
  }
  async function operation(label: string, task: (targetId: number) => Promise<string | ScreenSettings>, quiet = false) {
    if (id === null) return;
    const current = generation, target = id, name = device?.model;
    // Preserve click order without disabling the panel; discard queued work for old targets.
    operations = operations.then(async () => {
      if (current !== generation) return;
      if (!quiet) notify(`${name} · ${label}…`);
      try {
        const result = await task(target);
        if (current !== generation) return;
        if (typeof result === "string") notify(`${name} · ${result}`);
        else { render(result); if (!quiet) notify(`${name} · ${label}完成，已回读设备参数`); }
      } catch (error) {
        if (current !== generation) return;
        notify(`${name} · ${label}失败：${String(error)}`,true);
        // A multi-field change may have partially succeeded. Never re-display stale values.
        try { const latest = await readScreen(target); if (current === generation) render(latest); }
        catch { if (current === generation) { settings = undefined; el("screen-summary").textContent = "参数读取失败，请重新连接后刷新"; } }
      }
    });
    await operations;
  }
  const apply = (change: ScreenChange, label: string) => operation(label, (target) => changeScreen(target,change));
  async function refresh(quiet = false) {
    await operation("读取屏幕参数", readScreen, quiet);
  }
  document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.action!;
    if (action === "reboot") { rebootId = id; el("reboot-target").textContent = `${device?.model} · ${device?.serial}`; dialog.showModal(); return; }
    void operation(button.getAttribute("aria-label") ?? action, async (target) => action === "screenshot" ? (await saveScreenshot(target) ?? "已取消保存截图") : quickAction(target,action));
  }));
  el("reboot-cancel").addEventListener("click", () => dialog.close());
  el("reboot-confirm").addEventListener("click", () => { dialog.close(); if (id !== null && id === rebootId) void operation("重启设备", (target) => quickAction(target,"reboot")); });
  el("read-screen").addEventListener("click", () => void refresh());
  el("size-form").addEventListener("submit", (event) => { event.preventDefault(); void apply({type:"size",width:Number(el<HTMLInputElement>("screen-width").value),height:Number(el<HTMLInputElement>("screen-height").value)},"应用尺寸"); });
  el("density-form").addEventListener("submit", (event) => { event.preventDefault(); void apply({type:"density",dpi:Number(el<HTMLInputElement>("screen-density").value)},"应用 DPI"); });
  function applyRotation(locked = true, rotation = settings?.rotation) {
    if (rotation == null) { notify("当前方向未知，请先刷新",true); return; }
    void apply({type:"rotation",rotation,locked}, locked ? "切换屏幕方向" : "恢复自动旋转");
  }
  el("rotation-form").addEventListener("submit", event => event.preventDefault());
  el("rotation-lock").addEventListener("change", () => applyRotation(el<HTMLInputElement>("rotation-lock").checked));
  el("auto-rotate").addEventListener("click", () => applyRotation(false));
  el("reset-rotation").addEventListener("click", () => void apply({type:"restoreRotation"},"恢复原始方向"));
  el("reset-size").addEventListener("click", () => void apply({type:"resetSize"},"恢复默认尺寸"));
  el("reset-density").addEventListener("click", () => void apply({type:"resetDensity"},"恢复默认 DPI"));
  el("pointer-trace").addEventListener("change", () => void apply({type:"pointer",enabled:el<HTMLInputElement>("pointer-trace").checked},"设置触控轨迹"));
  const ratios: Record<string,number> = {"21:9":21/9,"18:9":2,"16:9":16/9,"4:3":3/4};
  function renderPresets() {
    const [width,height] = settings?.size?.split("x").map(Number) ?? [];
    const ratio = Object.keys(ratios).find(key => Math.abs(height - Math.round(width * ratios[key])) <= 1) ?? "";
    document.querySelectorAll<HTMLButtonElement>("[data-size-preset]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.sizePreset === ratio));
    });
    document.querySelectorAll<HTMLButtonElement>("[data-dpi]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.dpi === settings?.density));
    });
    document.querySelectorAll<HTMLButtonElement>("[data-rotation]").forEach(button => {
      button.setAttribute("aria-pressed", String(settings?.locked === true && button.dataset.rotation === String(settings.rotation)));
    });
  }
  document.querySelectorAll<HTMLButtonElement>("[data-rotation]").forEach(button => button.addEventListener("click", () => {
    applyRotation(true, Number(button.dataset.rotation));
  }));
  function applyRatio(preset: string) {
    if (!preset) return;
    const width = Number(settings?.size?.split("x")[0]);
    if (!width) { notify("当前尺寸未知，请先刷新",true); return; }
    void apply({type:"size",width,height:Math.round(width * ratios[preset])},`切换比例 ${preset}`);
  }
  document.querySelectorAll<HTMLButtonElement>("[data-size-preset]").forEach(button => button.addEventListener("click", () => applyRatio(button.dataset.sizePreset!)));
  el("density-slider").addEventListener("pointerdown", () => { densityDragging = true; });
  for (const event of ["pointerup", "pointercancel", "blur"]) el("density-slider").addEventListener(event, () => { densityDragging = false; });
  el("density-slider").addEventListener("input", () => { el<HTMLInputElement>("screen-density").value = el<HTMLInputElement>("density-slider").value; });
  el("density-slider").addEventListener("change", () => { densityDragging = false; void apply({type:"density",dpi:Number(el<HTMLInputElement>("density-slider").value)},"应用 DPI"); });
  el("screen-density").addEventListener("input", () => { el<HTMLInputElement>("density-slider").value = el<HTMLInputElement>("screen-density").value; });
  document.querySelectorAll<HTMLButtonElement>("[data-dpi]").forEach(button => button.addEventListener("click", () => {
    void apply({type:"density",dpi:Number(button.dataset.dpi)},"应用 DPI");
  }));
  const presets: Record<string,string> = {focus:"dumpsys window | grep mCurrentFocus",display:"dumpsys display",android:"getprop ro.build.version.release",battery:"dumpsys battery",packages:"pm list packages -3"};
  function preset() {
    const value = el<HTMLSelectElement>("terminal-preset").value;
    const field = el<HTMLInputElement>("package-name"); field.hidden = value !== "memory";
    if (value === "memory") { command.value = ""; if (/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(field.value)) command.value = `dumpsys meminfo ${field.value}`; else field.focus(); }
    else if (presets[value]) command.value = presets[value];
  }
  el("terminal-preset").addEventListener("change",preset); el("package-name").addEventListener("input",preset);
  el("terminal-form").addEventListener("submit", async (event) => {
    event.preventDefault(); if (id === null || terminalBusy || !command.value.trim()) return;
    const current = generation, target = id, serial = device?.serial, input = command.value;
    terminalBusy = true; controls(); el("terminal-status").textContent = `${serial} · 执行中`;
    el("terminal-output").textContent = `$ adb -s ${serial} shell ${input}\n`;
    try {
      const out = await runTerminal(target,input); if (current !== generation) return;
      const status: Record<string,string> = {success:"完成",failed:"失败",cancelled:"已取消",timeout:"超时"};
      el("terminal-status").textContent = `${serial} · ${status[out.status] ?? out.status} · 退出码 ${out.exitCode ?? "—"} · ${out.durationMs}ms${out.truncated ? " · 输出已截断" : ""}`;
      el("terminal-output").textContent = `$ adb -s ${serial} shell ${input}\n\nstdout:\n${out.stdout}\nstderr:\n${out.stderr}`;
    } catch (error) { if (current === generation) el("terminal-status").textContent = String(error); }
    finally { if (current === generation) { terminalBusy = false; controls(); } }
  });
  el("terminal-cancel").addEventListener("click", () => { if (id !== null) void cancelTerminal(id).catch((error) => notify(error,true)); });
  el("terminal-clear").addEventListener("click", () => { el("terminal-output").textContent = ""; });
  return {
    refresh,
    async setTarget(next: Device | undefined, path: string) {
      const current = ++generation; id = null; device = next; settings = undefined; densityDragging = false; terminalBusy = false; operations = Promise.resolve(); controls();
      dialog.close();
      for (const field of ["screen-width", "screen-height", "screen-density"]) el<HTMLInputElement>(field).value = "";
      el<HTMLInputElement>("density-slider").hidden = true;
      renderPresets();
      el("screen-summary").textContent = "等待设备"; el("restore-notice").hidden = true;
      el("terminal-output").textContent = ""; el("terminal-status").textContent = "尚未执行命令";
      try { const result = await setWorkbenchTarget(path,next?.state === "device" ? next.serial : undefined); if (current !== generation) return; id = result.id; if (result.warning) notify(result.warning,true); controls(); if (id !== null) await refresh(true); }
      catch (error) { if (current === generation) notify(error,true); }
    },
  };
}
