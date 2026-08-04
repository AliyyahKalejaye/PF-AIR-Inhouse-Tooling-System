# Setup Guide — read this first, do this once

This is written assuming you have never done any of this before. It tells
you exactly which accounts to create, exactly which screen/button to click,
exactly which file each value goes into, and exactly how to take future code
I send you and get it into your GitHub repo. Do the sections in order —
later sections depend on values you copy in earlier ones.

Keep a scratch note (Notes app, a text file, whatever) open while you do
this. Every account creates one or more values you'll need to paste later —
copy each one into your scratch note the moment you see it, labeled, so you
aren't hunting for it five steps later.

---

## Part 0 — What you're setting up and why

Five services, all with a free tier that's enough for this project right now:

| # | Service | What it's for | Sign up at |
|---|---|---|---|
| 1 | GitHub | Where the code lives (done — you already have this) | github.com |
| 2 | Supabase | The database (Postgres) | supabase.com |
| 3 | Upstash | Redis (cache / background jobs) | upstash.com |
| 4 | Cloudflare | Hosts the website (Pages) + stores uploaded files/images (R2) | cloudflare.com |
| 5 | Render | Runs the backend server (the API) | render.com |

You need a login for each (email + password, or "continue with GitHub" is
fine and fastest for all of them). Do them in this order: Supabase →
Upstash → Cloudflare → Render, because Render needs a value from Supabase
already in hand.

---

## Part 1 — Supabase (database)

1. Go to **supabase.com** → click **Start your project** → sign in with
   GitHub (recommended, one click) or email.
2. Click **New project**.
3. Fill in:
   - **Name**: `proforce-tooling`
   - **Database Password**: click **Generate a password**, then copy it
     into your scratch note labeled `SUPABASE_DB_PASSWORD`. You will not be
     shown it again.
   - **Region**: pick whichever is physically closest to your team.
4. Click **Create new project**. Wait ~2 minutes while it provisions.
5. Once the project dashboard loads, turn on the vector extension:
   - Left sidebar → **Database** → **Extensions**.
   - Search for `vector`.
   - Toggle it **on**. (This is what makes the HNSW component search work.)
6. Get the connection string:
   - Click the green **Connect** button near the top of the project
     dashboard.
   - A panel opens with tabs for different connection types. Select
     **Transaction pooler** (this is the one that works from Render's
     network).
   - Copy the connection string shown — it looks like:
     `postgresql://postgres.xxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-xxxx.pooler.supabase.com:6543/postgres`
   - Paste it into your scratch note labeled `SUPABASE_CONNECTION_STRING`,
     and replace `[YOUR-PASSWORD]` in it with the actual password you saved
     in step 3.

**You now have:** `SUPABASE_CONNECTION_STRING` (full string, password
already substituted in).

---

## Part 2 — Upstash (Redis)

1. Go to **console.upstash.com** → sign in with GitHub or email.
2. Click the **Redis** tab in the left sidebar.
3. Click **+ Create Database** (top right).
4. Fill in:
   - **Name**: `proforce-tooling`
   - **Primary Region**: closest to your team.
   - Leave **Read Regions** empty (not needed at this scale).
