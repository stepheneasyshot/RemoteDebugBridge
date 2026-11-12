---
name: DroidCraft / ADB Studio Desktop
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#bbcabf'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#86948a'
  outline-variant: '#3c4a42'
  surface-tint: '#4edea3'
  primary: '#4edea3'
  on-primary: '#003824'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#006c49'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#c0c1ff'
  on-tertiary: '#1000a9'
  tertiary-container: '#9699ff'
  on-tertiary-container: '#1d17b2'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2.25rem
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Geist
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 1rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.015em
  body-lg:
    fontFamily: Inter
    fontSize: 0.9375rem
    fontWeight: '400'
    lineHeight: 1.5rem
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.375rem
  body-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
  code-lg:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.375rem
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.25rem
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '400'
    lineHeight: 1rem
  label-caps:
    fontFamily: Geist
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: 0.875rem
    letterSpacing: 0.06em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system establishes a high-performance, developer-first command surface engineered for Android debugging, ADB orchestration, and multi-device telemetry. Designed for mobile platform engineers, QA automation specialists, and reverse engineers, the interface evokes extreme technical precision, speed, and cognitive clarity. 

The aesthetic synthesizes modern utility workstations (Linear, Raycast) with native IDE precision (VS Code, Android Studio). The visual language balances dense data display with hyper-focused interaction zones. Key traits:
- **Modular Telemetry:** Structured panels, explicit boundaries, zero wasted canvas real estate, and rapid access shortcuts.
- **Instrument Precision:** Razor-thin structural borders, low-attenuation surface contrast, and monospace readout accents for terminal commands, serial numbers, logcat outputs, and latency metrics.
- **Dynamic Connection Feedback:** Vivid neon status emitters indicating physical vs. wireless ADB states, live daemon connections, and APK sideload progress.

## Colors

The palette is engineered exclusively for prolonged dark-mode operational sessions, balancing luminous signaling accents against layered slate foundations.

- **Foundations:**
  - `bg-canvas`: `#0A0F1D` — Deep void workspace background for maximum contrast.
  - `surface-base`: `#0F172A` — Primary window panels, sidebars, and peripheral toolbars.
  - `surface-elevated`: `#1E293B` — Floating inspectors, command palettes, logcat buffers, and modal dialogs.
  - `surface-subtle`: `#334155` — Hover states, panel separators, and inactive input strokes.

- **Accents & Telemetry:**
  - `primary` (`#10B981` Emerald Neon): Active ADB connection, online device indicators, log stream success signals, and primary command triggers.
  - `secondary` (`#06B6D4` Cyan Pulse): Active wireless debugging port, network packets, live screen-mirror streaming, and payload telemetry.
  - `tertiary` (`#6366F1` Indigo Core): Scripting automation, intent builder nodes, and APK decompilation modules.
  - `danger` (`#F43F5E` Coral Red): Daemon disconnects, ANRs, runtime stack traces, and unrooted action warnings.
  - `warning` (`#F59E0B` Amber): Logcat warnings, battery thermal throttling, and deprecated SDK warnings.

- **Typography & Structural Contrast:**
  - `text-primary`: `#F8FAFC` — High legibility for metrics, active device names, and source commands.
  - `text-secondary`: `#94A3B8` — Metadata labels, serial numbers, timestamp columns, and inactive tools.
  - `text-tertiary`: `#64748B` — Monospace line numbers, structural guides, and shortcut indicators.
  - `border-dim`: `#1E293B` — Baseline division for control grids.
  - `border-bright`: `#334155` — Active panel focus and targeted split panes.

## Typography

The typographic hierarchy accommodates high data density, log analysis, and system navigation:

- **Geist (Headlines & Labels):** Provides an architectural, surgical appearance for window framing, panel titles, segmented controllers, and category tags. `label-caps` must always be rendered uppercase for panel metadata headers.
- **Inter (Body & Controls):** Delivers clean readability in input labels, device descriptions, workflow guides, and interactive button text without drawing focus from dense data tables.
- **JetBrains Mono (Console, Telemetry & Code):** Reserved strictly for ADB commands, live Logcat dumps, device model IDs, network IP/port formats, memory dump statistics, and hotkey accelerators.

## Layout & Spacing

The layout philosophy adheres to a multi-pane IDE dock system designed for wide-format developer desktop displays (minimum target width: 1280px).

- **Grid Architecture:** Fixed docking split-views featuring resizable left/right sidebars and bottom drawer consoles. No content floats freely; all zones snap to container bounds separated by 1px sub-pixel borders.
  - **Left Rail (Fixed 64px or Collapsible 240px):** Connected device switcher, script repository, fast action triggers.
  - **Primary Canvas (Fluid Center):** Split into tabbed workspaces (Scrcpy Screen Mirroring, APK Decompiler, File System Explorer, Workflow Automator).
  - **Bottom Dock (Adjustable 220px to 480px):** Real-time filtered Logcat stream, raw ADB shell input terminal, and automated task execution queue.
  - **Right Panel (Collapsible 320px):** Device inspector, live CPU/RAM/Battery metrics, battery override toggles, and Android display density overrides.
