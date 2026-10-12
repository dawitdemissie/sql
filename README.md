# SQL Workspace

Browser-based SQL playground. SQLite runs in the browser (sql.js / WASM, in a Web Worker); no backend, no login.

- **Two databases** defined in `public/datasets.json` (Job Postings, Invoices); files live in `public/data/`.
- **Add a database:** drop a `.db` in `public/data/` and add an entry to `datasets.json`.
  Bump its `version` whenever the file changes (invalidates users' IndexedDB cache).
- **Persistence:** open tabs, queries and the selected DB are saved per-browser in IndexedDB; DB files are cached too.
- **Safety:** DB is opened with `PRAGMA query_only = ON`; results capped at 10,000 rows; Cancel kills the worker.

## Develop
    npm install
    npm run dev

## Deploy (Netlify)
Connect the repo; `netlify.toml` sets build command, `dist` publish dir, SPA redirect and cache headers.
Or: `npm run build && npx netlify deploy --prod --dir=dist`.
