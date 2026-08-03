# Phase 10 — Manual QA checklist

Live URLs:
- Frontend: https://proforce-tooling.pages.dev/
- Backend: https://proforce-tooling-api.onrender.com

## 0. Before you start

1. Commit + push the three Phase 10 files that are already sitting in your
   local repo (I wrote these but haven't pushed — that's still your step
   per our usual flow):
   - `README.md`
   - `docs/adding-a-new-tool.md`
   - `backend/scripts/seed_demo_data.py`

   ```bash
   git add README.md docs/adding-a-new-tool.md backend/scripts/seed_demo_data.py
   git commit -m "Phase 10: new-tool guide + demo data seed script"
   git push
   ```

2. Seed the live backend with demo data (run from the `backend/` folder —
   needs `uv`, which you already have from local dev):

   ```bash
   cd backend
   uv run python scripts/seed_demo_data.py --api-base https://proforce-tooling-api.onrender.com
   ```

   This creates a demo login (`qa-demo@proforcedefence.com` /
   `correct-horse-battery-staple`), 16 components spread across
   available/low-stock/out-of-stock, 3 sample projects with MIL items, and
   writes `backend/scripts/bom_test.csv` — the file you'll upload in step 5
   below. **Note:** Render free-tier services spin down when idle, so the
   first request after a while may take 30–60 seconds to respond (cold
   start) — that's expected, not a bug, if the first page load feels slow.

## 1. Auth

- [ ] Sign up a brand-new account (or use the seeded demo login above) —
      confirm you land on the Tool Hub after login.
- [ ] Log out, log back in with the same credentials.
- [ ] Try logging in with a wrong password — confirm you get a clear error,
      not a blank screen or console error.
- [ ] Refresh the page while logged in — confirm you stay logged in
      (session persists) rather than getting bounced to login.
- [ ] Try visiting `/inventory` or `/projects` directly while logged out —
      confirm `ProtectedRoute` redirects you to login instead of showing
      the page.

## 2. Tool Hub

- [ ] Confirm both Inventory and Projects show as "Live" cards, and
      Engineering Change Requests shows "Coming soon" (or whatever the
      current placeholder state is).
- [ ] Click into each live card and confirm it navigates correctly.
- [ ] Check the page against the approved mockup for the hub screen —
      layout, spacing, colors, and copy should match what's in the team's
      Inhouse Tooling mockups folder.

## 3. Inventory

- [ ] Dashboard loads with the seeded components — confirm the stat tiles
      (total components, low stock, out of stock) reflect the actual data
      (the seed script deliberately includes a couple of zero-quantity and
      low-quantity items so all three states have something to show).
- [ ] Search/filter for a component by name — confirm results narrow
      correctly.
- [ ] Open a single component's detail view — confirm all fields
      (SKU, brand, description, quantity, category) display correctly.
- [ ] Create a new component through the UI — confirm it appears in the
      list without a manual refresh.
- [ ] Edit an existing component's quantity — confirm the change persists
      after a page refresh.
- [ ] Delete a component (a throwaway one you just created, not seeded
      data) — confirm it disappears from the list.
- [ ] Compare layout/spacing/empty states against the Inventory mockup
      screens.

## 4. BOM checker

- [ ] Upload `backend/scripts/bom_test.csv` (generated in step 0.2) through
      the BOM checker UI.
- [ ] Confirm the results split into the three expected buckets:
      - **Available**: Carbon Fiber Propeller 10x4.5, Brushless Motor 2212
        920KV
      - **Low stock**: Battery Charger Balance (has 3, BOM asks for 5)
      - **Missing**: GPS Module M8N (seeded at 0 quantity), Titanium Frame
        Mount Assembly (not seeded at all — tests the no-fuzzy-match path)
- [ ] Confirm quantities shown match what's actually seeded vs. requested.
- [ ] Try uploading a malformed/empty CSV — confirm you get a real error
      message, not a crash.

## 5. Projects

- [ ] Confirm the 3 seeded projects show up (VTOL Survey Drone, Ground
      Station Telemetry Radio Upgrade — status "done", Sensor Payload Bay
      — status "paused", no abstract).
- [ ] Open the VTOL Survey Drone project — confirm its 3 MIL items show
      with correct quantities, and the linked code repo
      (github.com/octocat/Hello-World) is clickable.
- [ ] Create a new project, add a MIL item referencing a seeded component,
      confirm it saves and displays correctly.
- [ ] Change a project's status (e.g. active → paused) — confirm it
      persists.
- [ ] Compare against the Projects mockup screens for layout/status-badge
      styling.

## 6. Cross-cutting

- [ ] Resize the browser to a mobile width — confirm the FootNav/mobile
      layout holds up (Phase 3/4 built this responsively; just re-confirm
      nothing regressed).
- [ ] Open browser dev tools → Console while clicking around — confirm no
      unexpected errors (React warnings about keys, etc. are lower
      priority; failed network requests or uncaught exceptions are not).
- [ ] Open browser dev tools → Network tab — confirm API calls go to
      `proforce-tooling-api.onrender.com` (not `localhost`) and get real
      responses, not CORS errors.
- [ ] Force an error state if you can (e.g. turn off wifi briefly while a
      page is loading) — confirm the error boundary/error banner shows
      something reasonable rather than a blank white screen.

## Reporting back

For anything that doesn't match, note: which screen, what you expected
(per the mockup) vs. what you saw, and a screenshot if easy to grab. Send
that back and I'll fix the code directly.
