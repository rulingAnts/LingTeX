# Changelog

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
