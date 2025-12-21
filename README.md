# LingTeX

[![Release](https://img.shields.io/github/v/release/rulingAnts/LingTeX)](https://github.com/rulingAnts/LingTeX/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/rulingAnts/LingTeX/total)](https://github.com/rulingAnts/LingTeX/releases)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

LingTeX is a Visual Studio Code extension that adds linguistics authoring helpers for LaTeX. It is designed to complement LaTeX Workshop and LaTeX Utilities.

## Installation

For full, platform-specific instructions with auto-detected tabs, see the website: [docs/install.html](docs/install.html).

### Step 1 — Install LaTeX (no GUI)
We recommend TeX Live/MacTeX without a GUI editor and installing required packages for linguistics papers. Your template likely uses XeLaTeX and depends on packages such as `langsci-gb4e`, `graphicx`, `tabularx`, `biblatex` (with `biber`), `glossaries-extra`, `hyperref`, `cleveref`, and others listed below.

#### macOS (MacTeX/BasicTeX)
- BasicTeX (smaller, no GUI): https://mirror.ctan.org/systems/mac/mactex/BasicTeX.pkg
- Full MacTeX: https://tug.org/mactex/
- Install required tools and packages with `tlmgr`:

```
sudo tlmgr update --self
sudo tlmgr install latexmk xetex biber \
	datetime2 footmisc comment geometry fontspec \
	langsci-gb4e forest qtree tipa csquotes biblatex xparse \
	setspace enumitem ragged2e needspace placeins float longtable \
	tabularx array multirow makecell booktabs diagbox xcolor tcolorbox \
	caption glossaries-extra etoolbox ulem fancyhdr hyperref cleveref pdflscape
```

- Verify:

```
xelatex --version
biber --version
latexmk -v
```

#### Windows (TeX Live)
- Installer: https://tug.org/texlive/windows.html (choose a scheme without GUI editors)
- Open “TeX Live Command Prompt” and run:

```
tlmgr update --self
tlmgr install latexmk xetex biber \
	datetime2 footmisc comment geometry fontspec \
	langsci-gb4e forest qtree tipa csquotes biblatex xparse \
	setspace enumitem ragged2e needspace placeins float longtable \
	tabularx array multirow makecell booktabs diagbox xcolor tcolorbox \
	caption glossaries-extra etoolbox ulem fancyhdr hyperref cleveref pdflscape
```

- Verify:

```
xelatex --version
biber --version
latexmk -v
```

#### Linux
- Recommended: TeX Live (current) via Quick Install: https://tug.org/texlive/quickinstall.html
- Then install required packages:

```
tlmgr update --self
tlmgr install latexmk xetex biber \
	datetime2 footmisc comment geometry fontspec \
	langsci-gb4e forest qtree tipa csquotes biblatex xparse \
	setspace enumitem ragged2e needspace placeins float longtable \
	tabularx array multirow makecell booktabs diagbox xcolor tcolorbox \
	caption glossaries-extra etoolbox ulem fancyhdr hyperref cleveref pdflscape
```

- Alternative (distro packages; versions may be older):

Debian/Ubuntu
```
sudo apt update
sudo apt install -y texlive texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended texlive-xetex biber latexmk
```

Fedora
```
sudo dnf install -y texlive-scheme-medium texlive-biber latexmk
```

Arch
```
sudo pacman -S --needed texlive-most biber latexmk
```

If a package is reported missing during compile, install it via your package manager or `tlmgr`.

### Step 2 — Install Visual Studio Code and LaTeX extensions
- VS Code: https://code.visualstudio.com/
- LaTeX Workshop: https://marketplace.visualstudio.com/items?itemName=James-Yu.latex-workshop
- LaTeX Utilities: https://marketplace.visualstudio.com/items?itemName=tecosaur.latex-utilities

CLI install:
```
code --install-extension James-Yu.latex-workshop
code --install-extension tecosaur.latex-utilities
```

Tip (macOS): Command Palette → “Shell Command: Install 'code' command in PATH” to enable the `code` CLI.

To build with XeLaTeX in LaTeX Workshop: Command Palette → “LaTeX Workshop: Build with recipe” → choose “latexmk (xelatex)”. Ensure `latexmk` and `xelatex` are installed (Step 1).

### Step 3 — Install LingTeX from VSIX
- Download the latest VSIX: https://github.com/rulingAnts/LingTeX/releases/latest
- Install from VS Code: Extensions view → ••• → “Install from VSIX…” → pick the downloaded file.
- Or install via CLI:

```
code --install-extension /path/to/LingTeX-x.y.z.vsix
```

Troubleshooting: If VS Code reports an invalid VSIX, re-download from Releases. For bibliography, ensure `biber` is installed. For glossaries with `glossaries-extra`, prefer `\makenoidxglossaries` (as used in many templates).

## Sidebar Panel
- Access the LingTeX panel from the Activity Bar (left sidebar) using the LingTeX icon.
- The panel provides buttons for all features and simple forms for common options (e.g., TSV → Interlinear output mode, Excel export destination).
- Use the Quick Actions to open TSV templates or run conversions without the Command Palette.

## Commands
LingTeX now uses a panel-only UX. Commands are hidden from the Command Palette; launch actions from the LingTeX panel in the Activity Bar. Title bar actions (Generate/Cancel) appear contextually when using TSV templates.

## Requirements
- Visual Studio Code (required): download from https://code.visualstudio.com/
- Recommended: LaTeX Workshop, LaTeX Utilities

Tip (macOS): to use the `code` CLI for VSIX installs, run Command Palette → “Shell Command: Install 'code' command in PATH”.

## Extension Settings
- `lingtex.tables.outputDir`: Default output directory for generated LaTeX tables.
- `lingtex.excel.outputLocation`: Where to save Excel files (`downloads`, `documents`, `workspace`, or `prompt`). Defaults to `downloads`. Exports auto-open with the system Excel viewer.
- `lingtex.excel.filenameTemplate`: Template for Excel filenames. Supports `${basename}`, `${date}` (YYYYMMDD), `${time}` (HHmmss).

- `lingtex.figure.outputDir`: Default output directory for images imported as figures (e.g., `${workspaceFolder}/misc/figures`).
- `lingtex.tex.mainFile`: Path to the main `.tex` file. When set, imported image paths are computed relative to this file (e.g., `${workspaceFolder}/main.tex`).
- `lingtex.tex.mainPdf`: Path to your primary compiled PDF (e.g., `${workspaceFolder}/build/main.pdf`). Used by the panel and future features to open/reference the document.
- `lingtex.interlinear.openupGlossAmount`: Interlinear line spacing passed to `\openup` before gloss lines (e.g., `1em` or `6pt`). Spacing before/after the free translation is automatically set to 50% of this value.
 - `lingtex.ui.selectedFolderIndex`: Workspace-level index of the selected root folder for the LingTeX panel.

Panel tips:
- Use “Browse Tables Dir…” and “Browse Figures Dir…” to pick folders. Selected paths inside the repo are saved as `${workspaceFolder}/…` for portability.
 - Use “Browse Main TeX…” and “Browse Main PDF…” to pick your master `.tex` and compiled `.pdf`.

### Per-Folder Settings (Multi-root)
- Settings are scoped to the selected workspace folder. Use the Folder dropdown in the Settings panel to switch which folder you’re editing.
 - The selected root folder is remembered per workspace via `lingtex.ui.selectedFolderIndex`.
- When you browse for folders/files inside the selected workspace folder, LingTeX saves them as `${workspaceFolder}/…` to stay portable. Outside-of-repo picks are saved as absolute paths.
- Each root-level folder maintains its own `.vscode/settings.json`. Switching folders refreshes the panel to show that folder’s saved values.
- If the extension’s settings schema changes (e.g., after updates), reload the VS Code window so new scopes and defaults take effect.

## Development
- Run and debug via the provided launch configuration (Run Extension).
- Build with `npm run build`; watch with `npm run watch`.

## Image → LaTeX Figure

Use the LingTeX panel section “Image → LaTeX Figure” to import an image and insert a ready-to-compile LaTeX figure block.

### Setup
- Set “Figures output dir” (default: `${workspaceFolder}/misc/figures`).
- Set “Main TeX file” (optional). Paths in the inserted `\includegraphics{...}` are made relative to this file. This ensures correct paths when inserting into files included via `\input{...}`.
 - Optional: enter a Caption. Add any citations manually in your LaTeX source if needed.
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
