// Material Symbols Outlined, bundled locally; no network request at app startup.
const glyphs: Record<string, string> = {
  phone: "smartphone", devices: "devices", book: "auto_stories", screen: "screen_share",
  refresh: "sync", wifi: "wifi", arrow: "arrow_forward", back: "arrow_back",
  shield: "verified_user", cable: "cable", play: "play_arrow", stop: "stop",
  expand: "fullscreen", terminal: "terminal", tune: "tune", bolt: "bolt",
  code: "developer_mode", check: "check", key: "key", info: "info",
  network: "hub", power: "power_settings_new", wake: "light_mode", sleep: "bedtime",
  powerLong: "timer", home: "circle", recent: "crop_square", volumeUp: "volume_up",
  volumeDown: "volume_down", muteDevice: "volume_off", notifications: "notifications_active",
  screenshot: "screenshot", reboot: "restart_alt", swipe: "swipe_vertical",
  homeSwipe: "vertical_align_top", shortSwipe: "arrow_upward", mediumSwipe: "north",
  longSwipe: "keyboard_double_arrow_up", leftBack: "swipe_right_alt", rightBack: "swipe_left_alt",
  topSwipe: "vertical_align_bottom", shortSwipeDown: "arrow_downward",
  mediumSwipeDown: "south", longSwipeDown: "keyboard_double_arrow_down",
  backThree: "fast_rewind", rotate: "screen_rotation", size: "aspect_ratio",
  restore: "settings_backup_restore", pointer: "touch_app", stats: "monitoring",
  clear: "clear_all", close: "close", memory: "memory", warning: "warning",
};
export function icon(name: string): string {
  return `<span class="icon" aria-hidden="true">${glyphs[name] ?? "smartphone"}</span>`;
}
