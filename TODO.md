# TODO: LingTeX Post-Update Checklist

Follow these steps after updating and restarting VS Code to ensure the LingTeX extension is installed and commands appear in the Command Palette.

## 1) Verify VS Code version
- Help → About: confirm VS Code ≥ 1.85.0.
- If lower, either update VS Code or temporarily relax the engine in `package.json` ("engines.vscode"). Repackage if you change it.

## 2) Clean build and package the extension
```bash
npm ci
npm run bundle
npx @vscode/vsce package
```
- If `npx @vscode/vsce` isn’t available, install once: `npm i -D @vscode/vsce` and re-run `npx @vscode/vsce package`.
- This produces a `.vsix` file in the project root.

## 3) Install the VSIX
- In VS Code: Extensions panel → More (⋯) → Install from VSIX… → select the generated `.vsix`.
- Reload VS Code when prompted.
- Optionally uninstall older LingTeX versions first to avoid duplicates.

## 4) Verify commands are present
- Open the Command Palette and type `LingTeX:`.
- You should see commands like:
  - LingTeX: TSV → Interlinear (gb4e)
  - LingTeX: TSV → LaTeX tabularx
  - LingTeX: Convert Excel → LaTeX tabularx
  - LingTeX: LaTeX tabularx → Excel
  - LingTeX: Convert XLingPaper XML → Excel

## 5) Diagnostics if commands don’t appear
- Extensions view: ensure LingTeX is enabled and not marked “Unsupported”. ID should be `rulingAnts.lingtex`.
- Help → Toggle Developer Tools → Console: look for load/activation errors.
- Output → “Log (Extension Host)”: check for messages like “Cannot find module 'dist/extension.js'” or activation failures.
- Developer: Show Running Extensions: verify LingTeX is listed after you try executing one of its commands.
- Inspect the packaged VSIX (it’s a zip): confirm it contains `dist/extension.js` and that `package.json` has `"main": "./dist/extension.js"`.
- If on an older VS Code, align `"engines": { "vscode": "^1.85.0" }` in `package.json` to your version, rebuild, and repackage.

## 6) Optional: run from source (dev host)
- Use the launch config “Run Extension” to open an Extension Development Host.
- The watcher task builds to `dist` continuously; commands should show under `LingTeX:` in the dev host.

## 7) Notes
- Source for command registrations is in `src/extension.ts` and `src/features/*`.
- Manifest (commands, activation events, settings) is in `package.json`.
