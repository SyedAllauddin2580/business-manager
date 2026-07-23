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

## Backlog / Future Ideas

Discussed and deliberately parked for later — not built yet, kept here so
nothing gets lost between sessions.

### Sales — Returns & Discounts
- **Discounts**: currently you can already sell below list price by just
  typing a lower Unit Price at time of sale — this works today. A proper
  discount feature would add a separate "Discount %/₹" field so the
  ledger records *what the discount was*, not just a lower price, making
  "how much did I give away in discounts this month" its own reportable
  number. Low effort.
- **Returns**: a customer returning goods needs stock added back AND
  turnover/profit reduced for that sale — right now nothing reverses a
  sale's financial impact once recorded. Also needs to handle the case
  where the original sale was on credit (reduce/cancel that due). Touches
  Dashboard, Reports, Catalog, and Credit simultaneously — worth designing
  properly in its own session rather than bolting on. Medium-large effort.

### Purchases — Supplier Tracking
- Tag each purchase with who you bought it from (reusing the same
  autocomplete-and-auto-create pattern already built for credit-sale
  customers).
- Report: total spent per supplier, and average price paid per supplier
  for the same product (useful for negotiating / choosing who to reorder
  from).
- Note: money owed *to* a supplier for goods bought on credit is already
  covered by Credit tab → "Other Credit → I Owe (Taken)" — this backlog
  item is purely about labeling/reporting, not dues tracking. Low effort,
  no risk to existing turnover/profit math.

### Other ideas raised along the way (not yet scoped in detail)
- **Adjustment reason field** — dropdown (Damaged / Theft / Recount /
  Personal Use / Other) instead of free-text notes, to eventually report
  shrinkage by cause.
- **Search on the Transactions ledger** — filter by product name, not
  just date/type.
- **Undo on delete** — brief "Undone" option after deleting a transaction
  or product, instead of a plain confirm dialog.
- **Link credit sales to their transaction** — right now editing/deleting
  a transaction that was originally a credit sale doesn't update the
  linked customer ledger entry, because there's no stored link between
  them. Fixing this would make edits/deletes fully consistent everywhere.
- **Stale inventory alert** — flag products not sold in 90+ days.
- **Call / WhatsApp buttons** on a customer's ledger sheet (`tel:` and
  `wa.me` links — cheap to add, no library needed).
- **Capital Health gauge** — a simple Excellent/Good/Average/Needs
  Attention indicator based on capital growth %, once we agree on
  thresholds.
- **PDF / Excel export** of reports (beyond the current full-JSON
  backup) — would need a bundled library, adds to app size.
- **Barcode scanning** — feasible cheaply using Chrome's native
  `BarcodeDetector` API (no external library needed) rather than a heavy
  barcode-decoding package.
- **GST / Tax support** — real feature, not a settings toggle: tax rates
  per product, inclusive/exclusive pricing, tax breakdown on record —
  meaningfully more work than anything above.
- **Multi-user / staff accounts** — PIN-per-staff-member, activity log of
  who recorded what.
- **Settings section** (business name, currency symbol, dark mode) —
  parked until there's enough to actually bundle; currently Backup/Restore
  lives in the Reports tab.

### Known architectural limit (not really "backlog," just a fact)
This app is deliberately offline-only, single-device, zero-server, zero
cost. That's why it can be free and work with no setup. **True
multi-device sync is a different, much bigger project** — it would need
a real backend server and accounts, which conflicts with the offline/
zero-cost design. Worth knowing this going in rather than expecting it
to appear as an incremental feature.

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
