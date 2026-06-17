# Developer Setup — Cadence

Environment setup for building Cadence. Tailored for an **Arch-based Linux** machine (CachyOS). Phase numbers refer to `docs/ROADMAP.md`.

---

## 1. Computer — needed now (Phases 0–4)

Install in this order. ~10–15 minutes total.

### 1. Git (version control)
```bash
sudo pacman -S git
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### 2. Node.js + npm (the project runs on this)
```bash
sudo pacman -S nodejs npm
node --version   # expect v22.x (LTS)
```
> Claude Code itself does not need Node — but the backend and web client do.

### 3. VS Code (editor)
```bash
paru -S visual-studio-code-bin    # or: yay -S visual-studio-code-bin
```
(`pacman -S code` is Code-OSS with a limited extension marketplace; the `-bin` build is smoother.)

### 4. Claude Code (native installer — recommended, no Node required)
```bash
curl -fsSL https://claude.ai/install.sh | bash
claude --version                  # verify
```
First run inside a project folder: type `claude`, then sign in via the browser.
**Requires a paid Claude plan (Pro/Max) — you have this.** Heavy agentic sessions can hit Pro usage caps; Max has more headroom.

### 5. Docker (run/test the server in a container)
```bash
sudo pacman -S docker docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER     # then log out / back in
```

### 6. ffmpeg (server uses it for transcoding)
```bash
sudo pacman -S ffmpeg
```

**Order:** Git → Node → VS Code → Claude Code → Docker → ffmpeg.

### Verify everything
```bash
git --version && node --version && npm --version && claude --version && docker --version && ffmpeg -version | head -1
```

---

## 2. Phone — needed now (Phase 1 testing)

Phone: **Android**. To test the server with a real Subsonic client in Phase 1, install a free one from the Play Store:
- **Substreamer**, or
- **Ultrasonic**

Point it at your server URL and confirm streaming works before building the web client.

---

## 3. Mobile development — Phase 5 (not now)

### Tooling (Linux)
```bash
paru -S flutter android-studio
flutter doctor    # follow its checklist to finish Android SDK setup
```

### Android (do this first)
- Test your own Flutter app directly on your Android phone via USB:
  enable Developer Options → USB debugging, plug in, `flutter run`.
- No Mac required for any of this.

### iOS (do this second) — requires macOS + Xcode
You have **occasional** Mac access, plus a family **iPhone** and your own **iPad** as test devices. Plan accordingly:
- Write the Flutter code on Linux (the codebase is shared).
- Do iOS **builds and App Store submission** during Mac sessions. Xcode is macOS-only — **the iPad cannot build Flutter apps** (iPadOS is not macOS, no Xcode).
- When you can't get to a Mac, a cloud-Mac CI service (e.g. **Codemagic**) can build and ship iOS for you.
- Test the built app on **real devices** via TestFlight: the family iPhone and your iPad both work — better than the simulator.

**Sequence: ship Android first, iOS second.** This matches your hardware: everything for Android is on your own machine; iOS waits for Mac access.

---

## Notes
- This file is your machine setup. The project specs (what to build) live in `CLAUDE.md` and `docs/`.
- Don't install the Phase 5 mobile tooling until you reach Phase 5 — it just adds clutter early on.
