# LingTeX Website (GitHub Pages)

This folder hosts the user-facing website that looks similar to a Visual Studio Code Marketplace page and includes a direct, auto-updating VSIX download button.

## What it does
- Displays extension name, publisher, description and badges.
- Provides a “Download VSIX” button that automatically points to the latest release asset by calling the GitHub Releases API.
- Falls back to the Releases page if a VSIX asset is not found.

## Prerequisite
LingTeX is a Visual Studio Code extension. The website now highlights that VS Code must be installed first, with links and brief OS-specific guidance on the Install page.

## Enable GitHub Pages
1. Open the repository on GitHub → Settings → Pages.
2. Under “Build and deployment”, set:
   - Source: Deploy from a branch
   - Branch: `main` and Folder: `/docs`
3. Save. GitHub will deploy to a URL like `https://rulingants.github.io/LingTeX/`.

## Local preview
You can preview the site locally with a simple static server:

```bash
# From repo root
python3 -m http.server 8080
# Open http://localhost:8080/docs/
```

Or with Node:

```bash
npx serve docs
```

## How the VSIX link auto-updates
The page calls `https://api.github.com/repos/rulingAnts/LingTeX/releases/latest`, then selects the first asset ending in `.vsix` and uses its `browser_download_url` for the button.

No tokens are required for public assets; the API is called client-side. If you ever rename release assets, keep the `.vsix` extension.
