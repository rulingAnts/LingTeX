import * as vscode from 'vscode';

export class LingTeXViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'lingtex.panel';
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = { enableScripts: true };
    const cfg = vscode.workspace.getConfiguration('lingtex');
    const state = {
      tables_outputDir: cfg.get<string>('tables.outputDir', '${workspaceFolder}/misc/tables'),
      excel_outputLocation: cfg.get<string>('excel.outputLocation', 'downloads'),
      excel_filenameTemplate: cfg.get<string>('excel.filenameTemplate', '${basename}-${date}-${time}')
    };
    webviewView.webview.html = this.getHtml(webviewView.webview, state);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      try {
        if (msg?.type === 'runCommand' && typeof msg.command === 'string') {
          await vscode.commands.executeCommand(msg.command);
          return;
        }
        if (msg?.type === 'generateInterlinear') {
          const { tsv, addLabel, label } = msg as { tsv: string; addLabel: boolean; label?: string; latexMode?: string };
          if (!tsv || typeof tsv !== 'string') { vscode.window.showErrorMessage('LingTeX: Please paste TSV input.'); return; }
          const examples = this.parseExamples(tsv);
          if (examples.length === 0) { vscode.window.showErrorMessage('LingTeX: No examples found. Use tier-style TSV (e.g., Morphemes / Lex. Gloss / Word Gloss / Free).'); return; }

          // Choose option via Quick Pick depending on single vs multi
          let choice: string | undefined;
          if (examples.length === 1) {
            const picks = [
              { label: 'Snippet (single interlinear example)', value: 'single-snippet' },
              { label: 'New list example (this as first item)', value: 'single-list-starter' },
              { label: 'Add to existing list (one item)', value: 'single-list-item' },
            ];
            const sel = await vscode.window.showQuickPick(picks, { placeHolder: 'Select interlinear output for single example' });
            choice = sel?.value;
            if (!choice) return;
          } else {
            const picks = [
              { label: 'New list example (sub-examples a, b, c, …)', value: 'multi-new-list' },
              { label: 'Add to existing list (items only)', value: 'multi-list-items' },
              { label: 'Interlinear text (sequence of numbered examples)', value: 'multi-text' },
            ];
            const sel = await vscode.window.showQuickPick(picks, { placeHolder: `Detected ${examples.length} examples. Choose output.` });
            choice = sel?.value;
            if (!choice) return;
          }

          let output = '';
          if (examples.length === 1) {
            const ex = examples[0];
            if (choice === 'single-snippet') output = this.asSingleExample(ex);
            else if (choice === 'single-list-starter') output = this.asListStarter(ex);
            else if (choice === 'single-list-item') output = this.asListItem(ex);
          } else {
            if (choice === 'multi-new-list') output = this.asListOfExamples(examples);
            else if (choice === 'multi-list-items') output = this.asItemsForExistingList(examples);
            else if (choice === 'multi-text') output = this.asInterlinearText(examples);
          }
          if (!output) return;

          // Apply label if requested: activate placeholders and inject provided key
          if (addLabel && label && label.trim()) {
            const safe = this.latexEscape(label.trim());
            output = output.replace(/% \\label\{ex:KEY([^}]*)\}/g, (_m, suff) => `\\label{${safe}${suff || ''}}`);
          }

          const text = output + '\n';
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            const pos = editor.selection.active;
            await editor.edit(edit => edit.insert(pos, text));
            const lines = text.split('\n');
            const endPos = new vscode.Position(pos.line + lines.length - 1, (lines[lines.length - 1] || '').length);
            editor.selection = new vscode.Selection(endPos, endPos);
            vscode.window.showInformationMessage('LingTeX: Inserted interlinear at cursor.');
          } else {
            await vscode.env.clipboard.writeText(text);
            vscode.window.showInformationMessage('LingTeX: No editor active. Copied interlinear to clipboard.');
          }
          return;
        }
        if (msg?.type === 'updateSetting' && typeof msg.key === 'string') {
          const key = String(msg.key);
          const value = msg.value;
          const cfgRoot = vscode.workspace.getConfiguration('lingtex');
          if (key.startsWith('lingtex.')) {
            const sub = key.split('.').slice(1).join('.');
            await cfgRoot.update(sub, value, vscode.ConfigurationTarget.Workspace);
          } else {
            await cfgRoot.update(key, value, vscode.ConfigurationTarget.Workspace);
          }
          vscode.window.showInformationMessage('LingTeX: Settings updated');
          return;
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`LingTeX Panel error: ${err?.message ?? String(err)}`);
      }
    });
  }

  private getHtml(webview: vscode.Webview, state: any): string {
    const style = `
      :root { color-scheme: light dark; }
      body { font-family: var(--vscode-font-family); padding: 8px; }
      h2 { font-size: 14px; margin: 12px 0 6px; }
      button { margin: 2px 0; }
      .group { border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 8px; margin-bottom: 8px; }
      .row { display: flex; gap: 6px; align-items: center; margin: 4px 0; }
      input[type="text"], select { width: 100%; }
      details { margin: 4px 0; }
      summary { cursor: pointer; }
      .btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 8px; border-radius: 4px; }
      .btn:hover { background: var(--vscode-button-hoverBackground); }
      .cmds { display: grid; grid-template-columns: 1fr; gap: 4px; }
      .help { color: var(--vscode-descriptionForeground); font-size: 12px; }
    `;

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'unsafe-inline' ${webview.cspSource};" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>LingTeX</title>
        <style>${style}</style>
      </head>
      <body>

        <details open>
          <summary><strong>TSV → Interlinear</strong></summary>
          <div class="help" style="margin:4px 0 8px;">
            Paste TSV below, choose options, and click Generate. Place the text cursor where you want the LaTeX inserted (especially for adding an item to an existing list). If the code is inserted in the wrong place, your document may fail to compile.
          </div>
          <div class="row">
            <label style="min-width:130px;">LaTeX output:</label>
            <select id="latexMode">
              <option value="newList">New list (begin/end exe)</option>
              <option value="listItem">List item (\\ex only)</option>
              <option value="snippet">Snippet only (no list)</option>
            </select>
          </div>
          <div class="row">
            <input type="checkbox" id="addLabel" />
            <label for="addLabel">Add label</label>
            <input type="text" id="labelInput" placeholder="ex: ex:my-example" disabled />
          </div>
          <div class="row" style="flex-direction:column; align-items:stretch;">
            <textarea id="tsvInput" rows="12" style="width:100%; font-family: var(--vscode-editor-font-family, monospace);"></textarea>
          </div>
          <div class="row">
            <button class="btn" id="btnGenerateInterlinear">Generate and Insert</button>
          </div>
        </details>

        <details>
          <summary><strong>TSV → LaTeX tabularx</strong></summary>
          <div class="row"><button class="btn" data-cmd="lingtex.tsvToTabularx">Open Template</button></div>
        </details>

        <details>
          <summary><strong>Excel / XLingPaper</strong></summary>
          <div class="row"><button class="btn" data-cmd="lingtex.convertExcelToTabularx">Excel → LaTeX tabularx</button></div>
          <div class="row"><button class="btn" data-cmd="lingtex.tabularxToExcel">LaTeX tabularx → Excel</button></div>
          <div class="row"><button class="btn" data-cmd="lingtex.convertXLingPaperXmlToExcel">XLingPaper XML → Excel</button></div>
        </details>

        <details>
          <summary><strong>Document Tools</strong></summary>
          <div class="row"><button class="btn" data-cmd="lingtex.findMissingGlosses">Find Missing Glosses</button></div>
          <div class="row"><button class="btn" data-cmd="lingtex.sanitizeIntro">Sanitize Intro Sections</button></div>
          <div class="row"><button class="btn" data-cmd="lingtex.splitSections">Split Sections</button></div>
        </details>

        <details>
          <summary><strong>Settings</strong></summary>
          <div class="row">
            <label style="min-width:130px;">Tables output dir:</label>
            <input type="text" id="tables_outputDir" value="${this.escapeAttr(state.tables_outputDir)}" />
          </div>
          <div class="row">
            <label style="min-width:130px;">Excel output location:</label>
            <select id="excel_outputLocation">
              ${['downloads','documents','workspace','prompt'].map((v:string)=>`<option value="${v}" ${state.excel_outputLocation===v?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="row">
            <label style="min-width:130px;">Excel filename template:</label>
            <input type="text" id="excel_filenameTemplate" value="${this.escapeAttr(state.excel_filenameTemplate)}" />
          </div>
          <div class="row">
            <button class="btn" data-save="tables_outputDir">Save Tables Dir</button>
            <button class="btn" data-save="excel_outputLocation">Save Excel Location</button>
            <button class="btn" data-save="excel_filenameTemplate">Save Excel Template</button>
          </div>
        </details>

        <script>
          const vscode = acquireVsCodeApi();
          document.querySelectorAll('[data-cmd]').forEach(btn => {
            btn.addEventListener('click', () => {
              const command = btn.getAttribute('data-cmd');
              vscode.postMessage({ type: 'runCommand', command });
            });
          });
          const addLabel = document.getElementById('addLabel');
          const labelInput = document.getElementById('labelInput');
          addLabel.addEventListener('change', () => {
            labelInput.disabled = !addLabel.checked;
            if (!addLabel.checked) labelInput.value = '';
          });
          document.getElementById('btnGenerateInterlinear').addEventListener('click', () => {
            const tsv = (document.getElementById('tsvInput').value || '').trim();
            const latexMode = (document.getElementById('latexMode').value || 'newList');
            const wantLabel = !!(document.getElementById('addLabel').checked);
            const label = document.getElementById('labelInput').value || '';
            vscode.postMessage({ type: 'generateInterlinear', tsv, addLabel: wantLabel, label, latexMode });
          });
          document.querySelectorAll('[data-save]').forEach(btn => {
            btn.addEventListener('click', () => {
              const key = btn.getAttribute('data-save');
              const el = document.getElementById(key);
              const value = el && (el.value ?? el.textContent);
              let configKey = key;
              if (key === 'tables_outputDir') configKey = 'lingtex.tables.outputDir';
              if (key === 'excel_outputLocation') configKey = 'lingtex.excel.outputLocation';
              if (key === 'excel_filenameTemplate') configKey = 'lingtex.excel.filenameTemplate';
              vscode.postMessage({ type: 'updateSetting', key: configKey, value });
            });
          });
        </script>
      </body>
      </html>
    `;
  }

  private escapeAttr(v: string): string {
    return (v ?? '').replace(/&/g,'&amp;').replace(/\"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ===== Robust tier-style TSV parser/rendering (aligned with samples/tsv_to_interlinear.ts) =====
  private stripInvisible(s: string): string { return s.replace(/[\u200E\u200F\u202A-\u202E]/g, ''); }
  private tokenizeTSVLine(line: string): string[] {
    const normalizeCell = (s: string): string => {
      const cleaned = this.stripInvisible(s).replace(/\u00A0/g, ' ').trim();
      if (!cleaned) return '~';
      return cleaned.replace(/ /g, '~');
    };
    return line.split('\t').map(normalizeCell);
  }
  private parseExamples(tsvRaw: string): Array<{ number?: string; tiers: Record<string, string[]>; tierOrder: string[]; freeTranslations: { lang?: string; text: string }[] } > {
    const lines = tsvRaw.split(/\r?\n/).map((l) => l.replace(/\u00A0/g, ' ').trimEnd());
    const filtered = lines.filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
    const examples: Array<{ number?: string; tiers: Record<string, string[]>; tierOrder: string[]; freeTranslations: { lang?: string; text: string }[] }> = [];
    let current: any = null;
    const pushCurrent = () => { if (current && Object.keys(current.tiers).length > 0) examples.push(current); current = null; };
    for (const raw of filtered) {
      const line = this.stripInvisible(raw).trim();
      if (!line) { pushCurrent(); continue; }
      const cols = this.tokenizeTSVLine(line);
      if (cols.length === 0) continue;
      const first = (cols[0] || '').toLowerCase();
      if (first.startsWith('free')) {
        if (!current) current = { tiers: {}, tierOrder: [], freeTranslations: [] };
        const lang = cols[0].slice(4).replace(/~/g, ' ').trim() || undefined;
        // Preserve spaces in free translation using original raw line
        let text = '';
        const tabPos = raw.indexOf('\t');
        if (tabPos >= 0) text = this.stripInvisible(raw.slice(tabPos + 1)).replace(/\u00A0/g, ' ').trim();
        else text = this.stripInvisible(raw.replace(/^\s*free\b.*?[:\-\s]+/i, '')).replace(/\u00A0/g, ' ').trim();
        current.freeTranslations.push({ lang, text });
        pushCurrent();
        continue;
      }
      const startsWithNumber = /^\d+$/.test(cols[0]);
      let tierName: string; let values: string[];
      if (startsWithNumber) { tierName = cols[1] || 'Morphemes'; values = cols.slice(2); if (!current) current = { number: cols[0], tiers: {}, tierOrder: [], freeTranslations: [] }; }
      else { tierName = cols[0] || 'Morphemes'; values = cols.slice(1); if (!current) current = { tiers: {}, tierOrder: [], freeTranslations: [] }; }
      current.tiers[tierName] = values; if (!current.tierOrder.includes(tierName)) current.tierOrder.push(tierName);
    }
    pushCurrent();
    return examples;
  }
  private getMaxAligned(): number { const n = vscode.workspace.getConfiguration('lingtex').get<number>('interlinear.maxLines', 5) ?? 5; return Math.max(2, n); }
  private gatherAlignedLines(ex: { tiers: Record<string,string[]>; tierOrder: string[] }): string[] {
    const normalize = (name: string) => (name || '').toLowerCase();
    const canonical = ['word','morphemes','lex. gloss','word gloss','word cat.','pos'];
    const ordered: string[] = []; const seen = new Set<string>();
    for (const c of canonical) { const match = ex.tierOrder.find(t => normalize(t) === c); if (match && !seen.has(normalize(match))) { ordered.push(match); seen.add(normalize(match)); } }
    for (const t of ex.tierOrder) { const lower = normalize(t); if (lower.startsWith('free')) continue; if (seen.has(lower)) continue; ordered.push(t); seen.add(lower); }
    const lines: string[] = [];
    for (const t of ordered) {
      const toks = ex.tiers[t] || [];
      if (!toks.some(v => (v ?? '').toString().trim().length > 0)) continue;
      // Join tab-separated tokens with spaces; intra-token spaces were converted to '~'.
      lines.push(toks.join(' '));
    }
    return lines;
  }
  private renderGLLLines(ex: { tiers: Record<string,string[]>; tierOrder: string[] }): { gCmd: string; lines: string[] } {
    const lines = this.gatherAlignedLines(ex); const n = lines.length; const count = Math.max(2, Math.min(n, this.getMaxAligned()));
    const gCmd = 'g' + 'l'.repeat(count); return { gCmd, lines: lines.slice(0, count) };
  }
  private renderGlt(ex: { freeTranslations: { lang?: string; text: string }[] }): string | null {
    if (!ex.freeTranslations.length) return null;
    const joined = ex.freeTranslations.map(f => f.text).filter(Boolean).join(' ');
    return joined || null;
  }
  private renderExampleN(ex: { tiers: Record<string,string[]>; tierOrder: string[]; freeTranslations: { lang?: string; text: string }[] }): string {
    const { gCmd, lines } = this.renderGLLLines(ex); const glt = this.renderGlt(ex);
    if (!lines.length) { const transOnly = glt ? `\\glt ${this.latexEscape(glt)}` : ''; return transOnly || '% (no aligned interlinear lines)'; }
    const head = `\\${gCmd} ${this.latexEscape(lines[0])} \\\\`; const rest = lines.slice(1).map(ln => `${this.latexEscape(ln)} \\\\`).join('\n');
    const gllBlock = [head, rest].filter(Boolean).join('\n'); const trans = glt ? `\\glt ${this.latexEscape(glt)}` : '';
    return [gllBlock.trimEnd(), trans].filter(Boolean).join('\n');
  }
  private asSingleExample(ex: any): string { return ['\n% Single example','\n\\begin{exe}','\\ex % \\label{ex:KEY}', this.renderExampleN(ex),'\\end{exe}\n'].join('\n'); }
  private asListStarter(first: any): string { return ['\n% Start a list example with this as (a).','\n\\begin{exe}','\\ex % \\label{ex:KEY}','\\begin{xlist}','\\ex % \\label{ex:KEY-a}', this.renderExampleN(first),'% Add more items as needed...','\\end{xlist}','\\end{exe}\n'].join('\n'); }
  private asListItem(ex: any): string { return ['\n% List item to add inside an existing xlist','\\ex % \\label{ex:KEY-?}', this.renderExampleN(ex), ''].join('\n'); }
  private asItemsForExistingList(exs: any[]): string { return exs.map((e,i)=>['\\ex % \\label{ex:KEY-'+String(i+1)+'}', this.renderExampleN(e)].join('\n')).join('\n'); }
  private asListOfExamples(exs: any[]): string { const letters = 'abcdefghijklmnopqrstuvwxyz'.split(''); const items = exs.map((e,i)=>['\\ex % \\label{ex:KEY-'+(letters[i]||String(i+1))+'}', this.renderExampleN(e)].join('\n')).join('\n'); return ['\n% List example (numbered subexamples a, b, c, ...)','\n\\begin{exe}','\\ex % \\label{ex:KEY}','\\begin{xlist}',items,'\\end{xlist}','\\end{exe}\n'].join('\n'); }
  private asInterlinearText(exs: any[]): string { const items = exs.map((e,i)=>['\\ex % \\label{ex:KEY-'+String(i+1)+'}', this.renderExampleN(e)].join('\n')).join('\n'); return ['\n% Interlinear text (sequence of numbered examples)','\n\\begin{exe}',items,'\\end{exe}\n'].join('\n'); }

  private latexEscape(s: string): string {
    // Preserve '~' so it remains a non-breaking space in LaTeX interlinear output.
    return s
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/([#%&_{}])/g, '{\\$1}')
      .replace(/\^/g, '{\\textasciicircum}');
  }
}
