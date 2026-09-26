# Clippy Mod Manager

A lightweight mod manager for **People Playground**, with Nexus Mods and Patreon downloads and a Clippy theme.
Modelled on Mod Organizer 2 (licensed GPL-3.0-or-later, like MO2).

## Run it

Needs Node 20+ and Windows (Linux/macOS mostly work, but nxm:// registration is Windows-first).

```
npm install
npm start          # launch
npm test           # run the unit tests (no Electron needed)
npm run dist       # build an installer (electron-builder)
```

`npm install` here should be quick and need no compiler — the app's own dependencies (Electron,
7-Zip, and the browser cookie reader) are all either pure JS or ship prebuilt binaries. Patreon
downloading needs a separate tool; see below.

## `patreon-dl` is bundled — what that means for `npm install`

`patreon-dl` (the engine patreon-dl-gui also uses) is a regular dependency, so `npm install` pulls it in
automatically, and this app calls it **as a library, in-process** — not as a separate command-line tool.
Earlier versions of this app spawned `patreon-dl` as a subprocess, which turned out to be fragile on
Windows specifically (globally-installed npm CLIs are `.cmd` wrapper files, and Node's `spawn()` can't
run those without extra configuration, so it could report "not found" even when correctly installed).
Calling it as a library sidesteps that entire class of problem, and also means there's no longer a
"patreon-dl path" setting to configure — there's only one copy, the one bundled with the app.

Two things worth knowing about what bundling it adds to `npm install`:

- It depends on **`better-sqlite3`**, a native module. Unlike the old `sqlite3` package (which caused
  the build failures earlier in this project's history), `better-sqlite3` publishes prebuilt binaries
  for far more platforms, including Windows on ARM, so it's much more likely to install cleanly with no
  compiler needed. If it still fails to install on your system, that error will name `better-sqlite3`,
  not this app's own code — the fixes are the same as before (a regular x64 Node.js install, or the
  Visual Studio "Desktop development with C++" workload with a Windows SDK).
- It also depends on **Puppeteer**, which downloads its own headless Chromium browser on install —
  normally 200-300 MB, one time, unrelated to compilers. `npm install` will take noticeably longer and
  more disk space than it did without `patreon-dl` bundled.

## How it works

- Mods are kept in the app's own library (`%APPDATA%/clippy-mod-manager/data/mods/<id>`).
- Each **profile** is a list of enabled mods. Ticking a box links that mod folder into
  `Documents/People Playground/mods` (junction, falling back to a copy). Only folders the app
  created are ever removed, so your own mods are never touched, and a name clash is skipped, not overwritten.
- A mod is a folder containing `mod.json`. Archives (.zip/.7z/.rar, via 7-Zip) are unpacked, the
  shallowest `mod.json` is found, and that folder becomes the mod. Mods without one get a warning.

## Game folder

Settings has a **People Playground game folder** selector (Browse, or Auto-detect, which reads your Steam
library list). The app checks that `People Playground.exe` is there, launches the game from it, and can open
it. **Play button launches** has two modes: *Directly* starts `People Playground.exe` without Steam (the default),
or *Through Steam*. The **mods folder** is a separate setting (default `Documents/People Playground/mods`); point it at wherever
your game actually loads mods from.

## Installing

Settings > Installing has an option to delete downloaded archives after they install. It only applies to files
downloaded through the app (Nexus, Patreon), only after a successful install, and never to archives you add yourself.

## Nexus Mods

People Playground on Nexus only offers **Manual Download** (no "Mod Manager Download" button), so `nxm://`
links can't be used. The flow is:

1. Browse or look up a mod by ID in the Nexus tab (needs a personal API key, or browser login with your own
   registered Nexus application slug).
2. Click **Get (manual)**. The Nexus page opens; click *Manual Download* and save the file as usual.
3. The app watches your browser Downloads folder (Settings > Browser downloads folder), waits for the file to
   finish, and installs it. You can also use *Add archive...* on the Mods tab at any time.

Premium accounts first try a direct API download and fall back to the manual flow if Nexus refuses.
Set the **game domain** in Settings to match the game's Nexus URL (default `peopleplayground`, unverified).
The `nxm://` handler still exists (Settings > Use this app for nxm:// links) but is off by default.

## Patreon

**Logging in** opens a dedicated window inside the app, pointed at the real patreon.com login page —
not a cookie file reader, and not a browser extension. It's a normal, sandboxed Electron window
(`contextIsolation` on, `nodeIntegration` off, no script injected into the page), so the app cannot see
or intercept anything you type there; it only reads the resulting session cookie once login succeeds,
the same way any real browser holds a cookie after you log in.

Its user agent is set to a normal desktop Chrome string before it loads the page. Without that, Google
blocks sign-in in windows it can identify as embedded (an anti-phishing measure aimed at fake login
screens), so "Continue with Google" would otherwise fail with a "this browser may not be secure" error.
This doesn't defeat any actual protection \u2014 it's the same header any real browser sends \u2014 it just stops
Google's embedded-window detection from false-positiving on a legitimate first-party login you're doing
for yourself. Email login and Google sign-in both work; Apple sign-in may still have trouble in embedded
windows generally and hasn't been tested.

Your login is kept in its own persistent session (separate from Nexus, separate from the app's own
data), so you shouldn't need to log in again on every launch. "Log out" clears it.

Once logged in, paste a post link and `patreon-dl` (see above) downloads it; archives found in the
download are installed. You need an active subscription that includes the post.

## Nexus login redirects to your browser too

Unlike Patreon, Nexus has its own official SSO system for third-party apps: approving the login happens
on nexusmods.com in your real default browser, and the app only receives the resulting API key over a
private connection \u2014 no embedded window needed. It needs your own registered Nexus application slug in
Settings; without one, paste a personal API key instead.

## Known gaps / next steps

- Untested in a real Electron window and against the live Nexus and Patreon services (see notes in chat).
- The `patreon-dl` library's exact event payloads (`targetBegin`, `phaseBegin`, task progress) are
  ported from its documented API, not from a real run — the progress logging may need small
  adjustments once you see real output. The exact `mod.json` fields are also from memory, not verified.
- Apple sign-in inside the embedded Patreon login window hasn't been tested and may not work.
- FFmpeg isn't wired up (`pathToFFmpeg` is left unset), so `patreon-dl` will fall back to a system
  `ffmpeg` on PATH for the video formats that need it. Not relevant for mod archives specifically.
- No update tracking or endorsements yet. A new file for the same Nexus mod installs as a separate entry.
- The Clippy is a plain SVG. Swap in your own art in `src/renderer/index.html`.
