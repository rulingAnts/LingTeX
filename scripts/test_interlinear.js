// Quick test runner for preprocessMorphemeBreaks + renderer
function stripInvisible(s) {
  return s.replace(/[\u200E\u200F\u202A-\u202E]/g, '');
}

function preprocessMorphemeBreaks(tsvRaw) {
  const breakChars = new Set(['=', '.', '-']);
  const examples = tsvRaw.split(/\r?\n\s*\r?\n/);
  const processed = examples.map((block) => {
    const rows = block.split(/\r?\n/).filter((r) => r.trim().length > 0);
    if (rows.length === 0) return block;
    const cells = rows.map((r) => r.split('\t'));
    let morphemeRow = -1;
    let lexRow = -1;
    for (let i = 0; i < cells.length; i++) {
      const c0 = (cells[i][0] || '').trim().toLowerCase();
      const c1 = (cells[i][1] || '').trim().toLowerCase();
      if (c0.startsWith('morpheme') || c1.startsWith('morpheme') || c0.startsWith('morphemes') || c1.startsWith('morphemes')) morphemeRow = i;
      if (c0.startsWith('lex') || c1.startsWith('lex')) lexRow = i;
    }
    if (morphemeRow === -1 || lexRow === -1) return block;

    const mRow = cells[morphemeRow];
    const lRow = cells[lexRow];
    const mHasNum = /^\d+$/.test((mRow[0] || '').trim());
    const labelInSecond = (mRow[0] || '').trim() === '' && (mRow[1] || '').toLowerCase().startsWith('morpheme');
    const dataStart = mHasNum ? 2 : (labelInSecond ? 2 : 1);

    const mTokens = mRow.slice(dataStart).map((c) => (c || '').trim());
    const lTokens = lRow.slice(dataStart).map((c) => (c || '').trim());
    const maxLen = Math.max(mTokens.length, lTokens.length);
    while (mTokens.length < maxLen) mTokens.push('');
    while (lTokens.length < maxLen) lTokens.push('');

    const newM = [];
    const newL = [];
    for (let i = 0; i < maxLen; i++) {
      let curM = mTokens[i] || '';
      let curL = lTokens[i] || '';
      if (!curM && !curL) { newM.push(''); newL.push(''); continue; }
      const leadMatch = curM.match(/^([=\.\-]+)/);
      const trailMatch = curM.match(/([=\.\-]+)$/);
      const lead = leadMatch ? leadMatch[1] : null;
      const trail = trailMatch ? trailMatch[1] : null;
      if (lead && newM.length > 0) {
        newM[newM.length - 1] = (newM[newM.length - 1] || '') + curM;
        newL[newL.length - 1] = (newL[newL.length - 1] || '') + lead + curL;
        continue;
      }
      if (trail && i + 1 < maxLen) {
        const nextM = mTokens[i + 1] || '';
        const nextL = lTokens[i + 1] || '';
        newM.push(curM + nextM);
        newL.push((curL || '') + trail + (nextL || ''));
        i++; continue;
      }
      newM.push(curM);
      newL.push(curL);
    }

    const prefixRows = cells.map((r) => r.slice(0, dataStart));
    const outRows = cells.map((r, idx) => {
      const pre = prefixRows[idx] || [];
      if (idx === morphemeRow) return pre.concat(newM).join('\t');
      if (idx === lexRow) return pre.concat(newL).join('\t');
      return r.join('\t');
    });
    return outRows.join('\n');
  });
  return processed.join('\n\n');
}

function tokenizeTSVLine(line) {
  const normalizeCell = (s) => {
    const cleaned = stripInvisible(s).replace(/\u00A0/g, ' ').trim();
    if (!cleaned) return '~';
    return cleaned.replace(/ /g, '~');
  };
  return line.split('\t').map(normalizeCell);
}

