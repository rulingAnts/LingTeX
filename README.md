# LingTeX

LingTeX is a Visual Studio Code extension that adds linguistics authoring helpers for LaTeX. It is designed to complement LaTeX Workshop and LaTeX Utilities.

## Commands (initial stubs)
- LingTeX: Convert Excel → LaTeX tabularx
- LingTeX: Convert XLingPaper XML → Excel
- LingTeX: TSV → LaTeX tabularx
- LingTeX: TSV → Interlinear (gb4e)
- LingTeX: LaTeX tabularx → Excel
- LingTeX: Find Missing Glosses
- LingTeX: Sanitize Intro Sections
- LingTeX: Split Sections

These commands currently display confirmation messages. Next steps will port the existing TypeScript utilities into the extension to provide full functionality.

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
