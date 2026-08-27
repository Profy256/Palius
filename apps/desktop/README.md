# Palius Desktop

The Palius Social Media CRM as a native desktop application for **Linux, macOS
and Windows**.

It is an Electron shell around the same Next.js frontend that runs on the web —
one codebase, one design system, two delivery targets. The desktop build adds
three things the browser cannot give you:

1. **Your AI key is encrypted at rest** via Electron `safeStorage`, backed by
   the OS keyring (Keychain / DPAPI / libsecret) instead of `localStorage`.
2. **It runs offline against your own AI provider.** The app starts its own
   local server; no Palius backend and no hosted service sits in the path.
3. **It is a normal installed application** — launcher entry, icon, file
   associations, taskbar grouping.

---

## Version matrix

Verified against the versions actually installed in this repo, not just the
semver ranges declared in `package.json`.

### Desktop app

| Component | Version | Notes |
|---|---|---|
| **Palius Desktop** | **1.0.0** | `apps/desktop`, appId `com.palius.os.desktop` |
| Electron | 33.4.11 | Runtime shell |
| └ Chromium | 130.0.6723.191 | Renderer |
| └ Node (bundled) | 20.18.3 | Also runs the frontend server — no system Node needed at runtime |
| electron-builder | 25.1.8 | Packaging |

### Web frontend (shared with the desktop app)

| Component | Version |
|---|---|
| **Palius Social Media OS** | **1.0.0** (`apps/frontend`) |
| Next.js | 15.5.22 |
| React / React DOM | 19.2.8 |
| Tailwind CSS | 3.4.19 |
| TypeScript | 5.8.3 |
| lucide-react | 0.546.0 |
| motion | 12.42.2 |
| @vercel/analytics | 2.0.1 |

### Rest of the platform (not bundled into the desktop app)

| App | Version | Stack |
|---|---|---|
| Backend (`apps/backend`) | — | Go 1.25.0 + Gin |
| Admin (`apps/admin`) | 0.1.0 | Next.js 15.1, React 19 |
| Worker (`apps/worker`) | 0.1.0 | Node ≥ 20, Playwright 1.50.0, ws 8.18.0 |

### Build host used for the verified Linux build

Node 22.22.1 · npm 9.2.0 · Linux x64

---

## How it works

```
┌─ Electron main process (electron.js) ──────────────────────┐
│                                                            │
│  1. asks the OS for a FREE TCP port                        │
│  2. spawns the Next.js standalone server on that port      │
│       packaged → resources/frontend/server.js              │
│                  run with Electron's own Node              │
│       dev       → `next dev` against apps/frontend         │
│  3. waits for the port to answer, then opens a window      │
│  4. kills the server on quit                               │
│                                                            │
│  IPC: secure:get / secure:set / secure:delete              │
│       └─ safeStorage-encrypted JSON in userData            │
└────────────────────────────────────────────────────────────┘
              │ contextIsolation, no nodeIntegration
              ▼
     preload.js  →  window.palius.secure.*
              ▼
     The Next.js app (identical to the web build)
```

**The free-port step matters.** An earlier version hardcoded port 3000 and
attached to whatever was already listening there. A stale `next start` left over
from a previous run would get adopted as the app's frontend, and because its
build assets no longer existed on disk the stylesheet 404'd — the app rendered
as unstyled HTML. The app now only ever talks to the server it started itself.

**Packaging uses Next's `standalone` output** (`DESKTOP_BUILD=1`), which traces
only the modules actually imported. This is not a micro-optimisation:

| Approach | Shipped payload |
|---|---|
| Full `node_modules` + `.next` | ~1.13 GB |
| `standalone` output | **~79 MB** |

---

## Prerequisites

- **Node 20+** and npm (build machine only — the shipped app carries its own Node)
- The frontend's dependencies installed:
  ```bash
  cd apps/frontend && npm install
  ```
- Platform tooling for the target you are building (see the table below)

```bash
cd apps/desktop
npm install
```

---

## Development