function parseExamples(tsvRaw) {
  const lines = tsvRaw.split(/\r?\n/).map((l) => l.replace(/\u00A0/g, ' ').trimEnd());
  const filtered = lines.filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  const examples = [];
  let current = null;

  function pushCurrent() {
    if (current && Object.keys(current.tiers).length > 0) examples.push(current);
    current = null;
  }

  for (const raw of filtered) {
    const line = stripInvisible(raw).trim();
    if (!line) { pushCurrent(); continue; }
    const cols = tokenizeTSVLine(line);
    if (cols.length === 0) continue;

    const first = (cols[0] || '').toLowerCase();
    if (first.startsWith('free')) {
      if (!current) current = { tiers: {}, tierOrder: [], freeTranslations: [] };
      const lang = cols[0].slice(4).replace(/~/g, ' ').trim() || undefined;
      let text = '';
      const tabPos = raw.indexOf('\t');
      if (tabPos >= 0) {
        text = stripInvisible(raw.slice(tabPos + 1)).replace(/\u00A0/g, ' ').trim();
      } else {
        text = stripInvisible(raw.replace(/^\s*free\b.*?[:\-\s]+/i, '')).replace(/\u00A0/g, ' ').trim();
      }
      current.freeTranslations.push({ lang, text });
      pushCurrent();
      continue;
    }

    const startsWithNumber = /^\d+$/.test(cols[0]);
    let tierName;
    let values;
    if (startsWithNumber) {
      tierName = (cols[1] || 'Morphemes');
      values = cols.slice(2);
      if (!current) current = { number: cols[0], tiers: {}, tierOrder: [], freeTranslations: [] };
    } else {
      tierName = (cols[0] || 'Morphemes');
      values = cols.slice(1);
      if (!current) current = { tiers: {}, tierOrder: [], freeTranslations: [] };
    }

    current.tiers[tierName] = values;
    if (!current.tierOrder.includes(tierName)) current.tierOrder.push(tierName);
  }
  pushCurrent();
  return examples;
}

function getMaxAligned() { return Math.max(2, 5); }

function gatherAlignedLines(ex) {
  const normalize = (name) => (name || '').toLowerCase();
  const canonicalOrder = ['word', 'morphemes', 'lex. gloss', 'word gloss', 'word cat.', 'pos'];
  const orderedTiers = [];
  const seen = new Set();

  for (const c of canonicalOrder) {
    const match = ex.tierOrder.find((t) => normalize(t) === c);
    if (match && !seen.has(normalize(match))) {
      orderedTiers.push(match);
      seen.add(normalize(match));
    }
  }
  for (const t of ex.tierOrder) {
    const lower = normalize(t);
    if (lower.startsWith('free')) continue;
    if (seen.has(lower)) continue;
    orderedTiers.push(t);
    seen.add(lower);
  }

  const lines = [];
  for (const t of orderedTiers) {
    const toks = ex.tiers[t] || [];
    const nonEmpty = toks.some((v) => (v || '').toString().trim().length > 0);
    if (!nonEmpty) continue;
    lines.push(toks.join(' '));
  }
  return lines;
}

function renderGLLLines(ex) {
  const lines = gatherAlignedLines(ex);
  const n = lines.length;
  const maxAligned = getMaxAligned();
  const count = Math.max(2, Math.min(n, maxAligned));
  const gCmd = 'g' + 'l'.repeat(count);
  return { gCmd, lines: lines.slice(0, count) };
}

function renderGlt(ex) {
  if (!ex.freeTranslations.length) return null;
  const joined = ex.freeTranslations.map((f) => f.text).filter(Boolean).join(' ');
  const cleaned = joined.replace(/^\s*Free\b\s*/i, '').trim();
  return cleaned || null;
}

