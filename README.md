# The Writer’s Archive

A private, account-based writing archive for manuscripts, subjects, places, notes, and sources. The page is static; each signed-in writer’s archive is stored separately in Supabase with owner-only row-level security.

## GitHub Pages

Publish the `main` branch from the repository root in **Settings → Pages**. The entry point is `index.html`.

The project URL is `https://theblackstaginn.github.io/the-writers-archive/`. Before enabling email confirmation or password recovery for this deployment, add that exact URL to the Supabase Auth redirect allowlist and set it as the Site URL.

The dictionary lookup sends only the selected word to Free Dictionary API. Manuscript text stays in the Archive and Supabase.
