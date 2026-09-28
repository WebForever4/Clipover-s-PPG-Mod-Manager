# Clippy Mod Manager

a mod manager for People Playground with a Clippy theme. it handles installing, enabling and switching between mods, and it can pull mods straight from Nexus, Patreon and top-mods.com. loosely based on Mod Organizer 2.

still a work in progress. some parts are marked ALPHA below, so expect a few rough edges.

## getting it

download the installer (or the portable exe) and run it. that's it. you don't need Node, npm or anything else installed. it only runs on Windows.

## what it does

- **profiles.** every profile is its own list of enabled mods, so you can keep a chaos setup and a vanilla setup side by side and swap in one click.
- **tick to enable.** tick a mod and it shows up in your game's mods folder right away. untick it and it's gone. the app only ever removes folders it put there itself, so your own mods are never touched, and if a name clashes it skips the mod instead of overwriting anything.
- **archives.** drop in .zip, .7z or .rar files and the app unpacks them and finds the mod inside. if a mod has no `mod.json` you get a warning on it.
- **Nexus Mods.** search or look up a mod by ID right inside the app.
- **Patreon (ALPHA).** paste a Patreon post link and it downloads and installs the mod for you.
- **Top Mods.** browse top-mods.com (newest, top downloaded, top rated, most commented) without leaving the app.
- **game folder picker.** browse for the game or hit auto-detect. the Play button can launch the exe directly or go through Steam.
- **auto delete archives.** optional. deletes the archive after a successful install, but only for files the app downloaded itself.
- **Assembly-CSharp.dll fix.** one game update shipped a broken dll that stopped mods from loading. Settings has a button that swaps in a fixed copy and backs up the original first. Revert to original puts it back.
- **security mode (ALPHA).** blocks People Playground from the network using Windows Firewall, in case another bad update ever ships.
- **Clippy.** he gives you tips and follows your mouse around. right click him to hide him and bring him back from Settings.

## first time setup

1. open Settings and set your game folder (auto-detect usually finds it).
2. check the mods folder is where your game actually loads mods from. the default is `Documents/People Playground/mods`.
3. if you want Nexus, click Get API key from Nexus, copy the key and paste it in.
4. if you want Patreon, go to the Patreon tab and log in.

## Nexus

People Playground on Nexus only has Manual Download, so the flow is:

1. find a mod in the Nexus tab and hit Get.
2. the Nexus page opens in your browser. click Manual Download and save the file.
3. the app watches your Downloads folder, waits for the file to finish and installs it.

premium accounts try a direct download first and fall back to this if Nexus says no. you can also use Add archive on the Mods tab any time.

## Patreon (ALPHA)

this one is alpha. some posts still fail to download and it's the least tested part of the app.

logging in opens a normal window pointed at the real patreon.com login page. the app never sees your password, it only keeps the session afterwards. email login and Google login both work. Apple login is untested.

paste a post link and hit Download and install. you need a subscription that actually includes the post. Patreon sometimes blocks the direct download, so the app falls back to a browser window. if Cloudflare shows a check in that window, pass it once and the download carries on.

if a post fails, the log on the Patreon tab says what happened. that's the most useful thing to send me.

## Top Mods

top-mods.com is a fan run site and isn't connected to the game dev or Nexus. the app reads its listing pages, so if the site changes its layout the lists can come back empty until the app gets updated.

files aren't downloaded automatically. clicking a mod opens its page in your browser. download it like normal and the app picks it up from your Downloads folder.

## security mode (ALPHA)

Settings has a security mode that cuts People Playground off from the network with Windows Firewall rules that only apply to that exe. it also cuts the game off from Steam, so Steam can't auto update it while it's on. use direct launch instead of Through Steam while it's enabled.

turning it on or off needs admin, so Windows shows a UAC prompt each time. cancel it and nothing changes. alpha because it hasn't been tested on a lot of machines yet.

## troubleshooting

- **Patreon says nothing downloadable.** the log shows what Patreon sent back. send it to me.
- **Patreon says logged in but downloads fail.** hit Log in again to refresh the session.
- **Top Mods list is empty.** the site probably changed its layout and the app needs an update.
- **mods don't load after a game update.** try the Assembly-CSharp.dll fix in Settings.
- **a mod shows a warning.** it has no `mod.json`, so the game may ignore it.

## still to do

- more Patreon testing
- update tracking and endorsements. right now a new file for the same Nexus mod installs as a separate entry
- proper Clippy art, he's a plain drawing for now

## license

GPL-3.0-or-later, same as Mod Organizer 2.
