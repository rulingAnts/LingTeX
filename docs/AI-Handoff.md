# LingTeX AI Handoff

Date: 2025-12-18
Repo: rulingAnts/fayu-grammar (branch: main)
OS: macOS

## Summary
LingTeX is a VS Code extension to assist authoring linguistics papers in LaTeX, working alongside LaTeX Workshop and LaTeX Utilities. We scaffolded an extension with command stubs and prepared TypeScript utilities and tasks for integration.

## Key Decisions & Changes
- TypeScript/ESM setup for scripts:
  - Default import for `exceljs` in ESM (`import ExcelJS from 'exceljs'`).
  - Replaced vulnerable `xmldom` with `@xmldom/xmldom` and sanitized input before parsing (remove BOM and leading noise).
  - Added ESM-safe `__dirname` via `fileURLToPath(import.meta.url)` where needed.
- Updated `package.json` (root) dependencies:
  - `exceljs`: ^4.4.0
  - `@xmldom/xmldom`: ^0.9.0
- TS scripts discovered in `scripts/` and their purpose:
  - `find_missing_glosses.ts`: scan `.tex` for uppercase gloss tokens not in macros; cross-check `misc/abbreviations.tex`.
  - `convert_excel_to_tabularx.ts`: `.xlsx` → LaTeX `tabularx` (merges, bold/italic, shading, headers).
  - `convert_xlingpaper_xml_to_excel.ts`: XLingPaper-like XML `<table>` → Excel workbook.
  - `tsv_to_tabularx.ts`: TSV → LaTeX `tabularx`, with editor workflow.
  - `tsv_to_interlinear.ts`: TSV tiers → gb4e interlinear (`\gll`, `\glll`, etc.).
  - `tabularx_to_excel.ts`: LaTeX `tabularx` → Excel workbook.
- VS Code tasks wired (root `.vscode/tasks.json`):
  - TS tasks for find/sanitize/split and new TS tasks for converters (batch and interactive). Prompt inputs added for file-based runs.

## Extension Scaffold
Location: `LingTeX/`
- Manifest: `LingTeX/package.json`
  - Extension ID: `rulingAnts.lingtex`, displayName: LingTeX
  - Commands contributed:
    - `lingtex.convertExcelToTabularx`
    - `lingtex.convertXLingPaperXmlToExcel`
    - `lingtex.tsvToTabularx`
    - `lingtex.tsvToInterlinear`
    - `lingtex.tabularxToExcel`
    - `lingtex.findMissingGlosses`
    - `lingtex.sanitizeIntro`
    - `lingtex.splitSections`
  - Dependencies: `exceljs`, `@xmldom/xmldom`
- Code: `LingTeX/src/extension.ts` registers stubs (info messages)
- Build: `LingTeX/tsconfig.json` (ES2020, commonjs, outDir `dist`)
- Debug: `LingTeX/.vscode/launch.json` (Run Extension)
- Docs: `LingTeX/README.md`, `LingTeX/CHANGELOG.md`

## Next Implementation Steps
1. TSV → Interlinear
   - Port logic from `scripts/tsv_to_interlinear.ts` into a command.
   - UI: quick-pick for `--open-editor` or `--input-file`, prompt for output path.
   - Output: write `.tex` content to workspace (use `lingtex.tables.outputDir`).
2. Excel → LaTeX tabularx
   - Port `convert_excel_to_tabularx.ts`; add file picker and output dir setting.
   - Handle merged cells, bold/italic, header shading.
3. XLingPaper XML → Excel
   - Port `convert_xlingpaper_xml_to_excel.ts` with input sanitation.
   - Save workbook next to source or to chosen folder.
4. LaTeX tabularx → Excel
   - Port `tabularx_to_excel.ts`; select `.tex` and output `.xlsx`.
5. Find Missing Glosses
   - Run scan and present results in an output channel or diagnostics.
6. Sanitize Intro & Split Sections
   - Port utilities; add configuration for source/target folders.

## Testing & Validation
- Use extension debug to run commands; verify outputs on sample files.
- Keep `exceljs` and `@xmldom/xmldom` up to date; run `npm audit` periodically.

## Build/Run
- Build: `npm run build` in `LingTeX/`
- Debug: VS Code Run config "Run Extension"
- Commands: invoke any "LingTeX:" command from the Command Palette.

## Integration Targets
- Coordinate with LaTeX Workshop tasks/commands for smoother workflows.
- Honor `lingtex.tables.outputDir` setting and add more settings as features grow.

## Notes
- Root TS scripts are already validated under ESM/ts-node.
- Some tasks depend on sample data under `sample/pa_exports`.
