# Coach Browser frontend

A standalone React + Vite marketing site designed to deploy from this directory on Vercel.

> Do not open `index.html` directly with `file://`; browsers cannot compile the React/TypeScript
> source. On Windows, double-click `OPEN-WEBSITE.cmd` for a one-step local preview.

## Local development

```bash
pnpm install
pnpm dev
```

## Production build

```bash
pnpm build
```

## Download URL

Set `VITE_DOWNLOAD_URL` in Vercel to point every download button at a direct installer or release page. Without it, the site falls back to the latest GitHub release page.

In Vercel, create a project with `website/frontend` as the Root Directory. The included `vercel.json` supplies the Vite build and output settings.