5. Click **Next**, then pick the **Free** plan, then confirm.
6. Once the database is created, click into it and open the **Details** tab.
7. You'll see connection info in this format:
   `redis-cli --tls -a PASSWORD -h ENDPOINT -p PORT`
   You need the pieces, not that exact command. Build this URL yourself and
   save it to your scratch note labeled `UPSTASH_REDIS_URL`:
   `rediss://default:PASSWORD@ENDPOINT:PORT`
   (Note it's `rediss://` with two S's — that means "Redis with TLS
   encryption", which is required for Upstash.)

**You now have:** `UPSTASH_REDIS_URL`.

---

## Part 3 — Cloudflare (website hosting + file storage)

One Cloudflare account gives you both Pages (website hosting) and R2 (file
storage). Do both under the same account.

### 3a. Create the account

1. Go to **dash.cloudflare.com/sign-up** → sign up with email + password.
2. Verify your email (check inbox, click the link).

### 3b. Find your Account ID (you'll need this twice later)

1. In the Cloudflare dashboard, look at the right-hand sidebar of the
   Overview page (or any page) — there's an **Account ID** field with a
   copy icon next to it.
2. Copy it into your scratch note labeled `CLOUDFLARE_ACCOUNT_ID`.

### 3c. Set up R2 (file storage — for uploaded images/CAD/docs)

1. Left sidebar → **R2 Object Storage**.
2. First time here, Cloudflare will ask you to enable R2 (still free tier,
   no card charge for the amount we'll use). Confirm.
3. Click **Create bucket**.
   - **Bucket name**: `proforce-tooling` (must match exactly — this is
     hardcoded in the backend config).
   - Leave location/jurisdiction as default.
   - Click **Create bucket**.
4. Create an API token so the backend can read/write to this bucket:
   - Still on the R2 page, find **Account details** in the right sidebar →
     next to **API** → click **Manage API tokens**.
   - Click **Create Account API token** (or "Create API token" — wording
     varies slightly).
   - Give it **Object Read & Write** permission, scoped to the
     `proforce-tooling` bucket if you're given that option.
   - Click **Create API Token**.
   - You'll be shown an **Access Key ID** and a **Secret Access Key**.
     **Copy both now** — the secret key is shown exactly once and cannot be
     retrieved again if you navigate away. Save them to your scratch note
     as `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
5. Your R2 endpoint is `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com`
   — build this yourself using the Account ID from step 3b, save as
   `R2_ENDPOINT` (you won't need this as a separate env var — it's derived
   from the account ID already in your notes — this is just so you
   understand what it is).
6. (Optional, can skip for now) To make uploaded files viewable by a public
   URL, go to the bucket → **Settings** → **Public access** → enable the
   `r2.dev` subdomain, and copy that URL as `R2_PUBLIC_BASE_URL`. If you
   skip this, leave that value blank for now — nothing breaks, uploaded
   files just won't have a public link yet.
7. **If you did step 6, also set a CORS policy** — skip this if you left
   public access off. Without it, images and videos still display fine
   (the browser doesn't need permission for that), but the 3D Render
   viewer's "Couldn't load this 3D model" error for every `.glb`/`.obj`
   file is caused by exactly this: three.js loads those files with
   `fetch()`, which the browser silently blocks cross-origin unless R2
   says it's allowed.
   - Still on the bucket → **Settings** → scroll to **CORS Policy** →
     **Add CORS policy**.
   - Cloudflare's editor takes a JSON array — paste this, swapping in
     your actual Pages URL from step 3d below (and keep the localhost
     entry so local dev keeps working too):
     ```json
     [
       {
         "AllowedOrigins": [
           "https://proforce-tooling.pages.dev",
           "http://localhost:3000"
         ],
         "AllowedMethods": ["GET", "HEAD"],
         "AllowedHeaders": ["*"],
         "ExposeHeaders": ["Content-Length", "Content-Range", "Content-Type"],
         "MaxAgeSeconds": 3600
       }
     ]
     ```
   - Save. Changes apply immediately — no redeploy needed. Re-open a
     project's `.glb`/`.obj` file and it should load right away.

### 3d. Set up Pages (website hosting) — connect it to GitHub

1. Left sidebar → **Workers & Pages**.
2. Click **Create** → **Pages** tab → **Connect to Git**.
3. Authorize Cloudflare to access your GitHub account if prompted, then
   select the repo: `AliyyahKalejaye/PF-AIR-Inhouse-Tooling-System`.
4. Click **Begin setup**. On the configuration screen, fill in exactly:
   - **Project name**: `proforce-tooling`
   - **Production branch**: `main`
   - **Framework preset**: `Next.js (Static HTML Export)` if offered —
     otherwise leave as `None`.
   - **Root directory** (this is the important one for our monorepo — there
     will be a button/link that says something like "Show advanced" or a
     separate **Root directory** field): set to `frontend`
   - **Build command**: `npm run build`
   - **Build output directory**: `out`
5. Before clicking deploy, add one environment variable (there's an
   **Environment variables** section on this same screen, or you can add it
   after under project **Settings**):
   - Name: `NEXT_PUBLIC_API_BASE_URL`
   - Value: leave this blank for now — you'll come back and set it once
     Render (Part 4) gives you the backend's live URL. Skipping it for now
     is fine; the site will just show "not reachable" until you set it.
6. Click **Save and Deploy**.

You don't need to touch this project again after this — once repo secrets
are set up (Part 5), every push to `main` redeploys it automatically via the
GitHub Actions workflow already in the repo. This manual click-through in
step 4-6 is a one-time "create the project" step; after that, deploys are
automatic.

**You now have:** `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, optionally `R2_PUBLIC_BASE_URL`.

You still need one more Cloudflare value for GitHub Actions — a
**Cloudflare API token** (different from the R2 one above, this one is for
*deploying the website*, not for storing files):

7. Click your profile icon (top right) → **My Profile** → **API Tokens**
   tab.
8. Click **Create Token**.
9. Find the template named **Edit Cloudflare Workers** (or **Edit
   Cloudflare Pages** if shown) → click **Use template**.
10. Leave the default permissions, restrict **Account Resources** to your
    account if asked, click **Continue to summary** → **Create Token**.
11. Copy the token shown (again, shown once only) → save to scratch note as
    `CLOUDFLARE_API_TOKEN`.

**You now also have:** `CLOUDFLARE_API_TOKEN`.

---

## Part 4 — Render (runs the backend/API)

1. Go to **dashboard.render.com** → sign up, ideally with **GitHub** (this
   also handles repo access in one step).
2. Click **New** (top right) → **Web Service**.
3. Under "Build and deploy from a Git repository", find and select
   `AliyyahKalejaye/PF-AIR-Inhouse-Tooling-System`, click **Connect**.
4. Fill in the configuration form exactly:
   - **Name**: `proforce-tooling-api`
   - **Region**: closest to your team.
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Docker` (it should auto-detect the `Dockerfile` in
     `backend/` once you set the root directory above — if it shows a
     language picker instead, manually choose Docker).
   - **Instance Type**: **Free**.
5. Scroll to **Environment Variables** and add these one at a time (click
   **Add Environment Variable** for each):

   | Key | Value |
   |---|---|
   | `ENV` | `production` |
   | `CORS_ORIGINS` | `["https://proforce-tooling.pages.dev"]` (your Cloudflare Pages URL — you'll see the exact URL on your Pages project's dashboard once deployed; update this later if it differs) |
   | `JWT_SECRET` | any long random string — e.g. open a terminal and run `openssl rand -hex 32`, paste the output here |
   | `JWT_ALGORITHM` | `HS256` |
   | `DATABASE_URL` | your `SUPABASE_CONNECTION_STRING` from Part 1, but with `postgresql://` changed to `postgresql+asyncpg://` at the very start |
   | `REDIS_URL` | your `UPSTASH_REDIS_URL` from Part 2 |
   | `R2_ACCOUNT_ID` | your `CLOUDFLARE_ACCOUNT_ID` from Part 3b |
   | `R2_ACCESS_KEY_ID` | from Part 3c |
   | `R2_SECRET_ACCESS_KEY` | from Part 3c |
   | `R2_BUCKET_NAME` | `proforce-tooling` |
   | `R2_PUBLIC_BASE_URL` | from Part 3c if you set it up, otherwise leave blank |

6. Click **Create Web Service**. Render will build and deploy — first build
   takes a few minutes. Watch the **Logs** tab; it's done when you see the
   server start message and the status dot turns green.
7. Once it's live, copy the URL shown at the top of the service page (looks
   like `https://proforce-tooling-api.onrender.com`) → save to scratch note
   as `RENDER_BACKEND_URL`.
8. Get the Deploy Hook (needed for GitHub Actions to trigger redeploys):
   - Left sidebar of the service page → **Settings** tab.
   - Scroll to **Deploy Hook** → click **Reveal** or copy directly.
   - Save to scratch note as `RENDER_DEPLOY_HOOK_URL`.

**You now have:** `RENDER_BACKEND_URL`, `RENDER_DEPLOY_HOOK_URL`.

### Go back and finish Cloudflare Pages

Now that you have `RENDER_BACKEND_URL`:

1. Cloudflare dashboard → **Workers & Pages** → your `proforce-tooling`
   project → **Settings** → **Environment variables**.
2. Set `NEXT_PUBLIC_API_BASE_URL` = your `RENDER_BACKEND_URL` (e.g.
   `https://proforce-tooling-api.onrender.com`, no trailing slash).
3. Click **Save**, then go to the **Deployments** tab and **Retry
   deployment** on the latest one (so it rebuilds with the new value baked
   in — this variable only takes effect on new builds).

---

## Part 5 — Put the values where the code can see them

There are two different places values go, and they are **not** the same
thing — mixing them up is the single most common mistake here:

- **GitHub repo secrets/variables** → only used by the GitHub Actions
  workflow files in `.github/workflows/`, to *trigger* deploys. This is
  NOT where your database password or JWT secret live.
- **Render's own dashboard env vars** (Part 4, step 5, already done above)
  → this is where the backend's actual runtime secrets live. Render reads
  these directly; nothing in GitHub touches them.
- **Cloudflare Pages' own dashboard env vars** (Part 3d/Part 4, already
  done above) → same idea, for the frontend's one build-time variable.

