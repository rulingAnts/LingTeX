# Excel ↔ LaTeX Tables (tabularx/longtable)

## Goal
Roundtrip tables between LaTeX `tabularx`/`longtable` and Excel sheets with minimal loss, integrated into the LingTeX VS Code extension.

## Stack
- AST parser: `latex-utensils` (default, robust AST). Alternative: `unified-latex` (macro-extensible).
- Excel I/O: `xlsx` (SheetJS) for fast read/write. Alternative: `ExcelJS` if richer formatting needed.
- Temp edit: `tmp` to create temp `.xlsx`, `chokidar` to watch saves, OS opener via `child_process`.
- Optional bridges: `pandoc`, `latexml` invoked from Node for tricky LaTeX; not default.

## Data Model
- Table: `environment` (`tabularx|longtable`), `columns: ColumnSpec[]`, `rows: Row[]`, optional `caption`, `label`.
- ColumnSpec: `align` (`l|c|r|p|X`), optional `width` (for `p{}`/`X`), vertical borders.
- Row: array of `Cell`, optional row rule (`\hline`), header flag.
- Cell: `text` (token-aware), `colspan`, `rowspan` (warn: not native in `tabularx`), alignment override.
- Longtable meta: support `\endfirsthead`, `\endhead`, `\endfoot`, `\endlastfoot`.

## UX Flows
- LaTeX → Excel (“Edit Table Externally”)
  1. User selects a LaTeX table or cursor inside one.
  2. Parse AST → normalize table model.
  3. Write temp `.xlsx` → open in OS default app (macOS `open`, Linux `xdg-open`, Windows `start`).
  4. Watch file for saves → on save or user action, read workbook.
  5. Regenerate LaTeX → replace original selection → cleanup temp file.
- Excel → LaTeX (“Import Sheet as Table”)
  1. Choose workbook + sheet.
  2. Read rows → infer alignment/header rows.
  3. Emit `tabularx` or `longtable`; insert at cursor.
- TSV/CSV bridge
  - Allow export/import via TSV using existing helpers for simpler flows.

## Temp Edit Details
- Create: `tmp.file({ postfix: '.xlsx' })`, write with `xlsx` (`XLSX.utils.aoa_to_sheet`).
- Open:
  - macOS: `open <path>`
  - Linux: `xdg-open <path>`
  - Windows: `start "" <path>`
- Watch: `chokidar.watch(path, { awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 } })` with debounce.
- Import: read workbook, map merged cells → `\multicolumn`, maintain header rows; prompt for `longtable` header/footer when applicable.
- Cleanup: remove temp on success or after explicit confirmation; detect unsaved edits and prompt.

## Implementation Phases
- P1 Parse LaTeX
  - Use `latex-utensils` to find `tabularx|longtable` environments; parse column spec string; tokenize rows (`&`, `\\`), detect `\multicolumn{n}{align}{content}`, `\hline`, longtable headers/footers.
- P2 Write Excel
  - Convert table model to AOA; set merges for `colspan`; optional header styling (bold) for first N rows; sheet name from caption/label or default.
- P3 Read Excel
  - Read workbook; convert rows to model; translate merges back to `\multicolumn`; ask user to mark header rows; map alignments via config or heuristics (numbers→`r`, text→`l`, mixed→`c`).
- P4 Emit LaTeX
  - Stringify to `tabularx` or `longtable`; preserve column specs, `\caption`/`\label`; emit `\hline` for row rules; avoid altering math or macros inside cells.
- P5 VS Code UI
  - Commands: “Edit Table Externally”, “Import Excel as Table”, “Export Table to Excel”.
  - QuickPick: choose sheet/workbook, set header rows count; progress notifications and error messages.
- P6 Temp Edit Flow
  - Settings for auto-import on save vs manual import; debounce; cleanup options.

## Edge Cases
- Multicolumn/Rowspan: handle Excel merges → `\multicolumn`; `rowspan` is unsupported in `tabularx` (consider `multirow` package or split rows); emit warnings.
- Math and macros: keep `$...$`, `\text{}`, `\emph{}`; avoid escaping beyond necessary; treat cell text as raw LaTeX tokens.
- Longtable: preserve header/footer blocks; allow user designation of header rows on import.
- Widths: map approximate Excel column widths to `p{}` or `X`; exact width fidelity isn’t guaranteed.
- Unicode: prefer XeLaTeX; optional pdflatex-safe conversion later (tipa) as separate feature.

## Testing
- Unit tests: parse/emit for `tabularx` and `longtable`; `\multicolumn` roundtrip; special characters; header/footer preservation.
- Workbook fixtures: sample sheets with merges and header rows to validate roundtrip.
- Samples: extend test-workspaces/sample-tex/main.tex with representative tables.

## Integration Points
- Feature modules: expand src/features/tabularxToExcel.ts and src/features/convertExcelToTabularx.ts.
- Command wiring: src/features/index.ts.
- Panel/UX: src/panel/lingtexView.ts.

## Settings
- Default environment: `tabularx` or `longtable`.
- Auto-import on save: on/off; debounce ms.
- External open: on/off.
- Header rows: numeric.
- Column spec mode: infer vs template.

## Open Questions
- Rowspan strategy (multirow vs splitting).
- Width mapping heuristics from Excel.
- Formatting preservation (bold/italic → LaTeX commands).
- Large sheet handling (streaming vs in-memory).

## Next Steps (later)
- Add deps and scaffold command handlers.
- Prototype LaTeX → Excel for `tabularx` with `\multicolumn`.
- Implement Excel → LaTeX and temp-edit flow.
- Add tests and sample assets.

## Optional Install (when building)
```bash
npm i latex-utensils xlsx chokidar tmp
# Alternatives if needed:
# npm i unified-latex
# npm i exceljs
```
