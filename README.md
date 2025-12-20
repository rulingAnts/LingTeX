# LingTeX

LingTeX is a Visual Studio Code extension that adds linguistics authoring helpers for LaTeX. It is designed to complement LaTeX Workshop and LaTeX Utilities.

## Sidebar Panel
- Access the LingTeX panel from the Activity Bar (left sidebar) using the LingTeX icon.
- The panel provides buttons for all features and simple forms for common options (e.g., TSV → Interlinear output mode, Excel export destination).
- Use the Quick Actions to open TSV templates or run conversions without the Command Palette.

## Commands
LingTeX now uses a panel-only UX. Commands are hidden from the Command Palette; launch actions from the LingTeX panel in the Activity Bar. Title bar actions (Generate/Cancel) appear contextually when using TSV templates.

## Requirements
- Recommended: LaTeX Workshop, LaTeX Utilities

## Extension Settings
- `lingtex.tables.outputDir`: Default output directory for generated LaTeX tables.
- `lingtex.excel.outputLocation`: Where to save Excel files (`downloads`, `documents`, `workspace`, or `prompt`). Defaults to `downloads`. Exports auto-open with the system Excel viewer.
- `lingtex.excel.filenameTemplate`: Template for Excel filenames. Supports `${basename}`, `${date}` (YYYYMMDD), `${time}` (HHmmss).

- `lingtex.figure.outputDir`: Default output directory for images imported as figures (e.g., `${workspaceFolder}/misc/figures`).
- `lingtex.tex.mainFile`: Path to the main `.tex` file. When set, imported image paths are computed relative to this file (e.g., `${workspaceFolder}/main.tex`).
- `lingtex.interlinear.openupGlossAmount`: Interlinear line spacing passed to `\openup` before gloss lines (e.g., `1em` or `6pt`). Spacing before/after the free translation is automatically set to 50% of this value.

Panel tips:
- Use “Browse Tables Dir…” and “Browse Figures Dir…” to pick folders. Selected paths inside the repo are saved as `${workspaceFolder}/…` for portability.

## Development
- Run and debug via the provided launch configuration (Run Extension).
- Build with `npm run build`; watch with `npm run watch`.

## Image → LaTeX Figure

Use the LingTeX panel section “Image → LaTeX Figure” to import an image and insert a ready-to-compile LaTeX figure block.

### Setup
- Set “Figures output dir” (default: `${workspaceFolder}/misc/figures`).
- Set “Main TeX file” (optional). Paths in the inserted `\includegraphics{...}` are made relative to this file. This ensures correct paths when inserting into files included via `\input{...}`.
- Optional: enter a Caption and a Citation key (used in `\parencite{...}`).
 - You can also click “Browse Figures Dir…” in Settings to select a folder.

### Output format
The inserted snippet uses a compact format:

```
\begin{figure}[H]
	\centering
	\includegraphics[width=\textwidth]{./misc/figures/example.png}
	\caption{Your caption here \parencite{yourCiteKey}}
	\label{fig:example}
\end{figure}
```

Notes:
- The `[H]` float specifier requires `\usepackage{float}` in your preamble.
- `width=\textwidth` yields full-line width. Adjust as needed.
- Paths are normalized to use forward slashes and prefixed with `./` when appropriate.
- The label key is derived from the image filename (sanitized).

### Behavior
- Image is copied to the configured output directory, avoiding name collisions by appending a numeric suffix.
- If `lingtex.tex.mainFile` is set, the image path is computed relative to that file’s directory; otherwise it’s relative to the active editor’s file or workspace root.


## License
This project is licensed under AGPL-3.0-only. See [LICENSE](LICENSE).