So the only thing left is the GitHub side:

1. Go to your repo on GitHub:
   `github.com/AliyyahKalejaye/PF-AIR-Inhouse-Tooling-System`
2. Click **Settings** (top of the repo, not your account settings) →
   left sidebar → **Secrets and variables** → **Actions**.
3. You'll see two tabs: **Secrets** and **Variables**. They look similar
   but are different — Secrets are hidden after saving, Variables are
   visible in the UI (use Variables for things that aren't sensitive, like
   a public API URL).
4. On the **Secrets** tab, click **New repository secret** three times,
   once for each of:

   | Secret name | Value |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | from Part 3d, step 11 |
   | `CLOUDFLARE_ACCOUNT_ID` | from Part 3b |
   | `RENDER_DEPLOY_HOOK_URL` | from Part 4, step 8 |

5. On the **Variables** tab, click **New repository variable** once:

   | Variable name | Value |
   |---|---|
   | `NEXT_PUBLIC_API_BASE_URL` | your `RENDER_BACKEND_URL` from Part 4, step 7 |

That's every account and every value. From here on, every push to `main`
on GitHub automatically redeploys both the website and the backend.

### Quick reference — which file/dashboard gets which value

| Value | Where it goes |
|---|---|
| `SUPABASE_CONNECTION_STRING` (as `DATABASE_URL`) | Render dashboard env vars only |
| `UPSTASH_REDIS_URL` (as `REDIS_URL`) | Render dashboard env vars only |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ACCOUNT_ID` / `R2_BUCKET_NAME` / `R2_PUBLIC_BASE_URL` | Render dashboard env vars only |
| `JWT_SECRET` / `JWT_ALGORITHM` / `ENV` / `CORS_ORIGINS` | Render dashboard env vars only |
| `NEXT_PUBLIC_API_BASE_URL` | Cloudflare Pages dashboard env vars, **and** GitHub repo Variables (both — Pages needs it to build, and the GitHub Actions workflow passes it in when it triggers a build) |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | GitHub repo Secrets only |
| `RENDER_DEPLOY_HOOK_URL` | GitHub repo Secrets only |
| `backend/.env` (local file) | **Never real credentials** — only ever your local docker-compose defaults, for running the app on your own laptop. This file is git-ignored; it never gets committed or pushed. |
| `frontend/.env.local` (local file) | Same — local-only, git-ignored. |

None of the actual passwords or secrets above ever go into a file that gets
committed to GitHub. That's intentional and is what keeps them safe — every
one of them lives only in a dashboard (Render, Cloudflare) or in GitHub's
own encrypted Secrets store.

---

## Part 6 — Running the project on your own laptop (optional, for testing)

You don't need this for the live site to work — Part 1-5 alone gets the
real site live. This part is only if you want to run a copy on your own
machine to test things before they go live.

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   if you don't have it, and open it.
2. In a terminal, inside your local copy of the repo folder:
   ```
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env.local
   docker compose up --build
   ```
3. Leave those `.env` / `.env.local` files with their default local values
   — do not paste your real Supabase/Upstash/R2 credentials into them
   unless you specifically want your laptop talking to the real production
   database (not recommended while testing).
4. Website: `http://localhost:3000`. Backend docs: `http://localhost:8000/docs`.

