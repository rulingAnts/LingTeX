import * as vscode from 'vscode';
import * as path from 'path';
import { detectTexEnvironment } from '../features/texEnvironment';

export class LingTeXViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'lingtex.panel';
  private currentFolderIndex: number = 0;
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = { enableScripts: true };
    const folders = vscode.workspace.workspaceFolders || [];
    // Initialize selected folder index from workspace-level setting
    const cfgWindow = vscode.workspace.getConfiguration('lingtex');
    const savedIdx = cfgWindow.get<number>('ui.selectedFolderIndex', 0) ?? 0;
    this.currentFolderIndex = Math.max(0, Math.min((folders.length || 1) - 1, Number(savedIdx) || 0));
    const scopeUri = folders[this.currentFolderIndex]?.uri;
    const cfg = vscode.workspace.getConfiguration('lingtex', scopeUri);
    const hasWorkshop = !!vscode.extensions.getExtension('James-Yu.latex-workshop');
    const hasUtilities = !!vscode.extensions.getExtension('tecosaur.latex-utilities');
    const depsOk = hasWorkshop && hasUtilities;
    const state = {
      tables_outputDir: cfg.get<string>('tables.outputDir', '${workspaceFolder}/misc/tables'),
      excel_outputLocation: cfg.get<string>('excel.outputLocation', 'downloads'),
      excel_filenameTemplate: cfg.get<string>('excel.filenameTemplate', '${basename}-${date}-${time}'),
      inter_beforeSkip: cfg.get<string>('interlinear.beforeSkip', 'smallskip'),
      inter_afterSkip: cfg.get<string>('interlinear.afterSkip', 'medskip'),
      inter_useOpenup: cfg.get<boolean>('interlinear.useOpenup', true),
      inter_openupGlossAmount: cfg.get<string>('interlinear.openupGlossAmount', '1em'),
      figure_outputDir: cfg.get<string>('figure.outputDir', '${workspaceFolder}/misc/figures')
      ,tex_mainFile: cfg.get<string>('tex.mainFile', '')
      ,tex_mainPdf: cfg.get<string>('tex.mainPdf', '')
      ,preview_autoPreviewPane: cfg.get<boolean>('preview.autoPreviewPane', false)
      ,folders: folders.map(f => ({ name: f.name, path: f.uri.fsPath }))
      ,selectedFolderIndex: this.currentFolderIndex
      ,depsOk
      ,missing: { workshop: !hasWorkshop, utilities: !hasUtilities }
      ,texEnvOk: true
    };
    webviewView.webview.html = depsOk ? this.getHtml(webviewView.webview, state) : this.getHtmlMissing(webviewView.webview, state);

    // Detect TeX environment asynchronously and refresh UI state with prominent warning if missing
    detectTexEnvironment().then(env => {
      const refreshed = { ...state, texEnvOk: !!env?.texFound };
      webviewView.webview.html = depsOk ? this.getHtml(webviewView.webview, refreshed) : this.getHtmlMissing(webviewView.webview, refreshed);
    }).catch(()=>{});

    // Auto-refresh panel when settings or workspace folders change
    const refreshFromConfig = async () => {
      try {
        const folders2 = vscode.workspace.workspaceFolders || [];
        const scopeUri2 = folders2[this.currentFolderIndex]?.uri;
        const cfg2 = vscode.workspace.getConfiguration('lingtex', scopeUri2);
        const hasWorkshop2 = !!vscode.extensions.getExtension('James-Yu.latex-workshop');
        const hasUtilities2 = !!vscode.extensions.getExtension('tecosaur.latex-utilities');
        const depsOk2 = hasWorkshop2 && hasUtilities2;
        const env2 = await detectTexEnvironment().catch(()=>({ texFound: true } as any));
        const newState = {
          tables_outputDir: cfg2.get<string>('tables.outputDir', '${workspaceFolder}/misc/tables'),
          excel_outputLocation: cfg2.get<string>('excel.outputLocation', 'downloads'),
          excel_filenameTemplate: cfg2.get<string>('excel.filenameTemplate', '${basename}-${date}-${time}'),
          inter_beforeSkip: cfg2.get<string>('interlinear.beforeSkip', 'smallskip'),
          inter_afterSkip: cfg2.get<string>('interlinear.afterSkip', 'medskip'),
          inter_useOpenup: cfg2.get<boolean>('interlinear.useOpenup', true),
          inter_openupGlossAmount: cfg2.get<string>('interlinear.openupGlossAmount', '1em'),
          figure_outputDir: cfg2.get<string>('figure.outputDir', '${workspaceFolder}/misc/figures'),
          tex_mainFile: cfg2.get<string>('tex.mainFile', ''),
          tex_mainPdf: cfg2.get<string>('tex.mainPdf', ''),
          preview_autoPreviewPane: cfg2.get<boolean>('preview.autoPreviewPane', false),
          folders: folders2.map(f => ({ name: f.name, path: f.uri.fsPath })),
          selectedFolderIndex: this.currentFolderIndex,
          depsOk: depsOk2,
          missing: { workshop: !hasWorkshop2, utilities: !hasUtilities2 },
          texEnvOk: !!env2?.texFound
        };
        webviewView.webview.html = depsOk2 ? this.getHtml(webviewView.webview, newState) : this.getHtmlMissing(webviewView.webview, newState);
      } catch (e) {
        // Non-fatal; ignore refresh errors
      }
    };
    const cfgDisposable = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('lingtex')) {
        // If the selected folder index changed at the workspace level, sync it
        if (e.affectsConfiguration('lingtex.ui.selectedFolderIndex')) {
          const idx = vscode.workspace.getConfiguration('lingtex').get<number>('ui.selectedFolderIndex', this.currentFolderIndex) ?? this.currentFolderIndex;
          const len = vscode.workspace.workspaceFolders?.length || 0;
          this.currentFolderIndex = Math.max(0, Math.min(Math.max(0, len - 1), Number(idx) || 0));
        }
        refreshFromConfig().catch(()=>{});
      }
    });
    this.context.subscriptions.push(cfgDisposable);
    const wfDisposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const len = vscode.workspace.workspaceFolders?.length || 0;
      if (this.currentFolderIndex >= len) this.currentFolderIndex = Math.max(0, len - 1);
      // Persist clamped index back to workspace settings
      try {
        const cfgWin = vscode.workspace.getConfiguration('lingtex');
        cfgWin.update('ui.selectedFolderIndex', this.currentFolderIndex, vscode.ConfigurationTarget.Workspace);
      } catch {}
      refreshFromConfig().catch(()=>{});
    });
    this.context.subscriptions.push(wfDisposable);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      try {
        if (msg?.type === 'runCommand' && typeof msg.command === 'string') {
          const args = Array.isArray(msg.args) ? msg.args : undefined;
          if (args) await vscode.commands.executeCommand(msg.command, ...args);
          else await vscode.commands.executeCommand(msg.command);
          return;
        }
        if (msg?.type === 'selectFolder' && typeof msg.index === 'number') {
          const i = Math.max(0, Math.min((vscode.workspace.workspaceFolders?.length || 1) - 1, msg.index));
          this.currentFolderIndex = i;
          // Save workspace-level selected folder index
          await vscode.workspace.getConfiguration('lingtex').update('ui.selectedFolderIndex', i, vscode.ConfigurationTarget.Workspace);
          const scopeUri = vscode.workspace.workspaceFolders?.[i]?.uri;
          const cfg = vscode.workspace.getConfiguration('lingtex', scopeUri);
          const hasWorkshop3 = !!vscode.extensions.getExtension('James-Yu.latex-workshop');
          const hasUtilities3 = !!vscode.extensions.getExtension('tecosaur.latex-utilities');
          const depsOk3 = hasWorkshop3 && hasUtilities3;
          const state = {
            tables_outputDir: cfg.get<string>('tables.outputDir', '${workspaceFolder}/misc/tables'),
            excel_outputLocation: cfg.get<string>('excel.outputLocation', 'downloads'),
            excel_filenameTemplate: cfg.get<string>('excel.filenameTemplate', '${basename}-${date}-${time}'),
            inter_beforeSkip: cfg.get<string>('interlinear.beforeSkip', 'smallskip'),
            inter_afterSkip: cfg.get<string>('interlinear.afterSkip', 'medskip'),
            inter_useOpenup: cfg.get<boolean>('interlinear.useOpenup', true),
            inter_openupGlossAmount: cfg.get<string>('interlinear.openupGlossAmount', '1em'),
            figure_outputDir: cfg.get<string>('figure.outputDir', '${workspaceFolder}/misc/figures'),
            tex_mainFile: cfg.get<string>('tex.mainFile', ''),
            tex_mainPdf: cfg.get<string>('tex.mainPdf', ''),
            preview_autoPreviewPane: cfg.get<boolean>('preview.autoPreviewPane', false),
            folders: (vscode.workspace.workspaceFolders||[]).map(f => ({ name: f.name, path: f.uri.fsPath })),
            selectedFolderIndex: i,
            depsOk: depsOk3,
            missing: { workshop: !hasWorkshop3, utilities: !hasUtilities3 }
          };
          webviewView.webview.html = depsOk3 ? this.getHtml(webviewView.webview, state) : this.getHtmlMissing(webviewView.webview, state);
          return;
        }
        if (msg?.type === 'importImageFigure') {
          // Resolve output directory from message or config
          const wf = vscode.workspace.workspaceFolders?.[this.currentFolderIndex];
          const scopeUri = wf?.uri;
          const cfg = vscode.workspace.getConfiguration('lingtex', scopeUri);
          let outDir = String(cfg.get<string>('figure.outputDir', '${workspaceFolder}/misc/figures') || '').trim();
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
          const captionLine = captionInput ? `\\caption{${captionInput}}` : '\\caption{Caption.}';
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
          const scopeUri = vscode.workspace.workspaceFolders?.[this.currentFolderIndex]?.uri;
          const cfgRoot = vscode.workspace.getConfiguration('lingtex', scopeUri);
          if (key.startsWith('lingtex.')) {
            const sub = key.split('.').slice(1).join('.');
            await cfgRoot.update(sub, value, vscode.ConfigurationTarget.WorkspaceFolder);
          } else {
            await cfgRoot.update(key, value, vscode.ConfigurationTarget.WorkspaceFolder);
          }
          vscode.window.showInformationMessage('LingTeX: Settings updated');
          return;
        }
        if (msg?.type === 'updateSettings' && msg.entries && typeof msg.entries === 'object') {
          const entries: Record<string, any> = msg.entries;
          const scopeUri = vscode.workspace.workspaceFolders?.[this.currentFolderIndex]?.uri;
          const cfgRoot = vscode.workspace.getConfiguration('lingtex', scopeUri);
          for (const [key, value] of Object.entries(entries)) {
            const sub = key.startsWith('lingtex.') ? key.split('.').slice(1).join('.') : key;
            await cfgRoot.update(sub, value, vscode.ConfigurationTarget.WorkspaceFolder);
          }
          vscode.window.showInformationMessage('LingTeX: All settings saved');
          return;
        }
        if (msg?.type === 'chooseFolder' && typeof msg.key === 'string') {
          const key = String(msg.key);
          const wf = vscode.workspace.workspaceFolders?.[this.currentFolderIndex];
          const rootUri = wf?.uri;
          const picks = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            defaultUri: rootUri
          });
          if (!picks || !picks.length) return;
          const chosen = picks[0];
          const rootFsPath = wf?.uri.fsPath || '';
          if (rootFsPath && !chosen.fsPath.startsWith(rootFsPath)) {
            vscode.window.showErrorMessage('LingTeX: Please choose a folder inside the current workspace.');
            return;
          }
          let storeValue = chosen.fsPath;
          if (rootFsPath && storeValue.startsWith(rootFsPath)) {
            const rel = storeValue.slice(rootFsPath.length).replace(/^\//, '').split(path.sep).join('/');
            storeValue = '${workspaceFolder}/' + rel;
          }
          const scopeUri2 = vscode.workspace.workspaceFolders?.[this.currentFolderIndex]?.uri;
          const cfgRoot = vscode.workspace.getConfiguration('lingtex', scopeUri2);
          const sub = key.split('.').slice(1).join('.');
          await cfgRoot.update(sub, storeValue, vscode.ConfigurationTarget.WorkspaceFolder);
          webviewView.webview.postMessage({ type: 'folderChosen', key, value: storeValue });
          vscode.window.showInformationMessage('LingTeX: Folder selected and setting updated');
          return;
        }
        if (msg?.type === 'chooseFile' && typeof msg.key === 'string') {
          const key = String(msg.key);
          const wf = vscode.workspace.workspaceFolders?.[this.currentFolderIndex];
          const rootUri = wf?.uri;
          // Choose filters based on key
          const filter: { [name: string]: string[] } = key.includes('mainPdf') ? { PDF: ['pdf'] } : { TeX: ['tex'] };
          const picks = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            defaultUri: rootUri,
            filters: filter
          });
          if (!picks || !picks.length) return;
          const chosen = picks[0];
          const rootFsPath = wf?.uri.fsPath || '';
          if (rootFsPath && !chosen.fsPath.startsWith(rootFsPath)) {
            vscode.window.showErrorMessage('LingTeX: Please choose a file inside the current workspace.');
            return;
          }
          let storeValue = chosen.fsPath;
          if (rootFsPath && storeValue.startsWith(rootFsPath)) {
            const rel = storeValue.slice(rootFsPath.length).replace(/^\//, '').split(path.sep).join('/');
            storeValue = '${workspaceFolder}/' + rel;
          }
          const scopeUri3 = vscode.workspace.workspaceFolders?.[this.currentFolderIndex]?.uri;
          const cfgRoot = vscode.workspace.getConfiguration('lingtex', scopeUri3);
          const sub = key.split('.').slice(1).join('.');
          await cfgRoot.update(sub, storeValue, vscode.ConfigurationTarget.WorkspaceFolder);
          webviewView.webview.postMessage({ type: 'fileChosen', key, value: storeValue });
          vscode.window.showInformationMessage('LingTeX: File selected and setting updated');
          return;
        }
        if (msg?.type === 'insertDocStructure' && typeof msg.key === 'string') {
          const key = msg.key as string;
          const editor = vscode.window.activeTextEditor;
          if (!editor) { vscode.window.showErrorMessage('LingTeX: Open a LaTeX document to insert.'); return; }
          const map: Record<string, string> = {
            part: '\n% Part — \\part{…}\n\\part{${1:${TM_SELECTED_TEXT}}}$0',
            chapter: '\n% Chapter — \\chapter{…}\n\\chapter{${1:${TM_SELECTED_TEXT}}}$0',
            section: '\n% Section — \\section{…}\n\\section{${1:${TM_SELECTED_TEXT}}}$0',
            sectionStar: '\n% Unnumbered Section — \\section*{…}\n\\section*{${1:${TM_SELECTED_TEXT}}}$0',
            subsection: '\n% Subsection — \\subsection{…}\n\\subsection{${1:${TM_SELECTED_TEXT}}}$0',
            subsectionStar: '\n% Unnumbered Subsection — \\subsection*{…}\n\\subsection*{${1:${TM_SELECTED_TEXT}}}$0',
            subsubsection: '\n% Subsubsection — \\subsubsection{…}\n\\subsubsection{${1:${TM_SELECTED_TEXT}}}$0',
            paragraph: '\n% Paragraph — \\paragraph{…}\n\\paragraph{${1:${TM_SELECTED_TEXT}}}$0',
            label: '\n% Label — \\label{…}\n% Example: \\label{sec:introduction}\n\\label{${1:${TM_SELECTED_TEXT}}}$0',
            ref: '\n% Reference — \\ref{…}\n% Example: \\ref{sec:introduction}\n\\ref{${1:${TM_SELECTED_TEXT}}}$0',
            cref: '\n% Smart Reference — \\cref{…}\n% Example: \\cref{sec:introduction}\n\\cref{${1:${TM_SELECTED_TEXT}}}$0',
            pageref: '\n% Page Reference — \\pageref{…}\n% Example: \\pageref{sec:introduction}\n\\pageref{${1:${TM_SELECTED_TEXT}}}$0',
            href: '\n% Hyperlink — \\href{url}{text}\n% Example: \\href{https://example.com}{link text}\n\\href{${1:url}}{${2:${TM_SELECTED_TEXT}}}$0',
            url: '\n% URL — \\url{…}\n% Example: \\url{https://example.com}\n\\url{${1:${TM_SELECTED_TEXT}}}$0',
            input: '\n% Include File — \\input{…}\n% Example: \\input{sections/intro}\n\\input{${1:path}}$0',
            tableofcontents: '\n% Table of Contents — \\tableofcontents\n\\tableofcontents\n$0',
            listoffigures: '\n% List of Figures — \\listoffigures\n\\listoffigures\n$0',
            listoftables: '\n% List of Tables — \\listoftables\n\\listoftables\n$0',
            itemize: '\n% Bulleted List — itemize\n% Example: \\item First item\n\\begin{itemize}\n\\item ${1:${TM_SELECTED_TEXT}}\n\\end{itemize}\n$0',
            enumerate: '\n% Numbered List — enumerate\n% Example: \\item First item\n\\begin{enumerate}\n\\item ${1:${TM_SELECTED_TEXT}}\n\\end{enumerate}\n$0',
            quote: '\n% Quote Block — quote\n% Example: a short quotation\n\\begin{quote}\n${1:${TM_SELECTED_TEXT}}\n\\end{quote}\n$0',
            footnote: '\n% Footnote — \\footnote{…}\n% Example: \\footnote{Extra details.}\n\\footnote{${1:${TM_SELECTED_TEXT}}}$0',
            printbibliography: '\n% Bibliography — \\printbibliography\n\\printbibliography\n$0',
            appendix: '\n% Appendix — \\appendix\n\\appendix\n$0',
            newpage: '\n% New Page — \\newpage\n\\newpage\n$0',
            clearpage: '\n% Flush Figures — \\clearpage\n\\clearpage\n$0'
          };
          const snippet = map[key] || map['section'];
          await editor.insertSnippet(new vscode.SnippetString(snippet));
          return;
        }
        if (msg?.type === 'insertListElement' && typeof msg.key === 'string') {
          const key = msg.key as string;
          const editor = vscode.window.activeTextEditor;
          if (!editor) { vscode.window.showErrorMessage('LingTeX: Open a LaTeX document to insert.'); return; }
          const map: Record<string, string> = {
            itemize: '\n% Bulleted List — itemize\n% Example: \\item First item\n\\begin{itemize}\n\\item ${1:${TM_SELECTED_TEXT}}\n\\end{itemize}\n$0',
            enumerate: '\n% Numbered List — enumerate\n% Example: \\item First item\n\\begin{enumerate}\n\\item ${1:${TM_SELECTED_TEXT}}\n\\end{enumerate}\n$0',
            listItem: '\n% List Item — \\item\n% Example: \\item First item\n\\item ${1:${TM_SELECTED_TEXT}}$0',
            xlist: '\n% Numbered Sub-Examples — xlist (gb4e)\n% Example: \\ex % \\label{ex:KEY-a}\n\\begin{xlist}\n\\ex % \\label{ex:KEY-a}\n${1:${TM_SELECTED_TEXT}}\n\\end{xlist}\n$0',
            singleExample: '\n% Single Example — exe (gb4e)\n% Example: \\ex % \\label{ex:KEY}\n\\begin{exe}\n\\ex % \\label{ex:KEY}\n${1:${TM_SELECTED_TEXT}}\n\\end{exe}\n$0',
            listExample: '\n% New List Example — exe + xlist (gb4e)\n% Example: \\ex % \\label{ex:KEY}, subexample a\n\\begin{exe}\n\\ex % \\label{ex:KEY}\n\\begin{xlist}\n\\ex % \\label{ex:KEY-a}\n${1:${TM_SELECTED_TEXT}}\n\\end{xlist}\n\\end{exe}\n$0'
          };
          const snippet = map[key] || map['itemize'];
          await editor.insertSnippet(new vscode.SnippetString(snippet));
          return;
        }
        if (msg?.type === 'insertInlineFormat' && typeof msg.key === 'string') {
          const key = msg.key as string;
          const editor = vscode.window.activeTextEditor;
          if (!editor) { vscode.window.showErrorMessage('LingTeX: Open a LaTeX document to insert.'); return; }
          const map: Record<string, string> = {
            textbf: '\n% Bold — \\textbf{…}\n% Example: \\textbf{important}\n\\textbf{${1:${TM_SELECTED_TEXT}}}$0',
            emph: '\n% Italic — \\emph{…}\n% Example: \\emph{emphasis}\n\\emph{${1:${TM_SELECTED_TEXT}}}$0',
            underline: '\n% Underline — \\underline{…}\n% Example: \\underline{underline}\n\\underline{${1:${TM_SELECTED_TEXT}}}$0',
            sout: '\n% Strikethrough — \\sout{…} (requires ulem)\n% Example: \\sout{removed}\n\\sout{${1:${TM_SELECTED_TEXT}}}$0',
            textsc: '\n% Small Caps — \\textsc{…}\n% Example: \\textsc{Title}\n\\textsc{${1:${TM_SELECTED_TEXT}}}$0',
            texttt: '\n% Monospace — \\texttt{…}\n% Example: \\texttt{code}\n\\texttt{${1:${TM_SELECTED_TEXT}}}$0',
            textsuperscript: '\n% Superscript — \\textsuperscript{…}\n% Example: x\\textsuperscript{2}\n\\textsuperscript{${1:${TM_SELECTED_TEXT}}}$0',
            textsubscript: '\n% Subscript — \\textsubscript{…}\n% Example: H\\textsubscript{2}O\n\\textsubscript{${1:${TM_SELECTED_TEXT}}}$0',
            small: '\n% Small Text — {\\small …}\n% Example: {\\small smaller text}\n{\\small ${1:${TM_SELECTED_TEXT}}}$0',
            large: '\n% Large Text — {\\large …}\n% Example: {\\large larger text}\n{\\large ${1:${TM_SELECTED_TEXT}}}$0'
          };
          if (key === 'textcolor') {
            const model = (typeof msg.colorModel === 'string') ? String(msg.colorModel) : 'named';
            const raw = String(msg.colorValue || '').trim();
            if (model.toUpperCase() === 'HTML') {
              const hex = raw.replace(/^#/, '').toUpperCase();
              const valid = /^[0-9A-F]{6}$/.test(hex);
              const hexToUse = valid ? hex : 'FF0000';
              const snip = `\n% Text Color (HTML) — \\textcolor[HTML]{RRGGBB}{…}\n% Example: \\textcolor[HTML]{FF7F50}{coral text}\n\\textcolor[HTML]{${hexToUse}}{${'${1:${TM_SELECTED_TEXT}}'} }$0`;
              await editor.insertSnippet(new vscode.SnippetString(snip));
              return;
            } else {
              const name = raw || 'red';
              const snip = `\n% Text Color — \\textcolor{color}{…}\n% Example: \\textcolor{${name}}{highlight}\n\\textcolor{${name}}{${'${1:${TM_SELECTED_TEXT}}'} }$0`;
              await editor.insertSnippet(new vscode.SnippetString(snip));
              return;
            }
          }
          const snippet = map[key] || map['textbf'];
          await editor.insertSnippet(new vscode.SnippetString(snippet));
          return;
        }
        if (msg?.type === 'addSubDocument') {
          const wf = vscode.workspace.workspaceFolders?.[this.currentFolderIndex];
          const rootUri = wf?.uri;
          const cfg = vscode.workspace.getConfiguration('lingtex', rootUri);
          const defaultDir = rootUri ?? vscode.Uri.file(process.cwd());
          const destUri = await vscode.window.showSaveDialog({
            title: 'Create Sub-Document',
            defaultUri: vscode.Uri.joinPath(defaultDir, 'section.tex'),
            filters: { TeX: ['tex'] }
          });
          if (!destUri) return;

          const template = [
            '% Auto-generated by LingTeX',
            '% Sub-document created via Document Structure panel',
            '',
            '% Put your content here...',
            ''
          ].join('\n');
          try {
            await vscode.workspace.fs.writeFile(destUri, Buffer.from(template, 'utf8'));
          } catch (e: any) {
            vscode.window.showErrorMessage(`LingTeX: Failed to create sub-document: ${e?.message ?? e}`);
            return;
          }

          const editor = vscode.window.activeTextEditor;
          const rootFsPath = wf?.uri.fsPath || '';
          let mainTex = String(cfg.get<string>('tex.mainFile', '') || '').trim();
          if (mainTex) {
            if (mainTex.startsWith('${workspaceFolder}')) mainTex = path.join(rootFsPath || '', mainTex.replace('${workspaceFolder}', ''));
            else if (!path.isAbsolute(mainTex) && rootFsPath) mainTex = path.join(rootFsPath, mainTex);
          }
          const baseDir = mainTex ? path.dirname(mainTex) : (editor ? path.dirname(editor.document.uri.fsPath) : (rootFsPath || ''));
          let rel = destUri.fsPath;
          if (baseDir) rel = path.relative(baseDir, destUri.fsPath);
          rel = rel.split(path.sep).join('/');
          rel = rel.replace(/\.tex$/i, '');
          if (!rel.startsWith('.') && !rel.startsWith('/')) rel = './' + rel;

          const snippet = `\\input{${rel}}\n`;
          if (editor) {
            const pos = editor.selection.active;
            await editor.edit(edit => edit.insert(pos, snippet));
            const endPos = new vscode.Position(pos.line, pos.character + snippet.length);
            editor.selection = new vscode.Selection(endPos, endPos);
            // Open the new sub-document in a background tab (don't steal focus)
            const doc = await vscode.workspace.openTextDocument(destUri);
            await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
            vscode.window.showInformationMessage('LingTeX: Sub-document created, opened, and \\input inserted at cursor.');
          } else {
            await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(destUri));
            await vscode.env.clipboard.writeText(snippet);
            vscode.window.showInformationMessage('LingTeX: Sub-document created. No active editor; \\input copied to clipboard.');
          }
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
      .warn { border: 2px solid #b30000; background: #ffdddd; color: #660000; padding: 10px; margin: 10px 0; border-radius: 4px; }
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
        <div>
        LingTeX is a VSCode extension for linguists working with LaTeX. It provides tools for generating interlinear glosses, LaTeX tables from TSV data, and inserting figures. More info: <a href="https://rulingants.github.io/LingTeX">GitHub</a>.
        </div>

        ${state.texEnvOk ? '' : `
        <div class="warn">
          <strong>No TeX distribution detected.</strong>
          <div class="help" style="margin-top:6px;">Run Check Environment to confirm. If none is found, you will be prompted to install.</div>
          <div style="margin-top:8px; display:flex; gap:8px;">
            <button class="btn" data-cmd="lingtex.tex.checkEnvironment">Check Environment</button>
            <button class="btn" data-cmd="lingtex.tex.checkPreamblePackages">Check Preamble Packages</button>
          </div>
        </div>
        `}

        ${state.depsOk ? '' : `
        <div style="border:1px solid var(--vscode-input-border); background: var(--vscode-input-background); padding:12px; margin:12px 0;">
          <strong>Required extensions missing</strong>
          <div class="help" style="margin-top:6px;">LingTeX works best alongside LaTeX tools. Please install:
            <ul style="margin:8px 0 0 18px;">
              ${state.missing?.workshop ? '<li><a href="vscode:extension/James-Yu.latex-workshop" target="_blank">LaTeX Workshop</a></li>' : ''}
              ${state.missing?.utilities ? '<li><a href="vscode:extension/tecosaur.latex-utilities" target="_blank">LaTeX Utilities</a></li>' : ''}
            </ul>
          </div>
          <div class="help" style="margin-top:8px;">After installing, reload the window to see the full panel.</div>
          <div style="margin-top:8px; display:flex; gap:8px;">
            <button class="btn" data-cmd="workbench.extensions.search" data-args='["@installed latex"]'>Open Extensions</button>
          </div>
        </div>
        `}

        <div id="ltx_controls" style="${state.depsOk ? '' : 'display:none;'}">
        <details ${state.texEnvOk ? '' : 'open'}>
          <summary><strong>TeX Environment</strong></summary>
          <div class="help" style="margin:4px 0 8px;">Detect and install a TeX distribution, and verify missing packages from your preamble.</div>
          <div class="row" style="gap:8px;">
            <button class="btn" data-cmd="lingtex.tex.checkEnvironment">Check Environment</button>
            <button class="btn" data-cmd="lingtex.tex.checkPreamblePackages">Check Preamble Packages</button>
            ${state.texEnvOk ? '<button class="btn" data-cmd="lingtex.tex.installRecommendedPackages">Install Recommended Packages</button>' : ''}
          </div>
        </details>
        <details>
          <summary><strong>Paste FLEx Interlinear</strong></summary>
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
          <summary><strong>Document Structure</strong></summary>
          <div class="help" style="margin:4px 0 8px;">Add a new sub-document and insert an \\input statement at the cursor. The path used will be relative to the main TeX file if configured, otherwise to the current file.</div>
          <div class="row">
            <button class="btn" id="btnAddSubDoc">Add Sub-Document</button>
          </div>
          <div class="help" style="margin:8px 0 4px;">Quick insert common structure commands. If text is selected, it will be wrapped; otherwise, the cursor is placed inside the braces/command.</div>
          <div class="row">
            <button class="btn" id="btnStructure">Structure...</button>
          </div>
          <div class="help">Tip: If LaTeX reports a missing package (e.g., cleveref, hyperref/url, biblatex), open the TeX Environment section above and run “Check Preamble Packages” to install.</div>
          <div class="help" style="margin:12px 0 4px;">Inline formatting commands</div>
          <div class="row">
            <button class="btn" id="btnFormatting">Formatting...</button>
          </div>
          <div class="help">Tip: For missing formatting packages (e.g., ulem, xcolor), open the TeX Environment section and run “Check Preamble Packages”.</div>

          <div class="help" style="margin:16px 0 4px;">Lists and numbered examples</div>
          <div class="row" style="gap:8px; align-items:center;">
            <select id="lists_select">
              <option value="itemize">Bulleted List – itemize</option>
              <option value="enumerate">Numbered List – enumerate</option>
              <option value="xlist">Numbered Sub-Examples – xlist (gb4e)</option>
              <option value="listExample">New List Example – exe + xlist (gb4e)</option>
              <option value="singleExample">Single Example – exe (gb4e)</option>
              <option value="listItem">List Item – \item</option>
            </select>
            <button class="btn" id="btnInsertListElem">Insert</button>
          </div>
          <div class="help">Tip: Examples use gb4e/langsci-gb4e. If missing, use TeX Environment → Install Recommended Packages.</div>
        </details>

        <details>
          <summary><strong>Paste Table</strong></summary>
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
        <details>
          <summary><strong>Insert Figure</strong></summary>
          <div class="help" style="margin:4px 0 8px;">
            Choose an image file, it will be copied into your workspace, and a \figure block will be inserted at your cursor.
          </div>
          <div class="help" style="margin:0 0 8px;">
            If LaTeX reports the figure is too large, adjust the \includegraphics options (e.g., width/height/keepaspectratio) until it fits. The compiler might fail to compile until you fix it. Configure the Main TeX file in Settings so image paths resolve relative to your master document. Quick reference: <a href="https://www.overleaf.com/learn/latex/Inserting_Images" target="_blank">Overleaf – Inserting Images</a>.
          </div>
          <div class="row">
            <label style="min-width:130px;">Caption:</label>
            <input type="text" id="figure_caption" placeholder="Figure caption" />
          </div>
          
          <div class="help" style="margin:0 0 8px;">
            Tip: The [H] float specifier requires <code>\\usepackage{float}</code> in your preamble.
          </div>
          <div class="row">
            <button class="btn" id="btnImportImageFigure">Choose Image and Insert</button>
          </div>
        </details>

        <!-- Hidden unfinished features: Excel / XLingPaper, Document Tools -->

        <details>
          <summary><strong>Settings</strong></summary>
          <div class="row">
            <label style="min-width:130px;">Folder:</label>
            <select id="ltx_folderSel">
              ${(state.folders||[]).map((f:any,idx:number)=>`<option value="${idx}" ${state.selectedFolderIndex===idx?'selected':''}>${this.escapeAttr(f.name)} — ${this.escapeAttr(f.path)}</option>`).join('')}
            </select>
          </div>
          <div class="row">
            <label style="min-width:130px;">Tables output dir:</label>
            <button class="btn" id="btnBrowseTablesOutputDir">Browse…</button>
          </div>
          <div class="row">
            <input type="text" id="tables_outputDir" value="${this.escapeAttr(state.tables_outputDir)}" disabled />
          </div>
          <div class="row">
            <label style="min-width:130px;">Figures output dir:</label>
            <button class="btn" id="btnBrowseFiguresOutputDir">Browse…</button>
          </div>
          <div class="row">
            <input type="text" id="figure_outputDir" value="${this.escapeAttr(state.figure_outputDir)}" disabled />
          </div>
          <div class="row">
            <label style="min-width:130px;">Main TeX file:</label>
            <button class="btn" id="btnBrowseMainTexFile">Browse…</button>
          </div>
          <div class="row">
            <input type="text" id="tex_mainFile" value="${this.escapeAttr(state.tex_mainFile)}" disabled />
          </div>
          <div class="row">
            <label style="min-width:130px;">Main output PDF:</label>
            <button class="btn" id="btnBrowseMainPdfFile">Browse…</button>
          </div>
          <div class="row">
            <input type="text" id="tex_mainPdf" value="${this.escapeAttr(state.tex_mainPdf)}" disabled />
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
            <input type="checkbox" id="preview_autoPreviewPane" ${state.preview_autoPreviewPane && state.tex_mainPdf ? 'checked' : ''} ${state.tex_mainPdf ? '' : 'disabled'} title="${state.tex_mainPdf ? 'Keeps main TeX top and main PDF bottom.' : 'Set “Main output PDF” to enable Auto-Preview.'}" />
            <label for="preview_autoPreviewPane" title="${state.tex_mainPdf ? 'Auto-Preview Pane' : 'Set “Main output PDF” to enable Auto-Preview.'}">Auto-Preview Pane</label>
          </div>
          <div class="help" style="margin:0 0 8px;">Keeps your main TeX open at the top and your main PDF open at the bottom. Non-PDF tabs are moved to the top.${state.tex_mainPdf ? '' : ' Set “Main output PDF” to enable Auto-Preview.'}</div>
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
          <div class="help" style="margin:0 0 8px;">Interlinear line spacing controls gloss lines; spacing before/after translation is auto-set to 50% of this value.</div>
          <div class="row" style="gap:8px;">
            <button class="btn" id="btnSaveAllSettings">Save All Settings</button>
            <button class="btn" id="btnResetDefaults">Reset Defaults</button>
          </div>
        </details>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          const getState = () => (vscode.getState() || {});
          const saveState = (partial) => {
            try { const cur = getState(); vscode.setState({ ...cur, ...partial }); } catch {}
          };
          const folderSel = document.getElementById('ltx_folderSel');
          if (folderSel) {
            folderSel.addEventListener('change', () => {
              const index = Number(folderSel.value || 0) || 0;
              vscode.postMessage({ type: 'selectFolder', index });
            });
          }
          document.querySelectorAll('[data-cmd]').forEach(btn => {
            btn.addEventListener('click', () => {
              const command = btn.getAttribute('data-cmd');
              let args = undefined;
              try { args = JSON.parse(btn.getAttribute('data-args')||''); } catch {}
              vscode.postMessage({ type: 'runCommand', command, args });
            });
          });
          const addLabel = document.getElementById('addLabel');
          const labelInput = document.getElementById('labelInput');
          addLabel.addEventListener('change', () => {
            labelInput.disabled = !addLabel.checked;
            if (!addLabel.checked) labelInput.value = '';
          });
          document.getElementById('btnImportImageFigure').addEventListener('click', () => {
            const caption = (document.getElementById('figure_caption').value || '').trim();
            vscode.postMessage({ type: 'importImageFigure', caption });
          });
          const btnAddSubDoc = document.getElementById('btnAddSubDoc');
          if (btnAddSubDoc) {
            btnAddSubDoc.addEventListener('click', () => {
              vscode.postMessage({ type: 'addSubDocument' });
            });
          }
          const btnInsertStructure = document.getElementById('btnInsertStructure');
          if (btnInsertStructure) {
            btnInsertStructure.addEventListener('click', () => {
              const sel = (document.getElementById('structure_select').value || 'section');
              saveState({ structure_select: sel });
              vscode.postMessage({ type: 'insertDocStructure', key: sel });
            });
          }
          const btnInsertListElem = document.getElementById('btnInsertListElem');
          if (btnInsertListElem) {
            btnInsertListElem.addEventListener('click', () => {
              const sel = (document.getElementById('lists_select').value || 'itemize');
              saveState({ lists_select: sel });
              vscode.postMessage({ type: 'insertListElement', key: sel });
            });
          }
          const btnApplyFormat = document.getElementById('btnApplyFormat');
          if (btnApplyFormat) {
            btnApplyFormat.addEventListener('click', () => {
              const sel = (document.getElementById('format_select').value || 'textbf');
              saveState({ format_select: sel });
              if (sel === 'textcolor') {
                const named = (document.getElementById('format_namedColor') && document.getElementById('format_namedColor').value) || '__custom';
                const hex = (document.getElementById('format_colorPicker') && document.getElementById('format_colorPicker').value) || '#ff0000';
                saveState({ format_namedColor: named, format_colorPicker: hex });
                if (named === '__custom') {
                  vscode.postMessage({ type: 'insertInlineFormat', key: sel, colorModel: 'HTML', colorValue: String(hex || '').replace(/^#/, '').toUpperCase() });
                } else {
                  vscode.postMessage({ type: 'insertInlineFormat', key: sel, colorModel: 'named', colorValue: String(named || 'red') });
                }
              } else {
                vscode.postMessage({ type: 'insertInlineFormat', key: sel });
              }
            });
          }
          const fmtSel = document.getElementById('format_select');
          const colorRow = document.getElementById('format_colorRow');
          const updateColorRow = () => {
            const v = (fmtSel && fmtSel.value) || 'textbf';
            if (colorRow) colorRow.style.display = (v === 'textcolor') ? 'flex' : 'none';
          };
          if (fmtSel) {
            fmtSel.addEventListener('change', updateColorRow);
            // restore UI state
            const st = getState();
            try {
              if (st && typeof st.format_select === 'string') fmtSel.value = st.format_select;
            } catch {}
            updateColorRow();
          }
          // restore structure dropdown
          try {
            const st = getState();
            const structSel = document.getElementById('structure_select');
            if (structSel && st && typeof st.structure_select === 'string') structSel.value = st.structure_select;
          } catch {}
          // restore lists dropdown
          try {
            const st = getState();
            const listsSel = document.getElementById('lists_select');
            if (listsSel && st && typeof st.lists_select === 'string') listsSel.value = st.lists_select;
          } catch {}
          // restore named/custom color options
          try {
            const st = getState();
            const namedEl = document.getElementById('format_namedColor');
            const hexEl = document.getElementById('format_colorPicker');
            if (namedEl && st && typeof st.format_namedColor === 'string') namedEl.value = st.format_namedColor;
            if (hexEl && st && typeof st.format_colorPicker === 'string') hexEl.value = st.format_colorPicker;
          } catch {}
          // save on changes
          const structSel = document.getElementById('structure_select');
          if (structSel) structSel.addEventListener('change', () => saveState({ structure_select: structSel.value }));
          const namedEl = document.getElementById('format_namedColor');
          if (namedEl) namedEl.addEventListener('change', () => saveState({ format_namedColor: namedEl.value }));
          const hexEl = document.getElementById('format_colorPicker');
          if (hexEl) hexEl.addEventListener('input', () => saveState({ format_colorPicker: hexEl.value }));
                    document.getElementById('btnBrowseTablesOutputDir').addEventListener('click', () => {
                      vscode.postMessage({ type: 'chooseFolder', key: 'lingtex.tables.outputDir' });
                    });
                    document.getElementById('btnBrowseFiguresOutputDir').addEventListener('click', () => {
                      vscode.postMessage({ type: 'chooseFolder', key: 'lingtex.figure.outputDir' });
                    });
                    document.getElementById('btnBrowseMainTexFile').addEventListener('click', () => {
                      vscode.postMessage({ type: 'chooseFile', key: 'lingtex.tex.mainFile' });
                    });
                    document.getElementById('btnBrowseMainPdfFile').addEventListener('click', () => {
                      vscode.postMessage({ type: 'chooseFile', key: 'lingtex.tex.mainPdf' });
                    });

                    window.addEventListener('message', (ev) => {
                      const msg = ev.data;
                      if (msg && msg.type === 'folderChosen' && typeof msg.key === 'string' && typeof msg.value === 'string') {
                        const id = msg.key.split('.').slice(1).join('_');
                        const el = document.getElementById(id);
                        if (el) el.value = msg.value;
                      }
                      if (msg && msg.type === 'fileChosen' && typeof msg.key === 'string' && typeof msg.value === 'string') {
                        const id = msg.key.split('.').slice(1).join('_');
                        const el = document.getElementById(id);
                        if (el) el.value = msg.value;
                      }
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
          // Removed individual save buttons; using Save All Settings instead.

          document.getElementById('btnSaveAllSettings').addEventListener('click', () => {
            const entries = {
              'lingtex.tables.outputDir': (document.getElementById('tables_outputDir').value || '').trim(),
              'lingtex.figure.outputDir': (document.getElementById('figure_outputDir').value || '').trim(),
              'lingtex.excel.outputLocation': (document.getElementById('excel_outputLocation').value || '').trim(),
              'lingtex.excel.filenameTemplate': (document.getElementById('excel_filenameTemplate').value || '').trim(),
              'lingtex.interlinear.beforeSkip': (document.getElementById('inter_beforeSkip').value || '').trim(),
              'lingtex.interlinear.afterSkip': (document.getElementById('inter_afterSkip').value || '').trim(),
              'lingtex.interlinear.useOpenup': !!(document.getElementById('inter_useOpenup').checked),
              'lingtex.interlinear.openupGlossAmount': (document.getElementById('inter_openupGlossAmount').value || '').trim(),
              'lingtex.tex.mainFile': (document.getElementById('tex_mainFile').value || '').trim(),
              'lingtex.tex.mainPdf': (document.getElementById('tex_mainPdf').value || '').trim(),
              'lingtex.preview.autoPreviewPane': ((document.getElementById('tex_mainPdf').value || '').trim() ? !!(document.getElementById('preview_autoPreviewPane').checked) : false),
            };
            vscode.postMessage({ type: 'updateSettings', entries });
          });
          document.getElementById('btnResetDefaults').addEventListener('click', () => {
            const entries = {
              'lingtex.tables.outputDir': '\${workspaceFolder}/misc/tables',
              'lingtex.figure.outputDir': '\${workspaceFolder}/misc/figures',
              'lingtex.excel.outputLocation': 'downloads',
              'lingtex.excel.filenameTemplate': '\${basename}-\${date}-\${time}',
              'lingtex.interlinear.beforeSkip': 'smallskip',
              'lingtex.interlinear.afterSkip': 'medskip',
              'lingtex.interlinear.useOpenup': true,
              'lingtex.interlinear.openupGlossAmount': '1em',
              'lingtex.tex.mainFile': '',
              'lingtex.tex.mainPdf': ''
              ,'lingtex.preview.autoPreviewPane': false
            };
            document.getElementById('tables_outputDir').value = entries['lingtex.tables.outputDir'];
            document.getElementById('figure_outputDir').value = entries['lingtex.figure.outputDir'];
            document.getElementById('excel_outputLocation').value = entries['lingtex.excel.outputLocation'];
            document.getElementById('excel_filenameTemplate').value = entries['lingtex.excel.filenameTemplate'];
            document.getElementById('inter_beforeSkip').value = entries['lingtex.interlinear.beforeSkip'];
            document.getElementById('inter_afterSkip').value = entries['lingtex.interlinear.afterSkip'];
            document.getElementById('inter_useOpenup').checked = entries['lingtex.interlinear.useOpenup'];
            document.getElementById('inter_openupGlossAmount').value = entries['lingtex.interlinear.openupGlossAmount'];
            document.getElementById('tex_mainFile').value = entries['lingtex.tex.mainFile'];
            document.getElementById('tex_mainPdf').value = entries['lingtex.tex.mainPdf'];
            document.getElementById('preview_autoPreviewPane').checked = entries['lingtex.preview.autoPreviewPane'];
            vscode.postMessage({ type: 'updateSettings', entries });
          });
        </script>
      </body>
      </html>
    `;
  }

  private getHtmlMissing(webview: vscode.Webview, state: any): string {
    const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'lingtex-icon.svg'));
    const style = `
      html, body { height: 100%; }
      body { font-family: var(--vscode-font-family); padding: 8px; height: 100vh; background: var(--vscode-sideBar-background); color: var(--vscode-foreground); }
      .logo { display:block; height: 95px; margin: 0 auto 6px; clip-path: inset(30% 0 25% 0); }
      .btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 8px; border-radius: 4px; }
      .btn:hover { background: var(--vscode-button-hoverBackground); }
      .help { color: var(--vscode-descriptionForeground); font-size: 12px; }
    `;
    const workshopLink = '<a href="https://marketplace.visualstudio.com/items?itemName=James-Yu.latex-workshop" target="_blank">LaTeX Workshop</a>';
    const utilitiesLink = '<a href="https://marketplace.visualstudio.com/items?itemName=tecosaur.latex-utilities" target="_blank">LaTeX Utilities</a>';
    const missingList = [ state.missing?.workshop ? workshopLink : '', state.missing?.utilities ? utilitiesLink : '' ].filter(Boolean).join(' · ');
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
        <h2>LingTeX — Setup Required</h2>
        <div class="help">To enable the full LingTeX panel, please install the recommended LaTeX extensions:</div>
        <div style="margin:10px 0;">${missingList}</div>
        <div style="display:flex; gap:8px; margin:8px 0;">
          ${state.missing?.workshop ? '<button class="btn" data-cmd="extension.open" data-args="[\"James-Yu.latex-workshop\"]">Open LaTeX Workshop in VS Code</button>' : ''}
          ${state.missing?.utilities ? '<button class="btn" data-cmd="extension.open" data-args="[\"tecosaur.latex-utilities\"]">Open LaTeX Utilities in VS Code</button>' : ''}
        </div>
        <div class="help" style="margin-top:10px;">After installing, reload the window to load the full UI.</div>
        <script>
          const vscode = acquireVsCodeApi();
          document.querySelectorAll('[data-cmd]').forEach(btn => {
            btn.addEventListener('click', () => {
              const command = btn.getAttribute('data-cmd');
              let args = undefined;
              try { args = JSON.parse(btn.getAttribute('data-args')||''); } catch {}
              vscode.postMessage({ type: 'runCommand', command, args });
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
    const halfOf = (amount: string): string | null => {
      const m = amount.match(/^\s*(-?\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s*$/);
      if (!m) return null;
      const num = parseFloat(m[1]);
      const unit = m[2];
      if (!isFinite(num)) return null;
      const half = Math.abs(num) * 0.5;
      const val = (half % 1 === 0) ? String(half) : String(half);
      return '-' + val + unit;
    };
    const openupBeforeTr = halfOf(openupGloss) || '-0.5em';
    const openupAfterTr = halfOf(openupGloss) || '-0.5em';
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
