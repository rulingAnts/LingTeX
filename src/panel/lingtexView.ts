/*
import * as vscode from 'vscode';

export class LingTeXViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'lingtex.panel';
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    webviewView.webview.options = {
      enableScripts: true,
    };
    const cfg = vscode.workspace.getConfiguration('lingtex');
    const state = {
      tables_outputDir: cfg.get<string>('tables.outputDir', '${workspaceFolder}/misc/tables'),
      excel_outputLocation: cfg.get<string>('excel.outputLocation', 'downloads'),
      excel_filenameTemplate: cfg.get<string>('excel.filenameTemplate', '${basename}-${date}-${time}'),
      interlinear_outputMode: cfg.get<string>('interlinear.outputMode', 'insert'),
    };
    webviewView.webview.html = this.getHtml(webviewView.webview, state);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      try {
        if (msg?.type === 'runCommand' && typeof msg.command === 'string') {
          await vscode.commands.executeCommand(msg.command);
          return;
        }
        if (msg?.type === 'generateInterlinear') {
          const { tsv, addLabel, label, latexMode } = msg as { tsv: string; addLabel: boolean; label?: string; latexMode: 'newList'|'listItem'|'snippet' };
          if (!tsv || typeof tsv !== 'string') {
            vscode.window.showErrorMessage('LingTeX: Please paste TSV input.');
            return;
          }
          const parsed = this.parseTSV(tsv);
          if (parsed.lines.length === 0) {
            vscode.window.showErrorMessage('LingTeX: No rows parsed from TSV. Ensure there is a header row and at least one data row.');
            return;
          }
          const body = this.buildGb4eBody(parsed.lines, parsed.headers);
          const lines: string[] = [];
          if (latexMode === 'newList') {
            lines.push('\\begin{exe}');
          }
          if (latexMode === 'listItem' || latexMode === 'newList') {
            lines.push('\\ex');
          }
          if (addLabel && label && label.trim()) {
            lines.push(`\\label{${this.latexEscape(label.trim())}}`);
          }
          </script>
        </body>
        import * as vscode from 'vscode';

        export class LingTeXViewProvider implements vscode.WebviewViewProvider {
          public static readonly viewId = 'lingtex.panel';
          constructor(private readonly context: vscode.ExtensionContext) {}

          resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
            webviewView.webview.options = { enableScripts: true };
            const cfg = vscode.workspace.getConfiguration('lingtex');
            const state = {
              tables_outputDir: cfg.get<string>('tables.outputDir', '${workspaceFolder}/misc/tables'),
              excel_outputLocation: cfg.get<string>('excel.outputLocation', 'downloads'),
              excel_filenameTemplate: cfg.get<string>('excel.filenameTemplate', '${basename}-${date}-${time}'),
            };
            webviewView.webview.html = this.getHtml(webviewView.webview, state);

            webviewView.webview.onDidReceiveMessage(async (msg) => {
              try {
                if (msg?.type === 'runCommand' && typeof msg.command === 'string') {
                  await vscode.commands.executeCommand(msg.command);
                  return;
                }
                if (msg?.type === 'generateInterlinear') {
                  const { tsv, addLabel, label, latexMode } = msg as { tsv: string; addLabel: boolean; label?: string; latexMode: 'newList'|'listItem'|'snippet' };
                  if (!tsv || typeof tsv !== 'string') { vscode.window.showErrorMessage('LingTeX: Please paste TSV input.'); return; }
                  const parsed = this.parseTSV(tsv);
                  if (parsed.lines.length === 0) { vscode.window.showErrorMessage('LingTeX: No rows parsed from TSV. Ensure there is a header row and at least one data row.'); return; }
                  const body = this.buildGb4eBody(parsed.lines, parsed.headers);
                  const out: string[] = [];
                  if (latexMode === 'newList') out.push('\\begin{exe}');
                  if (latexMode === 'newList' || latexMode === 'listItem') out.push('\\ex');
                  if (addLabel && label && label.trim()) out.push(`\\label{${this.latexEscape(label.trim())}}`);
                  out.push(...body);
                  if (latexMode === 'newList') out.push('\\end{exe}');
                  const text = out.join('\n') + '\n';
                  const editor = vscode.window.activeTextEditor;
                  if (editor) {
                    import * as vscode from 'vscode';

                    export class LingTeXViewProvider implements vscode.WebviewViewProvider {
                      public static readonly viewId = 'lingtex.panel';
                      constructor(private readonly context: vscode.ExtensionContext) {}

                      resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
                        webviewView.webview.options = { enableScripts: true };
                        const cfg = vscode.workspace.getConfiguration('lingtex');
                        const state = {
                          tables_outputDir: cfg.get<string>('tables.outputDir', '${workspaceFolder}/misc/tables'),
                          excel_outputLocation: cfg.get<string>('excel.outputLocation', 'downloads'),
                          excel_filenameTemplate: cfg.get<string>('excel.filenameTemplate', '${basename}-${date}-${time}'),
                        };
                        webviewView.webview.html = this.getHtml(webviewView.webview, state);

                        webviewView.webview.onDidReceiveMessage(async (msg) => {
                          try {
                            if (msg?.type === 'runCommand' && typeof msg.command === 'string') {
                              await vscode.commands.executeCommand(msg.command);
                              return;
                            }
                            if (msg?.type === 'generateInterlinear') {
                              const { tsv, addLabel, label, latexMode } = msg as { tsv: string; addLabel: boolean; label?: string; latexMode: 'newList'|'listItem'|'snippet' };
                              if (!tsv || typeof tsv !== 'string') { vscode.window.showErrorMessage('LingTeX: Please paste TSV input.'); return; }
                              const parsed = this.parseTSV(tsv);
                              if (parsed.lines.length === 0) { vscode.window.showErrorMessage('LingTeX: No rows parsed from TSV. Ensure there is a header row and at least one data row.'); return; }
                              const body = this.buildGb4eBody(parsed.lines, parsed.headers);
                              const out: string[] = [];
                              if (latexMode === 'newList') out.push('\\begin{exe}');
                              if (latexMode === 'newList' || latexMode === 'listItem') out.push('\\ex');
                              if (addLabel && label && label.trim()) out.push(`\\label{${this.latexEscape(label.trim())}}`);
                              out.push(...body);
                              if (latexMode === 'newList') out.push('\\end{exe}');
                              const text = out.join('\n') + '\n';
                              const editor = vscode.window.activeTextEditor;
                              if (editor) {
                                const pos = editor.selection.active;
                                await editor.edit(edit => edit.insert(pos, text));
                                const endPos = new vscode.Position(pos.line + text.split('\n').length - 1, (text.split('\n').pop() || '').length);
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

                        const html = `
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
                            <div class="group">
                              <h2>Quick Actions</h2>
                              <div class="cmds">
                                <button class="btn" data-cmd="lingtex.tsvToTabularx">TSV → LaTeX tabularx (open template)</button>
                                <button class="btn" data-cmd="lingtex.convertExcelToTabularx">Excel → LaTeX tabularx</button>
                                <button class="btn" data-cmd="lingtex.tabularxToExcel">LaTeX tabularx → Excel</button>
                                <button class="btn" data-cmd="lingtex.convertXLingPaperXmlToExcel">XLingPaper XML → Excel</button>
                                <button class="btn" data-cmd="lingtex.findMissingGlosses">Find Missing Glosses</button>
                                <button class="btn" data-cmd="lingtex.sanitizeIntro">Sanitize Intro Sections</button>
                                <button class="btn" data-cmd="lingtex.splitSections">Split Sections</button>
                              </div>
                            </div>

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
                                <textarea id="tsvInput" rows="10" style="width:100%; font-family: var(--vscode-editor-font-family, monospace);"></textarea>
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
                        return html;
                      }

                      private escapeAttr(v: string): string {
                        return (v ?? '').replace(/&/g,'&amp;').replace(/\"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                      }

                      private parseTSV(raw: string): { lines: string[][]; headers: string[] } {
                        const rows = raw.replace(/\r\n?/g, '\n').split(/\n/).filter(r => r.trim().length > 0);
                        if (rows.length === 0) return { lines: [], headers: [] };
                        const headers = rows[0].split('\t').map(h => h.trim().toLowerCase());
                        const lines = rows.slice(1).map(r => r.split('\t').map(c => c.trim())).filter(cols => cols.some(c => c.length > 0));
                        return { lines, headers };
                      }

                      private buildGb4eBody(lines: string[][], headers: string[]): string[] {
                        const idx = (names: string[]) => { for (const n of names) { const i = headers.indexOf(n); if (i !== -1) return i; } return -1; };
                        const iForm = idx(['form','line1','orth','tok']);
                        const iMorph = idx(['morph','seg','line2']);
                        const iGloss = idx(['gloss','line3']);
                        const iTrans = idx(['translation','trans']);
                        const joinCol = (i: number) => (i >= 0 ? lines.map(r => r[i]).join(' ') : '');
                        const L1 = joinCol(iForm), L2 = joinCol(iMorph), L3 = joinCol(iGloss);
                        const T = iTrans >= 0 ? lines.map(r => r[iTrans]).join(' ') : '';
                        const body: string[] = [];
                        if (L1 || L2 || L3) body.push('  \\gll ' + [L1, L2, L3].filter(s => s && s.length > 0).join(' \\ '));
                        if (T) body.push('  \\trans ' + this.latexEscape(T));
                        return body;
                      }

                      private latexEscape(s: string): string {
                        return s.replace(/\\/g, '\\textbackslash{}').replace(/([#%&_{}])/g, '{\\$1}').replace(/\^/g, '{\\textasciicircum}').replace(/~/g, '{\\textasciitilde}');
                      }
                    }

*/
