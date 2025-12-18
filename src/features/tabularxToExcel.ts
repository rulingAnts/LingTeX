import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import ExcelJS from 'exceljs';

export function registerTabularxToExcelCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('lingtex.tabularxToExcel', async () => {
    const input = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'LaTeX': ['tex'], 'All Files': ['*'] }
    });
    if (!input || input.length === 0) { return; }
    const inputPath = input[0].fsPath;

    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'LingTeX: LaTeX tabularx → Excel', cancellable: false }, async (progress) => {
      progress.report({ message: 'Parsing LaTeX…' });
      const raw = await fs.readFile(inputPath, 'utf8');
      const parsed = parseTabularx(raw);

      progress.report({ message: 'Building workbook…' });
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Table');
      for (const r of parsed.rows) {
        ws.addRow(r);
      }
      for (const m of parsed.merges) {
        ws.mergeCells(m.row, m.start, m.row, m.end);
      }
      const widths: number[] = [];
      for (const r of parsed.rows) {
        r.forEach((cell, i) => {
          const len = Math.max(1, cell.length);
          widths[i] = Math.max(widths[i] || 8, Math.min(60, Math.ceil(len * 0.9)));
        });
      }
      ws.columns = widths.map(w => ({ width: w } as any));

      const outDir = await resolveExcelOutputDir();
      await fs.mkdir(outDir, { recursive: true });
      const outName = applyFilenameTemplate(path.basename(inputPath, path.extname(inputPath)), 'xlsx');
      const outPath = path.join(outDir, outName);

      await wb.xlsx.writeFile(outPath);
      vscode.window.showInformationMessage(`LingTeX: Wrote Excel to ${outPath}`);
      await vscode.env.openExternal(vscode.Uri.file(outPath));
    });
  });
  context.subscriptions.push(disposable);
}

function parseTabularx(src: string): { rows: string[][]; merges: Array<{ row: number; start: number; end: number }> } {
  const envMatch = src.match(/\\begin{tabularx}[\s\S]*?\\end{tabularx}/) || src.match(/\\begin{tabular}[\s\S]*?\\end{tabular}/);
  const body = envMatch ? envMatch[0] : src;
  const lines = body
    .split(/\\\\\s*(?:\n|$)/)
    .map(line => line.replace(/^\s*%.*$/mg, ''))
    .map(line => line.trim())
    .filter(line => line.length > 0 && !/^\\(begin|end)/.test(line));
  const rows: string[][] = [];
  const merges: Array<{ row: number; start: number; end: number }> = [];
  let rowIdx = 1;
  for (const line of lines) {
    const cells = splitTopLevel(line, '&');
    const row: string[] = [];
    let col = 1;
    for (const rawCell of cells) {
      const cell = rawCell.trim();
      const m = cell.match(/^\\multicolumn\{(\d+)\}\{[^}]*\}\{([\s\S]*)\}\s*$/);
      if (m) {
        const span = parseInt(m[1], 10) || 1;
        const text = unescapeLatex(m[2].trim());
        row.push(text);
        if (span > 1) {
          merges.push({ row: rowIdx, start: col, end: col + span - 1 });
          for (let k = 1; k < span; k++) row.push('');
          col += span;
        } else {
          col += 1;
        }
      } else {
        row.push(unescapeLatex(cell));
        col += 1;
      }
    }
    rows.push(row);
    rowIdx += 1;
  }
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  rows.forEach(r => { while (r.length < maxCols) r.push(''); });
  return { rows, merges };
}

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      out.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  out.push(buf);
  return out;
}

function unescapeLatex(s: string): string {
  // Minimal: strip braces and unescape common macros
  return s
    .replace(/\\textbackslash\{\}/g, '\\')
    .replace(/\{\\([#%&_{}])\}/g, '$1')
    .replace(/\{\\textasciicircum\}/g, '^')
    .replace(/\{\\textasciitilde\}/g, '~')
    .replace(/[{}]/g, '')
    .replace(/^\\hline$/, '')
    .trim();
}

async function resolveExcelOutputDir(): Promise<string> {
  const cfg = vscode.workspace.getConfiguration('lingtex');
  const pref = cfg.get<string>('excel.outputLocation', 'downloads');
  const home = os.homedir();
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (pref === 'documents') return path.join(home, 'Documents');
  if (pref === 'workspace' && ws) return ws.uri.fsPath;
  if (pref === 'prompt') {
    const folder = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
    if (folder && folder[0]) return folder[0].fsPath;
  }
  return path.join(home, 'Downloads');
}

function applyFilenameTemplate(basename: string, ext: string): string {
  const cfg = vscode.workspace.getConfiguration('lingtex');
  const tmpl = cfg.get<string>('excel.filenameTemplate', '${basename}-${date}-${time}');
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const name = tmpl
    .replace(/\$\{basename\}/g, basename)
    .replace(/\$\{date\}/g, date)
    .replace(/\$\{time\}/g, time);
  return `${name}.${ext}`;
}
