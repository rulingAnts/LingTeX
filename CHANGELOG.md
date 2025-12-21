# Changelog

## 0.2.4 (2025-12-21)
- Panel: Removed always-visible “Install TeX Distribution” buttons. Instead, “Check Environment” now offers to install when no TeX environment is detected (with a link to the install guide).
- Docs: Updated README and website to reflect the new flow.

## 0.2.3 (2025-12-21)
- Packages: New command “Install Recommended Packages” installs a curated set for linguistics papers (fontspec, biblatex/biber, gb4e/langsci-gb4e, forest, qtree, tipa, tables/graphics, and more). If a main TeX file is set, missing preamble packages are merged into the install list.
- Cross-platform: Uses `tlmgr` (TeX Live/MacTeX) and falls back to `mpm --admin` (MiKTeX) on Windows. macOS installs the recommended set automatically right after BasicTeX.
- Linux/Windows post-install: Attempts recommended installs; when `tlmgr` isn’t available on distro-managed TeX Live, prints guidance to install equivalents via the distro (e.g., texlive-latex-extra, biber).
- Safety: The installer guard dialog is now more explicit and places “Cancel” first to discourage accidental reinstalls.

## 0.2.2 (2025-12-21)
- Panel: Added TeX Environment section with buttons to check environment, install a distribution, and check/install missing preamble packages. The section auto-opens when no TeX is detected.
- Warning: A prominent red warning band appears at the top of the panel when no TeX distribution is found, with quick actions.
- Cross-platform installers: macOS (Homebrew path with fallback to downloading BasicTeX.pkg), Linux (apt/dnf/yum/pacman/zypper), Windows (winget/choco for MiKTeX or TeX Live).
- Safety guard: Before running any install, if a TeX environment is already detected, a modal prompt offers “Install anyway”, “Check Environment”, “Check Packages”, or “Cancel” to avoid accidental reinstalls or dual installs.

## 0.2.1 (2025-12-21)
- Auto-Preview Pane: Stability improvements. New editors opened while the bottom PDF is focused now move to the top and stay open (pinned) instead of closing. The single-PDF scenario reliably reopens the main TeX on top and keeps the main PDF in the bottom.
- Settings Panel: Main PDF picker integrates with auto-preview state (disabled tooltip when unset). Workspace folder selection continues to persist across sessions.
- Implementation details: Moving tabs uses `moveActiveEditor` with small delays and pinning via `keepEditor` to minimize focus churn and prevent preview closures.

## 0.2.0 (2025-12-20)
- Fix: `lingtex.tex.mainFile` input in the Settings panel now updates immediately after browsing, preventing `Save All Settings` from overwriting it with an empty value.
- Change: Marked LingTeX settings as resource-scoped so per-folder (`WorkspaceFolder`) settings are supported and saved into each folder’s `.vscode/settings.json`.
- Feature: Added a Folder selector to the Settings panel for multi-root workspaces; switching folders refreshes the panel with that folder’s saved settings.
- Improvement: Auto-refresh the panel when LingTeX settings change or when workspace folders change, ensuring controls always reflect the current folder’s configuration.
- Change: Removed automatic `\\parencite{...}` in figure captions to avoid compile errors; users can add citations manually as needed.

## 0.1.1 (2025-12-20)
- Image → Figure: Output format now uses `[H]`, `\centering`, and `\includegraphics[width=\textwidth]{...}` with `\label{fig:...}`. Optional `\parencite{...}` appended inside `\caption{...}` when a citation key is provided.
- Paths in inserted figures are computed relative to `lingtex.tex.mainFile` (if set), ensuring correctness when inserting into files included via `\input{...}`.
- Panel: Added inputs for Caption and Citation key, plus a tip noting that `[H]` requires `\usepackage{float}` and how the main TeX file affects path resolution.
- Settings: Added `lingtex.tex.mainFile` to configure the main document.
- Interlinear: simplified spacing controls to a single "Interlinear line spacing" (`lingtex.interlinear.openupGlossAmount`); before/after translation spacing auto-calculated to 50%.
- Settings: Added "Browse …" buttons to pick Tables/Figures output directories via a folder picker; selected repo-relative paths saved as `${workspaceFolder}/…`.

## 0.1.0 (Pre-release)
- Panel: multiple collapsible sections; theme normalized to VS Code.
- Interlinear: spacing via \openup; configurable before/after; `\par\smallskip` before `\glt`.
- TSV → Tabularx: panel-based input; opens untitled LaTeX output.
- Image → Figure: pick image, copy into workspace, insert LaTeX figure (size constrained; quick ref link).
- Icons: theme-aware `currentColor`; swapped activity bar vs view icons; header logo added and cropped.
- Conditional visibility: Activity Bar and view hide/show based on presence of TEX files or override setting.
- Run & Debug: launch configs for blank/sample workspaces and your grammar/phonology projects.
- Misc: minor UI fixes; default settings aligned to example style.

## 0.0.1
- Initial scaffold for LingTeX extension
- Command stubs registered
