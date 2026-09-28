<img width="298" height="360" alt="Clippit" src="https://github.com/user-attachments/assets/a5c2d6b8-70e2-49ee-8b45-e2dda8629142" />
Join My Server https://discord.gg/QtvavUDDjp
Clippy Mod Manager

A mod manager for People Playground with a Clippy theme. It handles installing, enabling, and switching between mods, and can pull mods directly from Nexus Mods, Patreon, and top-mods.com.

WORK IN PROGRESS

Some features are marked ALPHA, so expect a few rough edges.

GETTING IT

Download the installer or portable .exe and run it. That's it.

You do not need Node, npm, or anything else installed.

Currently, Clippy Mod Manager only supports Windows.

FEATURES

Profiles

Each profile has its own list of enabled mods, allowing you to keep different setups side by side.

For example, you can have a vanilla profile and a chaos profile and switch between them with one click.

Tick to Enable

Tick a mod to add it to your game's mods folder.

Untick it to remove it.

The app only removes folders that it created itself, so your existing mods are never touched. If a folder name clashes with an existing mod, the app skips it instead of overwriting anything.

Archive Support

You can add .zip, .7z, and .rar archives.

The app automatically extracts the archive and searches for the mod inside.

If a mod doesn't contain a mod.json, the app will display a warning.

Nexus Mods

Search for People Playground mods or look them up by Nexus mod ID directly inside the app.

Patreon - ALPHA

Paste a Patreon post link and the app will attempt to download and install the mod.

This feature is currently in ALPHA and is still being tested.

Top Mods

Browse top-mods.com directly from the app.

Available categories include:

* Newest
* Most Downloaded
* Top Rated
* Most Commented

Game Folder Picker

Browse for your People Playground installation or use Auto-Detect.

The Play button can launch the game directly or launch it through Steam.

Automatically Delete Archives

Optional setting that deletes an archive after a successful installation.

This only applies to archives that were downloaded by the app itself.

Assembly-CSharp.dll Fix

A People Playground update shipped with a broken Assembly-CSharp.dll that prevented mods from loading.

The Settings menu includes an option to install a fixed version.

The original DLL is backed up before being replaced.

You can use Revert to Original to restore the original file.

Security Mode - ALPHA

Security Mode blocks People Playground from accessing the internet using Windows Firewall.

This is intended to help prevent another bad game update from being downloaded.

ALPHA: This feature has not yet been tested on a large number of different systems.

Clippy

Clippy gives you tips and follows your mouse around.

Right-click Clippy to hide him.

You can bring him back from Settings.

FIRST-TIME SETUP

1. Open Settings and select your People Playground game folder.
2. You can use Auto-Detect if you aren't sure where the game is installed.
3. Make sure the Mods folder is set to the location your game actually uses.
4. If you want to use Nexus Mods, click Get API Key from Nexus, copy your API key, and paste it into the app.
5. If you want to use Patreon, open the Patreon tab and log in.

NEXUS MODS

People Playground on Nexus Mods currently only provides Manual Download, so the download process works slightly differently.

1. Find a mod in the Nexus tab and click Get.
2. The Nexus page will open in your browser.
3. Click Manual Download on the Nexus page.
4. Save the downloaded file.
5. Clippy Mod Manager watches your Downloads folder and automatically detects the completed download.
6. The mod is then installed.

Premium Nexus accounts will attempt a direct download first. If Nexus doesn't allow the direct download, the app falls back to the browser method above.

You can also manually install an archive at any time using Add Archive on the Mods tab.

PATREON - ALPHA

The Patreon integration is currently ALPHA.

Some Patreon posts may still fail to download, and this is currently the least-tested part of the application.

Logging In

Logging in opens a normal browser window using the official Patreon website.

The app does not see or store your Patreon password. It only keeps the resulting login session.

Currently:

* Email login - Supported
* Google login - Supported
* Apple login - Untested

Downloading a Mod

1. Paste a Patreon post link into the Patreon tab.
2. Click Download and Install.
3. You must have a subscription that includes access to the post.
4. If Patreon blocks the direct download, the app will fall back to a browser window.
5. If Cloudflare displays a verification check, complete it once and the download should continue.

If a download fails, check the log on the Patreon tab. The log is the most useful thing to send when reporting a Patreon problem.

TOP MODS

top-mods.com is a fan-run website and is not affiliated with the People Playground developers or Nexus Mods.

The app reads the site's listing pages to display its mod lists.

If the website changes its layout, the lists may stop appearing until Clippy Mod Manager is updated.

Files are not downloaded automatically from Top Mods.

Clicking a mod opens its page in your browser. Download the file normally, and Clippy Mod Manager will detect it in your Downloads folder.

SECURITY MODE - ALPHA

Security Mode blocks People Playground from accessing the internet using Windows Firewall rules that apply specifically to the game's executable.

It also blocks the game from connecting to Steam, meaning Steam cannot automatically update the game while Security Mode is enabled.

When Security Mode is enabled, use Direct Launch instead of Through Steam.

Turning Security Mode on or off requires administrator permissions, so Windows will display a UAC prompt each time.

If you cancel the UAC prompt, no changes will be made.

ALPHA: Security Mode has not yet been tested on a large variety of systems.

TROUBLESHOOTING

Patreon says there is nothing downloadable

Check the log on the Patreon tab. It shows what Patreon returned.

If you're reporting the issue, send the log with your report.

Patreon says I'm logged in, but downloads fail

Click Log In again to refresh your session.

Top Mods is empty

The Top Mods website may have changed its layout. Clippy may need to be updated to work with the new layout.

Mods don't load after a game update

Try the Assembly-CSharp.dll Fix in Settings.

A mod shows a warning

The mod probably doesn't contain a mod.json.

People Playground may not be able to load the mod correctly without one.

STILL TO DO

* More Patreon testing
* Update tracking and endorsements
* Improve handling of new files for existing Nexus mods
* Proper Clippy artwork

Currently, if a new file is released for the same Nexus mod, it is installed as a separate entry.

Clippy is also using a simple placeholder drawing for now.

LICENSE

GPL-3.0-or-later
