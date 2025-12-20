# Changelog

## Unreleased
- Image → Figure: Output format now uses `[H]`, `\centering`, and `\includegraphics[width=\textwidth]{...}` with `\label{fig:...}`. Optional `\parencite{...}` appended inside `\caption{...}` when a citation key is provided.
- Paths in inserted figures are computed relative to `lingtex.tex.mainFile` (if set), ensuring correctness when inserting into files included via `\input{...}`.
- Panel: Added inputs for Caption and Citation key, plus a tip noting that `[H]` requires `\usepackage{float}` and how the main TeX file affects path resolution.
- Settings: Added `lingtex.tex.mainFile` to configure the main document.

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
