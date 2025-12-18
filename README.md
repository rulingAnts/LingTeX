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

## Development
- Run and debug via the provided launch configuration (Run Extension).
- Build with `npm run build`; watch with `npm run watch`.

## License
This project is licensed under AGPL-3.0-only. See [LICENSE](LICENSE).