---

## Part 7 — How to receive and apply future code updates from me

Because of how this sandbox is set up, I cannot push directly to your
GitHub repo — I can only prepare the code and hand it to you. Here is the
exact, same-every-time process for every future update:

**Every time I finish a phase, I will:**
1. Tell you in the chat what changed, in plain language.
2. Send you a `.zip` file containing the entire repo as it should look
   after that update (not just the changed files — the whole thing, so you
   never have to guess what's new vs. old).

**Every time you receive that zip, do this:**

1. Download the zip and unzip it. You'll get a folder (e.g.
   `proforce-tooling`).
2. Open a terminal and go to your **existing local copy** of the repo (the
   one you already `git clone`d and have been pushing from):
   ```
   cd path/to/your/PF-AIR-Inhouse-Tooling-System
   ```
3. Copy everything from the unzipped folder into your repo folder,
   overwriting existing files but leaving your `.git` folder alone. On
   Mac/Linux:
   ```
   rsync -av --exclude='.git' path/to/unzipped/proforce-tooling/ ./
   ```
   On Windows (PowerShell):
   ```
   robocopy path\to\unzipped\proforce-tooling . /E /XD .git
   ```
   If you don't have `rsync` and don't want to install it, the manual
   equivalent is: select everything inside the unzipped folder **except**
   there won't be a `.git` folder in it anyway (zips from me never include
   one), copy it all, and paste it into your repo folder, choosing "replace"
   when your file manager asks about existing files.
