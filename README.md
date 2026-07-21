# Retail Manager — Android PWA (installable, works offline)

This is a Progressive Web App version of Retail Manager. It installs onto
your phone like a real app (own icon, own window, no browser bar) and
works fully offline after that — but to install it the *first* time,
Android/Chrome requires the files to be served over **HTTPS** (plain
`file://` won't offer the install prompt). The good news: hosting it is
free and only needs to be done once.

## Step 1 — Host the files (pick one, both free)

### Option A: GitHub Pages (recommended, permanent)
1. Create a free GitHub account if you don't have one: github.com
2. Create a new repository (e.g. `retail-manager`), set it to Public.
3. Upload every file in this folder into that repository, keeping the
   same folder structure (`index.html`, `manifest.json`, `css/`, `js/`,
   `icons/`, `service-worker.js` all at the repo root).
4. In the repo, go to **Settings → Pages**. Under "Build and
   deployment", set Source to "Deploy from a branch", branch `main`,
   folder `/ (root)`. Save.
5. Wait ~1 minute, then GitHub gives you a URL like:
   `https://yourusername.github.io/retail-manager/`

### Option B: Netlify Drop (fastest, no account needed for a quick test)
1. Go to app.netlify.com/drop
2. Drag this entire folder onto the page.
3. You instantly get a URL like `https://random-name.netlify.app`
   (create a free account if you want it to stay permanent instead of
   expiring).

## Step 2 — Install it on your phone

1. Open the URL from Step 1 in **Chrome** on your Android phone.
2. Tap the **⋮** menu (top right) → **"Add to Home screen"** or
   **"Install app"** (wording varies by Chrome version).
3. Confirm — an app icon appears on your home screen, just like any
   other installed app.
4. Open it from that icon from now on. It launches full-screen with no
   browser address bar.

## Step 3 — Using it offline

After the first successful load, a service worker caches every app file
on your phone. You can turn on Airplane Mode and the app keeps working
completely normally — nothing after Step 2 requires internet again,
including all future launches.

## Your data

- All business data (products, prices, transactions, expenses) is
  stored locally on your phone using the browser's IndexedDB storage —
  nothing is uploaded anywhere.
- This means the data lives with **that one phone and that one
  browser**. Uninstalling the app, clearing Chrome's site data, or
  losing the phone means losing the data.
- **Use the Backup feature**: Reports tab → "Export Backup" downloads a
  JSON file with everything. Do this regularly (weekly is reasonable)
  and save that file somewhere safe (email it to yourself, Google
  Drive, etc.). "Restore Backup" on the same screen loads a backup file
  back in, replacing whatever is currently on the device.

## Updating the app later

If you (or I) change the code later, just re-upload the changed files
to your GitHub repo (or re-drag to Netlify). The service worker checks
for updates automatically the next time you open the app while online,
and refreshes its cache in the background.

## Folder structure

```
retail_manager_pwa/
├── index.html          App shell — all tab panels live here
├── manifest.json        Makes the app installable (name, icon, colors)
├── service-worker.js    Caches everything for offline use
├── css/styles.css       All visual styling
├── js/
│   ├── db.js             IndexedDB storage layer
│   ├── logic.js          Turnover/profit/recommender calculations
│   ├── charts.js         Canvas chart drawing (no external library)
│   └── app.js            UI wiring — tabs, forms, rendering
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

## Notes

- No build step, no npm install, no external CDN dependencies at
  runtime — just static files. This keeps the offline guarantee solid:
  nothing can fail to load because a third-party service is down.
- Tested end-to-end (catalog, pricing, transactions, dashboard charts,
  expense recommender, and backup/restore) with real browser automation
  before delivery.