```bash
cd apps/desktop
npm run dev          # starts `next dev` on a free port + opens the Electron window
```

Hot reload works exactly as it does in the browser. To point the window at a
dev server you are managing yourself instead:

```bash
npm run dev:attach                                   # expects http://localhost:3000
ELECTRON_START_URL=http://localhost:5173 npm run dev # or any URL
```

---

## Build commands

Every command below is run from `apps/desktop/`. Each one first rebuilds the
frontend with `DESKTOP_BUILD=1` (standalone output), then packages it.

| Command | Builds for | Output |
|---|---|---|
| `npm run dist` | current OS | `release/` |
| `npm run dist:linux` | Linux | `.AppImage` + `.deb` |
| `npm run dist:mac` | macOS | `.dmg` (x64 + arm64) |
| `npm run dist:win` | Windows | NSIS `.exe` installer |
| `npm run pack` | current OS, **unpacked** | `release/linux-unpacked/` etc. — fast, for testing |
| `npm run build:frontend` | — | frontend standalone bundle only |

### Linux

```bash
cd apps/desktop
npm run dist:linux
```

Produces:

| Artifact | Size |
|---|---|
| `release/Palius-1.0.0.AppImage` | 127 MB |
| `release/palius-os-desktop_1.0.0_amd64.deb` | 84 MB |

Install the `.deb` (recommended — registers icons, menu entry and the SUID
sandbox helper):

```bash
sudo dpkg -i release/palius-os-desktop_1.0.0_amd64.deb
sudo apt-get install -f      # only if dependencies are missing
```

Installs to `/opt/Palius/palius` with a desktop entry and eight `hicolor` icon
sizes (16 → 1024 px). Remove with `sudo apt remove palius-os-desktop`.

The AppImage needs **FUSE 2** (`libfuse.so.2`), which many current distros no
longer ship — they carry FUSE 3 only. If it fails with
`dlopen(): error loading libfuse.so.2`, either install `libfuse2`, or extract
and run it directly:

```bash
sudo apt install libfuse2          # option 1
./Palius-1.0.0.AppImage --appimage-extract && ./squashfs-root/palius   # option 2
```

**Install without root** — no `.deb`, no FUSE, no `sudo`:

```bash
npm run dist:linux
cp -r release/linux-unpacked ~/.local/share/palius
mkdir -p ~/.local/bin
printf '#!/bin/sh\nexec "$HOME/.local/share/palius/palius" "$@"\n' > ~/.local/bin/palius
chmod +x ~/.local/bin/palius
for s in 16 32 48 64 128 256 512 1024; do
  install -Dm644 build/icons/${s}x${s}.png \
    ~/.local/share/icons/hicolor/${s}x${s}/apps/palius.png
done
cat > ~/.local/share/applications/palius.desktop <<EOF
[Desktop Entry]
Type=Application
Name=Palius
GenericName=Social Media CRM
Comment=AI social media CRM — plan, publish, engage and analyse
Exec=$HOME/.local/share/palius/palius %U
Icon=palius
Terminal=false
Categories=Office;
StartupWMClass=Palius
StartupNotify=true
EOF
update-desktop-database ~/.local/share/applications
```

### macOS

Must be built **on macOS** — `electron-builder` needs the platform's own
`hdiutil` and code-signing tooling.

```bash
cd apps/desktop
npm run dist:mac
```

Produces `release/Palius-1.0.0.dmg` for both Intel (`x64`) and Apple Silicon
(`arm64`). Install by opening the `.dmg` and dragging **Palius** to
`/Applications`.

Unsigned builds are quarantined by Gatekeeper. Either right-click → **Open** the
first time, or clear the attribute:

```bash
xattr -cr /Applications/Palius.app
```

