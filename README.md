# Riff Vault 🎸

A private, minimal document vault for guitar notes, music theory and any file you want to find fast.
Static site (no build step) + Supabase for sign-in, database and file storage.

## Features
- Sign up / sign in (email + password), per-user private library
- Upload up to **1 GB per file** (resumable, chunked uploads), drag & drop anywhere
- Categories, tags, notes, search (press `/`), sort, grid/list view
- 4 themes (Midnight, Obsidian, Ivory, Plum) and 6 accent colours — tap the palette button at the bottom-right; your choice is remembered
- Storage meter (1 GB), open / download / edit / delete
- Security via Supabase Row Level Security: nobody can read your rows or files but you

## Setup (about 5 minutes)

### 1. Create a Supabase project
Go to https://supabase.com → New project (free tier is fine).

### 2. Run the schema
Supabase dashboard → **SQL Editor** → paste everything from `supabase/schema.sql` → **Run**.
This creates the `documents` table, a **private** `documents` bucket, and the security policies.

### 3. Raise the upload limit to 1 GB (important)
Supabase → **Storage → Settings** (or Project Settings → Storage) → set
**Global file size limit** to `1 GB`.

> The Free plan caps files at **50 MB** and total storage at 1 GB. To upload files bigger than 50 MB
> you need the Pro plan. The app itself is already set up for 1 GB per file.

### 4. Add your keys
Supabase → **Project Settings → API**. Copy the **Project URL** and the **anon public** key into `config.js`.

- The anon key is designed to be public, so it is safe to commit to GitHub.
- **Never** put the `service_role` key in this project.

### 5. Auth settings
Supabase → **Authentication → URL Configuration**:
- Set **Site URL** to your deployed URL (e.g. `https://USERNAME.github.io/riff-vault/`)
- Add the same URL (and `http://localhost:5500` for local testing) to **Redirect URLs**

Optional: to stop strangers from creating accounts on your vault, after you sign up yourself turn off
**Authentication → Providers → Email → "Allow new users to sign up"**.

## Run locally
```bash
npx serve .      # or: python3 -m http.server 5500
```

## Deploy on GitHub Pages
1. Push this folder to a GitHub repo
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / root
3. Open `https://USERNAME.github.io/REPO/` and add that URL in Supabase (step 5)

## Files
| File | Purpose |
|---|---|
| `index.html` | Layout, auth screen, dialogs |
| `style.css` | Dark, gold, musical design |
| `theme.js` | Theme + accent picker, card spotlight |
| `app.js` | Auth, upload, search, rendering |
| `config.js` | Your Supabase URL + anon key |
| `supabase/schema.sql` | Table, bucket, security policies |

## Security notes
- Files live in a private bucket; they open through short-lived (2 min) signed links.
- Every row and file is locked to `auth.uid()` by Row Level Security, so keys in the repo cannot expose your data.
