# LaTeX Stylesheets & Formatting for Linguistics Publishers

A reference guide to LaTeX templates, style files, and submission formatting requirements for major linguistics publishers and journals.

---

## Language Science Press (LangSci)

LangSci is the most LaTeX-friendly linguistics publisher. They strongly encourage authors to use LaTeX from the beginning, since all books are typeset in LaTeX.

**Templates available:**
- LaTeX skeletons for monographs, edited volumes, and individual papers in edited volumes — downloadable from their templates page. An Overleaf template is also available for papers in edited volumes.
- The GitHub repo `langsci/latex-skeletons` hosts the ready-to-use sources:
  - Monograph authors → `/skeleton/`
  - Volume editors → `/editedskeleton/`
  - Contributing chapter authors → `/paper/`
- Compile with: **XeLaTeX → biber → XeLaTeX**

**Style:**
- Authors must use their templates and follow the *Generic Style Rules for Linguistics*, supplemented by the LangSci house guidelines.
- LangSci uses **Libertine fonts**; a no-fonts skeleton is available if these can't be installed locally.
- BibTeX: use the `langscibook` document class with BibLaTeX/biber.
- Tools available: Word-to-LaTeX converter, plain-text-to-BibTeX converter, BibTeX normalizer, and a LaTeX sanity checker.

**Key URLs:**
- `langsci-press.org/templatesAndTools`
- `github.com/langsci/latex-skeletons`

---

## MIT Press — *Linguistic Inquiry*

*Linguistic Inquiry* (LI) does not require any particular file format for initial submission — Word or PDF is fine. However, once accepted, the manuscript must fully conform to the LI style sheet before production begins.

MIT Press provides three LaTeX macros for author use. Their use is strongly recommended but not required.

For bibliography formatting, the **`linquiry2.bst`** BibTeX style file (implementing the 1993 *Linguistic Inquiry* style) is widely used. Available via CTAN or Penn's linguistics resources page. Uses author-year natbib-style citations.

**Key URL:** `mitpress.mit.edu/latex-and-tex-guidelines/`

---

## MIT Press / ACL — *Computational Linguistics*

All submitted papers **must** be formatted in LaTeX. The style files are updated periodically:
- Current class: **`clv2025.cls`** (updated January 2025)
- Package includes: `COLI-manual.pdf`, `COLI-template.zip`, `compling.zip` (bibliography styling)

**Key URL:** `submissions.cljournal.org/index.php/cljournal/StyleGuide`

---

## *Journal of Linguistics* (Cambridge)

JL accepts both MS Word and LaTeX. For LaTeX, customised style files are available as "JL LaTeX Template Files."

- IPA symbols should be set in **Doulos SIL**.
- Full formatting to JL's style is only required after acceptance.
- Bibliography: uses `unified.bst` from CELXJ (Unified Style Sheet for Linguistics).

**Key URL:** `cambridge.org/core/journals/journal-of-linguistics/information/author-instructions/preparing-your-materials`

---

## LSA — *Language* & *Proceedings of the LSA* (PLSA)

The LSA's **Unified Style Sheet for Linguistics** (approved 2007) is the most widely used citation standard in the field — used by LangSci, JL, and many others. The `unified.bst` BibTeX style file implements it.

The official LaTeX template for PLSA (v2.4, updated May 2024):
- Uses **`sp.bst`** (Semantics and Pragmatics style, by Kai von Fintel)
- Meets LSA formatting requirements
- Uses natbib for author-date citations

**Key URL:** Overleaf gallery — `overleaf.com/latex/templates/tagged/langsci-press`; also the LSA submissions page.

---

## *Linguistics* (De Gruyter Mouton)

De Gruyter provides an official LaTeX template for *Linguistics: An Interdisciplinary Journal of the Language Sciences*:
- Uses the **`dgruyter.sty`** class
- Bibliography via BibLaTeX

Available via Overleaf.

---

## SIL PNG — *Data Papers on Papua New Guinea Languages*

An internal SIL-PNG series. Papers express the authors' knowledge at the time of writing, are not necessarily comprehensive treatments, and may contain preliminary analyses. SIL-PNG publishes them to make results on undescribed PNG languages available promptly. The series has 55+ published volumes, primarily from SIL-PNG field workers.

This series does **not** have a public LaTeX template or open submission process. The preferred format across SIL publications is **Microsoft Word** with the SIL template; LibreOffice and XLingPaper (exported to Word) are also acceptable. Authors must use the SIL Template with its paragraph and character styles.

For SIL PNG Data Papers specifically, contact the SIL-PNG branch directly (Ukarumpa, Eastern Highlands Province). No public LaTeX setup is documented.

---

## SIL Working Papers / SIL Electronic Working Papers

Similar to the Data Papers series — these are internal SIL publications. The preferred format across SIL publications is Microsoft Word with the SIL template. **XLingPaper** is also supported: an XML-based typesetting system that can export to Word or PDF, commonly used by SIL authors who want structured markup without full LaTeX.

---

## *Journal of Language, Culture, and Religion* (JLCR, Dallas International University)

JLCR is published bi-annually by Dallas International University (formerly GIAL). The managing editor is Todd Scacewater, and submissions go to him directly.

- Style guidelines posted at `diu.edu/JLCR`
- Follows a Chicago-adjacent author-date citation style (similar to the Unified Style Sheet)
- No LaTeX template is currently documented — submissions appear to be Word/PDF
- **Recommended:** Email the managing editor to confirm whether LaTeX is acceptable

---

## CanIL Electronic Working Papers (CanILEWP)

A student/alumni/staff publication of the Canada Institute of Linguistics, covering linguistics, translation, scripture use, literacy, language program design, and ethnography. Editorial team: Sean Allison, Rod Casali, Steve Nicolle.

- The **CanIL Style Guide (2019 edition)** draws on:
  - Unified Style Sheet for Linguistics
  - Generic Style Rules for Linguistics
  - *Language* style sheet (LSA)
  - *Journal of Linguistics* style guide
- Primarily Word-based; no LaTeX template is publicly documented
- For submissions, contact the editorial team through `canil.ca`

---

## Summary Table

| Publisher / Journal | LaTeX Support | Template / Style File |
|---|---|---|
| **LangSci Press** | Full — XeLaTeX required | `langscibook` class; GitHub + Overleaf |
| **Linguistic Inquiry (MIT)** | Recommended | MIT Press `.sty` macros; `linquiry2.bst` |
| **Computational Linguistics** | Required | `clv2025.cls` + `compling.bst` |
| **Journal of Linguistics** | Encouraged | JL LaTeX Template Files; `unified.bst` |
| **PLSA (LSA)** | Official template | Overleaf template v2.4; `sp.bst` |
| **Linguistics (De Gruyter)** | Supported | Overleaf; `dgruyter.sty` |
| **SIL (all series)** | Not standard | Word/XLingPaper preferred |
| **JLCR (DIU)** | Unknown / not documented | Contact managing editor |
| **CanILEWP (CanIL)** | Not documented | Word-based; CanIL Style Guide |

---

## Notes

- The **Unified Style Sheet for Linguistics** (`unified.bst`) is a safe default bibliography style for any venue that doesn't mandate something else.
- **XLingPaper** is the SIL ecosystem's structured alternative to LaTeX — worth learning if you publish frequently with SIL.
- For JLCR and CanILEWP, direct contact with editors is the most reliable path to confirming LaTeX acceptability.

---

*Compiled March 2026.*