- **Density Scaling:** Default interface baseline uses 4px/8px micro-increments. Space tokens are compact (`space-xs` and `space-sm` dominate lists and toolbars) to prioritize maximum visible telemetry over excessive whitespace.

## Elevation & Depth

Visual hierarchy is maintained through flat, high-contrast tonal layering reinforced by razor-sharp borders and focused luminescence rather than deep shadows:

- **Surface Tiers:**
  - `Level 0 (Canvas)`: Base root desktop frame (`#0A0F1D`).
  - `Level 1 (Panels & Docks)`: Primary containers (`#0F172A`) structured with 1px borders of `border-dim` (`#1E293B`).
  - `Level 2 (In-Panel Cards & Modules)`: Tool tiles, terminal logs, and parameter forms (`#1E293B`).
  - `Level 3 (Overlays & Command Palette)`: Elevated dropdowns, context menus, and quick-find dialogs (`#1E293B`) bounded by `border-bright` (`#334155`).
- **Glow & Radiance:** Ambient drop shadows are avoided. Instead, high-relevance focus states use a faint green or cyan edge radiance: `0 0 0 1px #10B981, 0 0 12px rgba(16, 185, 129, 0.2)`.
- **Mirroring Frame:** The simulated Android screen mirror container uses smooth, hardware-accurate bezel outlines surrounded by an ultra-soft backlight cast that samples the predominant average screen hue.

## Shapes

The design system adopts a crisp, modern developer tool shape scale (`roundedness: 1`):

- **Interactive Elements (Buttons, Inputs, Tabs):** Default corner radius is `0.25rem` (4px). Keeps toolbars looking structural, compact, and aligned like engineering instruments.
- **Cards, Docks, & Floating Modals:** Employ `rounded-lg` (`0.5rem` / 8px) with inset 1px borders to soften panel grouping without surrendering screen efficiency.
- **Device Mirroring Mockups:** An intentional exception to the system scale: virtual device viewports apply smooth physical device curves (`1.5rem` to `2.25rem` radius) matching actual Android OEM hardware silhouettes (e.g., Pixel and Galaxy contours) accompanied by dynamic punch-hole camera cutouts.
- **Pill Indicators:** Reserved solely for micro status badges (e.g., `CONNECTED`, `UNAUTHORIZED`, `PORT: 5555`) using full-radius capsule geometry at micro height (18px-20px).

## Components

### Buttons & Action Triggers
- **Primary Action (Run Script, Sideload APK):** Background `#10B981`, foreground `#0A0F1D`, font weight 600. Subtle glow on hover.
- **Secondary Action (Reboot, Kill Server):** Background `#1E293B`, border 1px solid `#334155`, text `#F8FAFC`. Hover switches border to `#64748B`.
- **Destructive Action (Wipe Data, Factory Reset):** Background `rgba(244, 63, 94, 0.1)`, border 1px solid `#F43F5E`, text `#F43F5E`.
- **Icon Action Buttons (Toolbar items):** 28x28px squares, 4px rounded, transparent background, text `#94A3B8`, transitioning to `#F8FAFC` on hover with `#1E293B` background fill.

### Chips & Badges
- **Device Status Badge:** Capsule format. Green dot (`#10B981`) with slow pulse animation + JetBrains Mono text `adb:device` or Amber dot (`#F59E0B`) with `unauthorized`.
- **Log Tag Filters:** Compact chips with `#0F172A` background and `#334155` border. Clicking toggles state; active filters glow in `#06B6D4` with monospace frequency counters.

### Lists & Data Grids (Logcat & File Explorer)
- **Table Density:** 28px row height. Alternating rows use subtle `#0F172A` and `#141E33` fills.
- **Typography:** Strict tabular lining figures with `code-md` for timestamps, PIDs, and packages.
- **Logcat Levels:** Color-coded border indicators on row leading edge (Green for Info, Cyan for Debug, Amber for Warn, Coral Red for Error/Fatal).

### Checkboxes & Switch Controls
- **Toggle Switches:** Compact 32x16px footprint for low-latency toggle actions (e.g., "Stay Awake", "Pointer Location", "Show Layout Bounds"). Track lights up in `#10B981` when active.
- **Checkboxes:** 14x14px square, 2px rounded corners, `#1E293B` interior with `#10B981` checkmark.

### Input Fields & Terminal Console
- **ADB Command Line:** Persistent bottom command prompt displaying a green prompt anchor (`droidcraft@adb >`), monospace input buffer, instant auto-complete suggestions floating in an elevated popover.
- **Parameter Inputs:** Dark background (`#0A0F1D`), crisp 1px stroke (`#334155`), with focus transition to `#06B6D4`.

### Cards & Inspectors
- **Hardware Telemetry Cards:** Compact slate modules displaying real-time canvas sparks for CPU usage, battery temperature (Celsius), and RAM allocation.
- **Device Mirror Card:** Centered viewport with a high-contrast matte bezel, top-right overlay controls for volume, power, rotate, and screenshot export.