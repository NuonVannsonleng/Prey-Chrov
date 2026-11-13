# Deploying Prey Chrov

Prey Chrov is a static web game. A build is a folder of HTML, JavaScript, CSS and font files (`dist/`). There is no server code, database or account system. Any static host works.

The build uses relative paths (`base: './'` in `vite.config.ts`), so it runs at a domain root (`https://example.com/`) and in a sub-folder (`https://user.github.io/Prey-Chrov/`). The smoke test serves the built game from `/Prey-Chrov/` and checks that every file loads and nothing is requested from another site.

## 1. Build and check locally

Requirements: Node.js 20 or newer (22 LTS recommended) and npm.

```bash
npm ci              # clean install from package-lock.json
npm test            # unit tests
npm run build       # typecheck + production build into dist/
npm run preview     # serve dist/ at http://localhost:4173 — open it and play
```

Optional browser checks (need Microsoft Edge or Google Chrome installed):

```bash
npm run smoke                    # ~250 automated checks against dist/
SOAK_MINUTES=20 npm run soak     # 20-minute automated play session (errors, memory, speed)
```

Publish the contents of `dist/`. Nothing else is needed at runtime.

## 2. GitHub Pages (recommended for this repository)

The repository includes `.github/workflows/deploy-pages.yml`. It only runs when you start it, so nothing deploys by accident.

1. On GitHub, open the repository → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open the **Actions** tab → **Deploy to GitHub Pages** → **Run workflow** (branch `main`).
4. The workflow installs, tests and builds the game, then publishes `dist/`. When it finishes, the game is at
   `https://<your-user>.github.io/Prey-Chrov/` (for this repository: `https://nuonvannsonleng.github.io/Prey-Chrov/`).
5. To publish a new version later, run the workflow again.

To deploy on every push to `main`, add `push: { branches: [main] }` under `on:` in the workflow.

## 3. Netlify

1. **Add new site → Import an existing project**, then pick the repository.
2. Set the build command to `npm run build` and the publish directory to `dist`.
3. Deploy. No redirects or environment variables are needed.

Drag-and-drop also works: run `npm run build` locally and drop the `dist` folder onto the Netlify dashboard.

## 4. Cloudflare Pages

1. **Workers & Pages → Create → Pages → Connect to Git**, then pick the repository.
2. Set the framework preset to **None**, the build command to `npm run build` and the build output directory to `dist`.
3. Set the environment variable `NODE_VERSION` to `22` if the default Node is older than 20.
4. Save and deploy.

## 5. After deploying: a 5-minute check

- [ ] The menu shows ព្រៃជ្រៅ in the Moul font, and the footer shows the version (for example `v0.18.0`).
- [ ] Play → Begin starts a journey. Walking, gathering (hold E) and the inventory (I) work.
- [ ] Esc pauses. Reloading the page and choosing Continue resumes the journey.
- [ ] The browser console (F12) shows no errors.
- [ ] Try a phone-sized and a wide window: the whole game stays visible.

## Caching

File names in `dist/assets/` contain a content hash, so they can be cached for a long time. Keep `index.html` uncached or on a short cache so players get new versions. Netlify, Cloudflare Pages and GitHub Pages handle this sensibly by default.

## Size

- **First load:** about 460 kB of JavaScript (gzipped): Phaser about 320 kB plus the game about 135 kB, plus a few kB of CSS.
- **Fonts:** about 20–50 kB each, fetched only for the characters on screen.
- All art and sound are generated in the browser, so there are no image or audio downloads.

## Privacy

There is no telemetry, analytics, cookies or third-party request. See [PRIVACY.md](PRIVACY.md). Do not add analytics without the project owner's permission.