4. Check what changed:
   ```
   git status
   ```
   This lists every file that's new or different — a good sanity check that
   the update looks like what I described in the chat.
5. Commit and push:
   ```
   git add -A
   git commit -m "Apply update: <short description from my chat message>"
   git push origin main
   ```
6. That push automatically kicks off two things: GitHub Actions CI (runs
   tests) and, if all secrets from Part 5 are set, the deploy workflows
   that update your live site and backend. Check progress at:
   `github.com/AliyyahKalejaye/PF-AIR-Inhouse-Tooling-System/actions`

That's the whole loop, every time: unzip → copy over → `git status` to
check → `git add -A` → `git commit -m "..."` → `git push origin main`.

---

## If something doesn't work

- **Cloudflare Pages shows "not reachable"**: check that
  `NEXT_PUBLIC_API_BASE_URL` (Cloudflare Pages env var) exactly matches your
  Render URL, with no trailing slash, and that you clicked "Retry
  deployment" after saving it (Part 4's last section).
- **Render service won't start**: open the **Logs** tab on the Render
  service page — the error is almost always a malformed `DATABASE_URL` or
  `REDIS_URL` (double check you swapped `postgresql://` for
  `postgresql+asyncpg://`, and that the Redis URL starts with `rediss://`).
- **GitHub Actions deploy step fails with a 401/403**: one of the three
  repo Secrets in Part 5 is missing, mistyped, or (for
  `CLOUDFLARE_API_TOKEN`) expired/revoked — regenerate it in Cloudflare and
  update the GitHub secret.
- **Anything else**: copy the exact error text from the Actions log or
  dashboard and send it to me in chat — I can read an error message far
  more precisely than a description of "it didn't work."
