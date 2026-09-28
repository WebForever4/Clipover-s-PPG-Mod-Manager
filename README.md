# Clippy Mod Manager

mod manager for People Playground with Nexus and Patreon downloads and a Clippy theme. it's loosely based on Mod Organizer 2 so it's GPL-3.0-or-later like MO2.

still a work in progress. i haven't tested everything against the live sites, so expect some rough edges.

## running it

you need Node 20 or newer and Windows. Linux and macOS mostly work but the nxm:// stuff is Windows first.

```
npm install
npm start
npm test
```

npm test runs the unit tests and doesn't need Electron.

## making an exe

```
npm run dist
```

that builds a Windows installer with electron-builder and drops it in the dist folder. the first run downloads some build tools so give it a minute.

if you want a single exe with no installer:

```
npm run dist:portable
```

a few things that trip people up:

- if it fails with a "cannot create symbolic link" error, either turn on Developer Mode in Windows settings or run the terminal as admin once.
- it builds for whatever CPU you're on. for a specific one use `npm run dist:x64` or `npm run dist:arm64`.
- for a custom icon put a 256x256 icon.ico in a folder called build and it gets picked up automatically.
- the fixed Assembly-CSharp.dll in resources/fixes gets bundled into the exe, so don't delete that folder.

## how mods are handled

mods live in the app's own library at `%APPDATA%/clippy-mod-manager/data/mods/<id>`. every profile is just a list of enabled mods. ticking a box links that mod into `Documents/People Playground/mods`, and if a link doesn't work it copies the folder instead. the app only ever removes folders it made itself, so your own mods are safe, and if a name clashes it skips the mod instead of overwriting anything.

a mod is a folder with a `mod.json` in it. archives (.zip, .7z, .rar) get unpacked with 7-Zip, the shallowest `mod.json` is found and that folder becomes the mod. no `mod.json` means you get a warning.

## game folder

Settings has a game folder picker. you can browse for it or hit auto-detect, which reads your Steam library list. it checks that `People Playground.exe` is actually in there. the Play button can launch the exe directly (default) or go through Steam. the mods folder is its own setting so point it wherever your game actually loads mods from.

there's also an option to delete downloaded archives after they install. it only touches files the app downloaded itself (Nexus and Patreon) and only after a successful install.

## Nexus

People Playground on Nexus only has Manual Download, no mod manager button, so nxm:// links don't work for it. here's the flow instead:

1. find a mod in the Nexus tab. you need a personal API key for that, and the Get API key button opens the right page in your browser so you can copy and paste it.
2. hit Get. the Nexus page opens, click Manual Download and save the file.
3. the app watches your Downloads folder, waits for the file to finish and installs it.

premium accounts try a direct download first and fall back to the manual flow. you can also use Add archive on the Mods tab whenever.

i skipped Nexus SSO login on purpose. it only works for apps that Nexus staff approved and gave a slug to, so the copy and paste key button is the workaround.

## Patreon (ALPHA)

this one is alpha. downloads are still failing on some posts and it's the least tested part of the app.

logging in opens a normal Electron window pointed at the real patreon.com login. nothing gets injected into the page and the app never sees your password. it only reads the session cookie afterwards. the window uses a regular desktop Chrome user agent, otherwise Google blocks "Continue with Google" in embedded windows. email and Google login both work. Apple login is untested.

for downloads you paste a post link. the app asks the same JSON API the Patreon site uses for that post, finds the files and downloads them. no third party libraries or native modules, which is what kept breaking npm install before.

the file links go through patreon.com/file and Cloudflare likes to answer those with a 403 when the request doesn't look like a real browser. so downloads try a few things in order:

1. a request through Electron's network stack using your login session
2. a hidden browser window that loads the file link like you clicked it. if Cloudflare throws up a check the window pops up so you can pass it once

you need a subscription that actually includes the post. if a post shows nothing downloadable the log says what Patreon sent back, which makes it easier to see what changed. this is all unofficial and Patreon can break it whenever.

## Top Mods

the Top Mods tab reads the listing pages on top-mods.com (newest, top downloaded, top rated, most commented). the site is fan run, has no API and isn't connected to the game dev or Nexus. the app just reads the HTML, so if they change their layout the lists can come back empty until `src/core/topmods.js` gets updated.

files aren't downloaded automatically. mods there are hosted on file lockers like modsfire, so clicking a mod opens its page in your browser. download it like normal and the app picks it up from your Downloads folder.

## security mode (ALPHA)

alpha too, it has never been run against a real UAC prompt.

Settings has a security mode that blocks `People Playground.exe` from the network with two Windows Firewall rules, one inbound and one outbound, for that exe only. i added it in case another bad update ever ships. it also cuts the game off from Steam, so Steam can't auto update it while it's on. use direct launch instead of Through Steam while it's enabled.

rules need admin so you get a UAC prompt every time you turn it on or off. if you cancel, nothing changes. the tests cover the script generation and result parsing but i haven't run it against a real UAC prompt.

## Assembly-CSharp.dll fix

one People Playground update shipped a broken `Assembly-CSharp.dll` that stopped mods from loading. Settings has a bug fixes section with a fixed copy that swaps into your game folder. it backs up the original as `Assembly-CSharp.dll.pre-fix-backup` first and Revert to original puts it back.

## still to do

- Patreon downloads still need more real world testing
- no update tracking or endorsements yet, a new file for the same Nexus mod installs as a separate entry
- Clippy is a plain SVG right now, swap in your own art in `src/renderer/index.html`