To ship it to other people, sign and notarize:

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=…
export APPLE_ID=…  APPLE_APP_SPECIFIC_PASSWORD=…  APPLE_TEAM_ID=…
npm run dist:mac
```

### Windows

Best built **on Windows**. From Linux/macOS it is possible via Wine, but the
installer is unsigned and the toolchain is fragile — prefer a Windows machine or
a `windows-latest` CI runner.

```powershell
cd apps\desktop
npm run dist:win
```

Produces `release\Palius Setup 1.0.0.exe` — an NSIS installer configured to let
the user choose the install directory and to create Desktop and Start Menu
shortcuts (`oneClick: false`, `perMachine: false`, so no admin rights needed).

To sign it:

```powershell
$env:CSC_LINK="C:\path\to\certificate.pfx"
$env:CSC_KEY_PASSWORD="…"
npm run dist:win
```

### Building every platform from CI

Cross-building is unreliable in both directions; use a matrix instead:

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
runs-on: ${{ matrix.os }}
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: 20 }
  - run: npm ci --prefix apps/frontend
  - run: npm ci --prefix apps/desktop
  - run: npm run dist --prefix apps/desktop
```

---

## Bring your own AI provider

**Settings → Brand & Security → Bring Your Own AI Provider** (the first card on
the page). Pick a provider, paste a key, save.

| Provider | Default model | Get a key |
|---|---|---|
| Google Gemini | `gemini-2.0-flash` | <https://aistudio.google.com/apikey> |
| **OpenRouter** | **`openrouter/auto`** | <https://openrouter.ai/keys> |
| OpenAI | `gpt-4o-mini` | <https://platform.openai.com/api-keys> |
| Anthropic Claude | `claude-3-5-sonnet-latest` | <https://console.anthropic.com/settings/keys> |
| OpenAI-compatible | *(you supply model + base URL)* | any local or self-hosted endpoint |

OpenRouter defaults to its **auto-router** (`openrouter/auto`), which picks a
suitable model per prompt — paste a key and it works, no model name required.
Typing a bare `auto` is accepted and normalised. Any specific model
(`anthropic/claude-sonnet-4`, `openai/gpt-4o`, …) can be typed into the Model
field instead.

Keys are sent straight from your machine to the provider. They never reach a
Palius server.

**Storage:** the desktop app encrypts the key with Electron `safeStorage` and
writes it to `settings.json` in the app's `userData` directory. If no OS keyring
is available — common on minimal Linux installs without `gnome-keyring` /
`kwallet` — `safeStorage` cannot encrypt, and the app falls back to base64 in
the same file. The Settings panel shows which of the two is in effect. In a
plain browser the key goes to `localStorage` instead.

---

## Troubleshooting

| Symptom | Cause & fix |
|---|---|
| **App window is unstyled** — serif text, white buttons | Fixed in 1.0.0. A stale server on a fixed port was being adopted; the app now picks a free port. If you still see it, kill leftover `next-server` processes: `pkill -f next-server` |
| `dlopen(): error loading libfuse.so.2` | AppImage needs FUSE 2 — `sudo apt install libfuse2`, or use the `.deb`, or `--appimage-extract` |
| `The Palius frontend server exited (code N) before it was ready` | The bundled server crashed on start. Run the binary from a terminal to see its output |
| `FATAL: ... sandbox is not running as root` | The SUID helper lost its bit. The `.deb` sets it in `postinst`; for a manual install run with `--no-sandbox`, or `sudo chown root:root <app>/chrome-sandbox && sudo chmod 4755 <app>/chrome-sandbox` |
| Settings shows "Stored locally in this browser" in the desktop app | No OS keyring available. Install `gnome-keyring` or `kwallet` |
| Build fails: `Please specify project homepage` | `.deb` packaging requires `homepage` in `package.json` |
| Blank window, server started fine | Check the DevTools console — `Ctrl/Cmd+Shift+I` |

---

## Layout

```
apps/desktop/
  electron.js        main process: free port, server lifecycle, safeStorage IPC
  preload.js         contextBridge → window.palius.secure
  package.json       scripts + full electron-builder config
  build/
    icon.png         1024×1024 master (macOS + fallback)
    icon.ico         multi-resolution Windows icon
    icons/           16 → 1024 px PNGs for Linux
  release/           build output (gitignored)
```
