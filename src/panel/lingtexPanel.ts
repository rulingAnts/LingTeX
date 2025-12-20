import * as vscode from 'vscode';
import * as path from 'path';

export class LingTeXViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'lingtex.panel';
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = { enableScripts: true };
    const cfg = vscode.workspace.getConfiguration('lingtex');
    const state = {
      tables_outputDir: cfg.get<string>('tables.outputDir', '${workspaceFolder}/misc/tables'),
      excel_outputLocation: cfg.get<string>('excel.outputLocation', 'downloads'),
      excel_filenameTemplate: cfg.get<string>('excel.filenameTemplate', '${basename}-${date}-${time}'),
      inter_beforeSkip: cfg.get<string>('interlinear.beforeSkip', 'smallskip'),
      inter_afterSkip: cfg.get<string>('interlinear.afterSkip', 'medskip'),
      inter_useOpenup: cfg.get<boolean>('interlinear.useOpenup', true),
      inter_openupGlossAmount: cfg.get<string>('interlinear.openupGlossAmount', '1em'),
      inter_openupBeforeTranslationAmount: cfg.get<string>('interlinear.openupBeforeTranslationAmount', '-0.5em'),
      inter_openupAfterTranslationAmount: cfg.get<string>('interlinear.openupAfterTranslationAmount', '-0.5em')
      ,figure_outputDir: cfg.get<string>('figure.outputDir', '${workspaceFolder}/misc/figures')
      ,tex_mainFile: cfg.get<string>('tex.mainFile', '')
    };
    webviewView.webview.html = this.getHtml(webviewView.webview, state);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      try {
        if (msg?.type === 'runCommand' && typeof msg.command === 'string') {
          await vscode.commands.executeCommand(msg.command);
          return;
        }
        if (msg?.type === 'importImageFigure') {
          // Resolve output directory from message or config
          const cfg = vscode.workspace.getConfiguration('lingtex');
          let outDir = String(msg.outputDir || cfg.get<string>('figure.outputDir', '${workspaceFolder}/misc/figures') || '').trim();
          const wf = vscode.workspace.workspaceFolders?.[0];
          const rootFsPath = wf?.uri.fsPath || '';
          if (!outDir) { vscode.window.showErrorMessage('LingTeX: Please set a figures output directory.'); return; }
          if (outDir.startsWith('${workspaceFolder}')) outDir = path.join(rootFsPath, outDir.replace('${workspaceFolder}', ''));
          else if (!path.isAbsolute(outDir) && rootFsPath) outDir = path.join(rootFsPath, outDir);
          try { await vscode.workspace.fs.createDirectory(vscode.Uri.file(outDir)); } catch {}

          const picks = await vscode.window.showOpenDialog({
            canSelectMany: false,
            title: 'Select image to import as LaTeX figure',
            filters: { Images: ['png','jpg','jpeg','svg','pdf'] }
          });
          if (!picks || !picks.length) return;
          const src = picks[0];
          const ext = path.extname(src.fsPath).toLowerCase();
          const baseRaw = path.basename(src.fsPath, ext);
          const sanitize = (s: string) => s.split('').map(ch => /[a-z0-9]/i.test(ch) ? ch.toLowerCase() : '-').join('').replace(/-+/g, '-').replace(/^-|-$/g, '');
          let base = sanitize(baseRaw) || 'figure';
          let dest = vscode.Uri.file(path.join(outDir, base + ext));
          // Avoid overwriting existing files by appending numeric suffix
          let counter = 1;
          while (true) {
            try { await vscode.workspace.fs.stat(dest); dest = vscode.Uri.file(path.join(outDir, `${base}-${counter}${ext}`)); counter++; }
            catch { break; }
          }
          const data = await vscode.workspace.fs.readFile(src);
          await vscode.workspace.fs.writeFile(dest, data);

          const editor = vscode.window.activeTextEditor;
          let relForTex = dest.fsPath;
          // Prefer relative path from the main TeX file directory if configured
          let mainTex = String(cfg.get<string>('tex.mainFile', '') || '').trim();
          if (mainTex) {
            if (mainTex.startsWith('${workspaceFolder}')) mainTex = path.join(rootFsPath || '', mainTex.replace('${workspaceFolder}', ''));
            else if (!path.isAbsolute(mainTex) && rootFsPath) mainTex = path.join(rootFsPath, mainTex);
          }
          const baseDir = mainTex ? path.dirname(mainTex) : (editor ? path.dirname(editor.document.uri.fsPath) : (rootFsPath || ''));
          if (baseDir) {
            relForTex = path.relative(baseDir, dest.fsPath);
          }
          relForTex = relForTex.split(path.sep).join('/');
          if (!relForTex.startsWith('.') && !relForTex.startsWith('/')) relForTex = './' + relForTex;

          const label = `fig:${base}`;
          const captionInput = (String(msg.caption || '').trim());
          const citeKey = (String(msg.citeKey || '').trim());
          const captionLine = captionInput ? (citeKey ? `\\caption{${captionInput} \\parencite{${citeKey}}}` : `\\caption{${captionInput}}`) : (citeKey ? `\\caption{\\parencite{${citeKey}}}` : '\\caption{Caption.}');
          const tex = [
            '% Auto-generated by LingTeX',
            '\n',
            '\\begin{figure}[H]',
            '\\centering',
            `\\includegraphics[width=\\textwidth]{${relForTex}}`,
            captionLine,
            `\\label{${label}}`,
            '\\end{figure}',
            ''
          ].join('\n');

          if (editor) {
            const pos = editor.selection.active;
            await editor.edit(edit => edit.insert(pos, tex));
            const lines = tex.split('\n');
            const endPos = new vscode.Position(pos.line + lines.length - 1, (lines[lines.length - 1] || '').length);
            editor.selection = new vscode.Selection(endPos, endPos);
            vscode.window.showInformationMessage('LingTeX: Inserted figure at cursor and copied image to workspace.');
          } else {
            const docOut = await vscode.workspace.openTextDocument({ language: 'latex', content: tex });
            await vscode.window.showTextDocument(docOut);
            vscode.window.showInformationMessage('LingTeX: Opened figure snippet in new document and copied image to workspace.');
          }
          return;
        }
        if (msg?.type === 'generateTabularx') {
          const { tsv, caption, label, headerColumn } = msg as { tsv: string; caption?: string; label?: string; headerColumn?: boolean };
          if (!tsv || typeof tsv !== 'string') { vscode.window.showErrorMessage('LingTeX: Please paste TSV input.'); return; }
          const data = this.parseTSVForTabularx(tsv);
          if (!data.length) { vscode.window.showErrorMessage('LingTeX: No rows parsed from TSV.'); return; }
          const tex = this.renderTSVToTabularx(data, caption ?? null, (label && label.trim()) || 'tsv-table', !!headerColumn);
          const docOut = await vscode.workspace.openTextDocument({ language: 'latex', content: tex });
          await vscode.window.showTextDocument(docOut);
          vscode.window.showInformationMessage('LingTeX: Generated tabularx in a new unsaved document.');
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
    const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'lingtex-icon.svg'));
    const style = `
      html, body { height: 100%; }
      body {
        font-family: var(--vscode-font-family);
        padding: 8px;
        height: 100vh;
        overflow-y: auto;
        background: var(--vscode-sideBar-background);
        color: var(--vscode-foreground);
      }
      h2 { font-size: 14px; margin: 12px 0 6px; }
      button { margin: 2px 0; }
      .group { border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 8px; margin-bottom: 8px; }
      .row { display: flex; gap: 6px; align-items: center; margin: 4px 0; }
      input[type="text"], select, textarea { width: 100%; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); }
      details { margin: 8px 0; border: 1px solid var(--vscode-widget-border); border-radius: 4px; }
      details > summary { cursor: pointer; padding: 6px 8px; background: var(--vscode-titleBar-activeBackground); color: var(--vscode-titleBar-activeForeground); }
      details[open] > summary { font-weight: 600; }
      details > div { padding: 8px; }
      details > summary { cursor: pointer; }
      /* Ensure summary remains visible and clickable across themes */
      details[open] > summary { font-weight: 600; }
      summary { cursor: pointer; }
      .btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 8px; border-radius: 4px; }
      .btn:hover { background: var(--vscode-button-hoverBackground); }
      .cmds { display: grid; grid-template-columns: 1fr; gap: 4px; }
      .help { color: var(--vscode-descriptionForeground); font-size: 12px; }
      .logo { display:block; height: 95px; margin: 0 auto 6px; clip-path: inset(30% 0 25% 0); }
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

        <img src="${iconUri}" alt="LingTeX" class="logo" />

        <details>
          <summary><strong>TSV → Interlinear</strong></summary>
          <div class="help" style="margin:4px 0 8px;">
            Paste TSV below, choose options, and click Generate. Place the text cursor where you want the LaTeX inserted (especially for adding an item to an existing list). If the code is inserted in the wrong place, your document may fail to compile.
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
          <div class="help" style="margin:4px 0 8px;">
            Paste TSV below, set options, and click Generate. Output opens as a new unsaved LaTeX document.
          </div>
          <div class="row">
            <label style="min-width:130px;">Caption:</label>
            <input type="text" id="tabx_caption" placeholder="My Table" />
          </div>
          <div class="row">
            <label style="min-width:130px;">Label:</label>
            <input type="text" id="tabx_label" placeholder="my-table" />
          </div>
          <div class="row">
            <input type="checkbox" id="tabx_headerCol" />
            <label for="tabx_headerCol">Bold header column and gray background</label>
          </div>
          <div class="row" style="flex-direction:column; align-items:stretch;">
            <textarea id="tabx_tsv" rows="10" style="width:100%; font-family: var(--vscode-editor-font-family, monospace);"></textarea>
          </div>
          <div class="row">
            <button class="btn" id="btnGenerateTabularx">Generate</button>
          </div>
        </details>

        <!-- Hidden unfinished features: Excel / XLingPaper, Document Tools -->
        <details>
          <summary><strong>Image → LaTeX Figure</strong></summary>
          <div class="help" style="margin:4px 0 8px;">
            Choose an image file, it will be copied into your workspace, and a \figure block will be inserted at your cursor.
          </div>
          <div class="help" style="margin:0 0 8px;">
            If LaTeX reports the figure is too large, adjust the \includegraphics options (e.g., width/height/keepaspectratio) until it fits. The compiler might fail to compile until you fix it. Quick reference: <a href="https://www.overleaf.com/learn/latex/Inserting_Images" target="_blank">Overleaf – Inserting Images</a>.
          </div>
          <div class="row">
            <label style="min-width:130px;">Figures output dir:</label>
            <input type="text" id="figure_outputDir" value="${this.escapeAttr(state.figure_outputDir)}" />
            <button class="btn" data-save="figure_outputDir">Save</button>
          </div>
          <div class="row">
            <label style="min-width:130px;">Main TeX file:</label>
            <input type="text" id="tex_mainFile" value="${this.escapeAttr(state.tex_mainFile)}" placeholder="e.g., \${workspaceFolder}/main.tex" />
            <button class="btn" data-save="tex_mainFile">Save</button>
          </div>
          <div class="row">
            <label style="min-width:130px;">Caption:</label>
            <input type="text" id="figure_caption" placeholder="Figure caption" />
          </div>
          <div class="row">
            <label style="min-width:130px;">Citation key:</label>
            <input type="text" id="figure_cite" placeholder="e.g., sil2011DLM (optional)" />
          </div>
          <div class="row">
            <button class="btn" id="btnImportImageFigure">Choose Image and Insert</button>
          </div>
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
            <label style="min-width:130px;">Translation spacing (before):</label>
            <select id="inter_beforeSkip">
              ${['none','smallskip','medskip','bigskip'].map((v:string)=>`<option value="${v}" ${state.inter_beforeSkip===v?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="row">
            <label style="min-width:130px;">Translation spacing (after):</label>
            <select id="inter_afterSkip">
              ${['none','smallskip','medskip','bigskip'].map((v:string)=>`<option value="${v}" ${state.inter_afterSkip===v?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="row">
            <input type="checkbox" id="inter_useOpenup" ${state.inter_useOpenup ? 'checked' : ''} />
            <label for="inter_useOpenup">Use \\openup for gloss lines</label>
          </div>
          <div class="row">
            <label style="min-width:130px;">\\openup gloss amount:</label>
            <input type="text" id="inter_openupGlossAmount" value="${this.escapeAttr(state.inter_openupGlossAmount)}" placeholder="e.g., 1em or 6pt" />
          </div>
          <div class="row">
            <label style="min-width:130px;">\\openup before translation:</label>
            <input type="text" id="inter_openupBeforeTranslationAmount" value="${this.escapeAttr(state.inter_openupBeforeTranslationAmount)}" placeholder="e.g., -0.5em" />
          </div>
          <div class="row">
            <label style="min-width:130px;">\\openup after translation:</label>
            <input type="text" id="inter_openupAfterTranslationAmount" value="${this.escapeAttr(state.inter_openupAfterTranslationAmount)}" placeholder="e.g., -0.5em" />
          </div>
          <div class="row">
            <button class="btn" data-save="tables_outputDir">Save Tables Dir</button>
            <button class="btn" data-save="excel_outputLocation">Save Excel Location</button>
            <button class="btn" data-save="excel_filenameTemplate">Save Excel Template</button>
            <button class="btn" data-save="inter_beforeSkip">Save Before Spacing</button>
            <button class="btn" data-save="inter_afterSkip">Save After Spacing</button>
            <button class="btn" data-save="inter_useOpenup">Save openup</button>
            <button class="btn" data-save="inter_openupGlossAmount">Save gloss openup</button>
            <button class="btn" data-save="inter_openupBeforeTranslationAmount">Save before-translation openup</button>
            <button class="btn" data-save="inter_openupAfterTranslationAmount">Save after-translation openup</button>
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
          document.getElementById('btnImportImageFigure').addEventListener('click', () => {
            const outDir = (document.getElementById('figure_outputDir').value || '').trim();
            const caption = (document.getElementById('figure_caption').value || '').trim();
            const citeKey = (document.getElementById('figure_cite').value || '').trim();
            vscode.postMessage({ type: 'importImageFigure', outputDir: outDir, caption, citeKey });
          });
          document.getElementById('btnGenerateInterlinear').addEventListener('click', () => {
            const tsv = (document.getElementById('tsvInput').value || '').trim();
            const wantLabel = !!(document.getElementById('addLabel').checked);
            const label = document.getElementById('labelInput').value || '';
            vscode.postMessage({ type: 'generateInterlinear', tsv, addLabel: wantLabel, label });
          });
          document.getElementById('btnGenerateTabularx').addEventListener('click', () => {
            const tsv = (document.getElementById('tabx_tsv').value || '').trim();
            const caption = (document.getElementById('tabx_caption').value || '').trim();
            const label = (document.getElementById('tabx_label').value || '').trim();
            const headerColumn = !!(document.getElementById('tabx_headerCol').checked);
            vscode.postMessage({ type: 'generateTabularx', tsv, caption, label, headerColumn });
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
              if (key === 'figure_outputDir') configKey = 'lingtex.figure.outputDir';
              if (key === 'tex_mainFile') configKey = 'lingtex.tex.mainFile';
              if (key === 'inter_beforeSkip') configKey = 'lingtex.interlinear.beforeSkip';
              if (key === 'inter_afterSkip') configKey = 'lingtex.interlinear.afterSkip';
              if (key === 'inter_useOpenup') configKey = 'lingtex.interlinear.useOpenup';
              if (key === 'inter_openupGlossAmount') configKey = 'lingtex.interlinear.openupGlossAmount';
              if (key === 'inter_openupBeforeTranslationAmount') configKey = 'lingtex.interlinear.openupBeforeTranslationAmount';
              if (key === 'inter_openupAfterTranslationAmount') configKey = 'lingtex.interlinear.openupAfterTranslationAmount';
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

  // ===== TSV -> tabularx helpers (panel-based generation) =====
  private latexEscapeTable(s: string): string {
    if (s == null) return '';
    return s
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/&/g, '\\&')
      .replace(/%/g, '\\%')
      .replace(/\$/g, '\\$')
      .replace(/#/g, '\\#')
      .replace(/_/g, '\\_')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/\^/g, '\\textasciicircum{}');
  }
  private makecellIfNeeded(text: string, align: 'l' | 'c' | 'r' = 'l'): string {
    if (!text) return '';
    if (text.includes('\n')) {
      const parts = text.split('\n').map(p => this.latexEscapeTable(p.trim()));
      return `\\makecell[${align}]{` + parts.join(' \\ ') + '}';
    }
    return this.latexEscapeTable(text);
  }
  private buildTabularxSpec(ncols: number): string {
    return '|' + Array.from({ length: ncols }, () => 'X').join('|') + '|';
  }
  private sanitizeLabelTable(s: string): string {
    return s.split('').map(ch => /[a-z0-9]/i.test(ch) ? ch.toLowerCase() : '-').join('').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }
  private parseTSVForTabularx(input: string): string[][] {
    const rows = input.replace(/\r\n?/g, '\n').split('\n').filter(line => line.length > 0);
    return rows.map(line => line.split('\t'));
  }
  private renderTSVToTabularx(data: string[][], caption: string | null, labelBase: string, headerColumn: boolean): string {
    const LATEX_HEADER = '\\renewcommand{\\arraystretch}{1.2}\n' + '\\setlength{\\tabcolsep}{6pt}\n';
    const HEADER_ROW_GRAY = '0.95';
    const ncols = Math.max(0, ...data.map(r => r.length));
    const lines: string[] = [];
    lines.push('% Auto-generated by LingTeX');
    lines.push(LATEX_HEADER.trim());
    lines.push('\\begin{table}[htbp!]');
    lines.push('\\centering');
    if (caption) {
      lines.push(`\\caption{${this.latexEscapeTable(caption)}}`);
      lines.push(`\\label{tbl:${this.sanitizeLabelTable(labelBase)}}`);
    }
    lines.push(`\\begin{tabularx}{\\linewidth}{${this.buildTabularxSpec(ncols)}}`);
    lines.push('\\hline');
    if (data.length > 0) lines.push(`\\rowcolor[gray]{${HEADER_ROW_GRAY}}`);
    const renderRow = (row: string[], isHeader: boolean): string => {
      const cells = row.map((raw, idx) => {
        let content = this.makecellIfNeeded(raw ?? '', 'l');
        if (isHeader || (headerColumn && idx === 0)) content = `\\textbf{${content}}`;
        if (headerColumn && !isHeader && idx === 0) content = `\\cellcolor[gray]{${HEADER_ROW_GRAY}}` + content;
        return content;
      });
      return cells.join(' & ') + ' \\\\';
    };
    if (data.length > 0) {
      lines.push(renderRow(data[0], true));
      lines.push('\\hline');
    }
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row.every(cell => !cell || cell.trim() === '')) continue; // skip empty
      lines.push(renderRow(row, false));
      lines.push('\\hline');
    }
    lines.push('\\end{tabularx}');
    lines.push('\\end{table}');
    return lines.join('\n') + '\n';
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
    if (!joined) return null;
    // Strip any leading "Free" or "Free translation" labels that may have slipped through.
    const cleaned = joined.replace(/^\s*(?:free(?:\s+translation)?)[\s:*\-–—]*\s*/i, '');
    return cleaned;
  }
  private renderExampleN(ex: { tiers: Record<string,string[]>; tierOrder: string[]; freeTranslations: { lang?: string; text: string }[] }): string {
    const { gCmd, lines } = this.renderGLLLines(ex);
    const glt = this.renderGlt(ex);
    // Read spacing preferences
    const cfg = vscode.workspace.getConfiguration('lingtex');
    const useOpenup = !!cfg.get<boolean>('interlinear.useOpenup', true);
    const openupGloss = (cfg.get<string>('interlinear.openupGlossAmount', '1em') || '1em').trim();
    const openupBeforeTr = (cfg.get<string>('interlinear.openupBeforeTranslationAmount', '-0.5em') || '-0.5em').trim();
    const openupAfterTr = (cfg.get<string>('interlinear.openupAfterTranslationAmount', '-0.5em') || '-0.5em').trim();
    if (!lines.length) {
      const transOnly = glt ? `\\glt ${this.latexEscape(glt)}` : '';
      return transOnly || '% (no aligned interlinear lines)';
    }
    const head = `\\${gCmd} ${this.latexEscape(lines[0])} \\\\`;
    const rest = lines.slice(1).map(ln => `${this.latexEscape(ln)} \\\\`).join('\n');
    let gllBlock = [head, rest].filter(Boolean).join('\n');
    const parts: string[] = [];
    if (useOpenup && openupGloss && !/^0(?:pt|em)?$/i.test(openupGloss)) parts.push(`\\openup ${openupGloss}`);
    parts.push(gllBlock.trimEnd());
    if (glt) {
      if (useOpenup && openupBeforeTr && !/^0(?:pt|em)?$/i.test(openupBeforeTr)) parts.push(`\\openup ${openupBeforeTr}`);
      // Add a small paragraph skip before the translation
      parts.push('\\par\\smallskip');
      parts.push(`\\glt ${this.latexEscape(glt)}`);
      if (useOpenup && openupAfterTr && !/^0(?:pt|em)?$/i.test(openupAfterTr)) parts.push(`\\openup ${openupAfterTr}`);
    }
    return parts.join('\n');
  }
  private asSingleExample(ex: any): string { return ['\n% Single example','\n\\begin{exe}','\\ex % \\label{ex:KEY}', this.renderExampleN(ex),'\\end{exe}\n'].join('\n'); }
  private asListStarter(first: any): string { return ['\n% Start a list example with this as (a).','\n\\begin{exe}','\\ex % \\label{ex:KEY}','\\begin{xlist}','\\ex % \\label{ex:KEY-a}', this.renderExampleN(first),'% Add more items as needed...','\\end{xlist}','\\end{exe}\n'].join('\n'); }
  private asListItem(ex: any): string { return ['\n% List item to add inside an existing xlist','\\ex % \\label{ex:KEY-?}', this.renderExampleN(ex), ''].join('\n'); }
  private asItemsForExistingList(exs: any[]): string {
    const cfg = vscode.workspace.getConfiguration('lingtex');
    const afterPref = (cfg.get<string>('interlinear.afterSkip', 'medskip') || 'medskip').toLowerCase();
    const sep = afterPref && afterPref !== 'none' ? `\n\\par\\${afterPref}\n` : '\n\n';
    return exs
      .map((e,i)=>['\\ex % \\label{ex:KEY-'+String(i+1)+'}', this.renderExampleN(e)].join('\n'))
      .join(sep);
  }
  private asListOfExamples(exs: any[]): string {
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const cfg = vscode.workspace.getConfiguration('lingtex');
    const afterPref = (cfg.get<string>('interlinear.afterSkip', 'medskip') || 'medskip').toLowerCase();
    const sep = afterPref && afterPref !== 'none' ? `\n\\par\\${afterPref}\n` : '\n';
    const items = exs
      .map((e,i)=>['\\ex % \\label{ex:KEY-'+(letters[i]||String(i+1))+'}', this.renderExampleN(e)].join('\n'))
      .join(sep);
    return ['\n% List example (numbered subexamples a, b, c, ...)','\n\\begin{exe}','\\ex % \\label{ex:KEY}','\\begin{xlist}',items,'\\end{xlist}','\\end{exe}\n'].join('\n');
  }
  private asInterlinearText(exs: any[]): string {
    const cfg = vscode.workspace.getConfiguration('lingtex');
    const afterPref = (cfg.get<string>('interlinear.afterSkip', 'medskip') || 'medskip').toLowerCase();
    const sep = afterPref && afterPref !== 'none' ? `\n\\par\\${afterPref}\n` : '\n\n';
    const items = exs
      .map((e,i)=>['\\ex % \\label{ex:KEY-'+String(i+1)+'}', this.renderExampleN(e)].join('\n'))
      .join(sep);
    return ['\n% Interlinear text (sequence of numbered examples)','\n\\begin{exe}',items,'\\end{exe}\n'].join('\n');
  }

  private latexEscape(s: string): string {
    // Preserve '~' so it remains a non-breaking space in LaTeX interlinear output.
    return s
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/([#%&_{}])/g, '{\\$1}')
      .replace(/\^/g, '{\\textasciicircum}');
  }
}