function latexEscape(s) {
  // Preserve any \gl{...} occurrences while escaping other special chars
  const placeholders = [];
  const marker = '<<<GLPH>>>';
  const tmp = s.replace(/(\\gl\{[^}]+\})/g, (m) => {
    placeholders.push(m);
    return marker + (placeholders.length - 1) + '<<<';
  });
  let escaped = tmp.replace(/([%$#&_{}])/g, '\\$1').replace(/\u00A0/g, ' ');
  escaped = escaped.replace(new RegExp(marker + '(\\d+)<<<', 'g'), (m, idx) => placeholders[Number(idx)]);
  return escaped;
}

function renderExampleN(ex) {
  const { gCmd, lines } = renderGLLLines(ex);
  const glt = renderGlt(ex);
  if (!lines.length) {
    const transOnly = glt ? `\\glt ${latexEscape(glt)}` : '';
    return transOnly || '% (no aligned interlinear lines)';
  }
  const head = `\\${gCmd} ${latexEscape(lines[0])} \\\\`;
  const rest = lines.slice(1).map((ln) => `${latexEscape(ln)} \\\\`).join('\n');
  const gllBlock = [head, rest].filter(Boolean).join('\n');
  const trans = glt ? `\\glt ${latexEscape(glt)}` : '';
  return [gllBlock.trimEnd(), trans].filter(Boolean).join('\n');
}

function asSingleExample(ex) {
  return [
    '\n% Single example',
    '\n\\begin{exe}',
    '\\ex % \\label{ex:KEY}',
    renderExampleN(ex),
    '\\end{exe}\\n'
  ].join('\n');
}

function runSample(name, tsv) {
  console.log('\n=== ' + name + ' ORIGINAL TSV ===\n');
  console.log(tsv);
  const pre = preprocessMorphemeBreaks(tsv);
  // apply morpheme-break merging
  console.log('\n=== PREPROCESSED TSV ===\n');
  console.log(pre);
  // apply grammatical-gloss wrapping (simulate setting ON)
  const wrapped = wrapGrammaticalGlosses(pre);
  console.log('\n=== WRAPPED TSV (\\gl{}) ===\n');
  console.log(wrapped);
  const exs = parseExamples(wrapped);
  console.log('\n=== PARSED EXAMPLES ===\n');
  console.log(JSON.stringify(exs, null, 2));
  console.log('\n=== LaTeX OUTPUT ===\n');
  if (exs.length === 1) console.log(asSingleExample(exs[0]));
  else console.log(exs.map((e,i)=>asSingleExample(e)).join('\n'));
}

const sample1 = `3\tWord\tkaɾatɛhi\tuː\tboɭako\tsoja\n\tWord Gloss\tat.the.Kara.river\ttree\tchop.down-real=COP\tsleep-while\n\u200EFree \u200EAt the Kara river, I chopped trees for a long time and then slept, and as I was doing that`;

const sample2 = `3\tWord\tkaɾatɛhi\t\t\tuː\tboɭako\t\t\tsoja\n\tMorphemes\tkaɾa\t=tɛ\t=hi\tuː\tboɭ\t-a\t=ko\tso\t=ja\n\tLex. Gloss\tKara\tLOC\tEXST.CMP\ttree\tchop.down\tCMP\tCOP\tsleep\tSIML\n\tWord Gloss\tat.the.Kara.river\t\t\t\ttree\tchop.down-real=COP\t\t\t\tsleep-while\n\u200EFree \u200EAt the Kara river, I chopped trees for a long time and then slept, and as I was doing that`;

const sample3 = `3\tMorphemes\tkaɾa\t=tɛ\t=hi\tuː\tboɭ\t-a\t=ko\tso\t=ja\n\tLex. Gloss\tKara\tLOC\tEXST.CMP\ttree\tchop.down\tCMP\tCOP\tsleep\tSIML\n\u200EFree \u200EAt the Kara river, I chopped trees for a long time and then slept, and as I was doing that`;

runSample('Sample 1 (original simple)', sample1);
runSample('Sample 2 (with morphemes & lex gloss)', sample2);
runSample('Sample 3 (morphemes only + lex gloss)', sample3);

const sample4 = `3\tMorphemes\tpa\t=mi\t\n\tLex. Gloss\tDEM\t2SG\t\n\u200EFree \u200EExample with 2SG`;
runSample('Sample 4 (test 2SG wrapping)', sample4);

function wrapGrammaticalGlosses(tsvRaw) {
  // Wrap all-uppercase abbreviation parts in Lex. Gloss rows with \gl{...}
  const lines = tsvRaw.split(/\r?\n/);
  const out = [];
  const isAllUpper = (s) => /^[A-Z0-9]+$/.test(s);
  for (const raw of lines) {
    const cols = raw.split('\t');
    const first = (cols[0] || '').toLowerCase();
    const second = (cols[1] || '').toLowerCase();
    const isLexLine = ((first || '').includes('lex') && (first || '').includes('gloss')) || ((second || '').includes('lex') && (second || '').includes('gloss'));
    if (!isLexLine) { out.push(raw); continue; }

    const mHasNum = /^\d+$/.test((cols[0] || '').trim());
    const labelInSecond = (cols[0] || '').trim() === '' && (cols[1] || '').toLowerCase().includes('lex');
    const dataStart = mHasNum ? 2 : (labelInSecond ? 2 : 1);

    const prefix = cols.slice(0, dataStart);
    const data = cols.slice(dataStart).map((c) => (c || '').trim());
    const wrappedData = data.map((cell) => {
      if (!cell) return cell;
      // split on separators but keep them
      const parts = cell.split(/([=.\-])/);
      return parts.map((p) => isAllUpper(p) ? `\\gl{${p.toLowerCase()}}` : p).join('');
    });
    out.push(prefix.concat(wrappedData).join('\t'));
  }
  return out.join('\n');
}
