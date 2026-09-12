/*
 * Export-time Knuth–Plass layout (the browser preview stays untouched).
 *
 * Before `toPng`/`toSvg` runs, every justified paragraph inside the frame is
 * re-laid out: the engine picks the breakpoints, text nodes are split so each
 * token owns a node, and each line becomes a block whose inter-token gaps are
 * explicit spacer spans of exact pixel width — so a justified line fills its
 * measure exactly, the way Telari's engine does, instead of the browser's
 * greedy word-spacing stretch. The returned function restores the original
 * DOM and must be called once the capture promise settles.
 *
 * Paragraphs are skipped (left to the browser) when they contain KaTeX/SVG,
 * when the engine finds no feasible breaking (long unbreakable chips), or
 * when they are not justified in the first place.
 */

import { kpBreak, tokenize, type KpGap, type KpRun, type KpToken } from "./kp";
import { HANGABLE, NO_BREAK_BEFORE, isCjkPunctChar } from "./cjkCharClass";

type TextEntry = { kind: "text"; node: Text; font: string };
type ElementEntry = { kind: "element"; node: HTMLElement; font: string };
type Entry = TextEntry | ElementEntry;

const UNSPLITTABLE = ".katex, svg";

function collectEntries(root: HTMLElement): Entry[] | null {
  const entries: Entry[] = [];

  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        // Tokens inside strong/em/a use a different face than the paragraph;
        // measuring them with the paragraph font drifts several px per run —
        // the source of "some lines hang, some don't" instability.
        const parent = (node as Text).parentElement;
        const cs = parent ? getComputedStyle(parent) : null;
        const font = cs ? `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}` : "";
        entries.push({ kind: "text", node: node as Text, font });
      }
      return true;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return true;

    const el = node as HTMLElement;
    if (el.matches(UNSPLITTABLE)) return false;

    // Images, inline code and form controls participate as atomic boxes.
    if (el.tagName === "CODE" || el.tagName === "KBD" || el.tagName === "IMG" || el.tagName === "INPUT") {
      const ecs = getComputedStyle(el);
      entries.push({
        kind: "element",
        node: el,
        font: `${ecs.fontStyle} ${ecs.fontWeight} ${ecs.fontSize} ${ecs.fontFamily}`,
      });
      return true;
    }

    for (const child of Array.from(el.childNodes)) {
      if (!walk(child)) return false;
    }
    return true;
  };

  return walk(root) ? entries : null;
}

const CJK_RE = /[\u2e80-\u2fdf\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
// Note: fullwidth punctuation is handled through isCjkPunctChar, so that
// 「汉↔标点」边界不算 autospace 而「标点↔Latin」也不算。

const isCjkText = (t: KpToken, runs: KpRun[]) => {
  const text = runs[t.runIndex].text.slice(t.start, t.end);
  return text ? CJK_RE.test(text[0]) : false;
};

/*
 * Gap model (TeX-flavoured):
 * - order 1 词间空格: stretches first when the line is loose; never shrinks
 *   (the space token's advance is fixed — D22).
 * - order 2 中西自动间距: the 1/8em CJK↔Latin gap; stretches second and is
 *   the ONLY compressible glue (spacer width can reach 0).
 * - order 3 汉字字间: stretches last; no shrink (natural 0 — a spacer cannot
 *   render negative width, so compression here is unfakeable, D22).
 * - 标点对压缩 (B2): adjacent fullwidth closing punctuation overlap by 1/4em
 *   — negative natural, rendered as a negative margin on the right glyph.
 *   This replaces the disabled native `text-spacing-trim`.
 */
function makeGapFn(runs: KpRun[], fontSize: number) {
  return (a: KpToken, b: KpToken): KpGap => {
    if (a.kind === "space" || b.kind === "space") {
      return { natural: 0, stretch: fontSize / 6, shrink: 0, order: 1 };
    }
    const lastA = runs[a.runIndex].text.slice(a.start, a.end).slice(-1);
    const firstB = runs[b.runIndex].text.slice(b.start, b.end).slice(0, 1);
    const aPunct = isCjkPunctChar(lastA);
    const bPunct = isCjkPunctChar(firstB);

    if (aPunct && bPunct && HANGABLE.includes(firstB)) {
      return { natural: -fontSize / 4, stretch: 0, shrink: 0, order: 1 };
    }

    const aHan = CJK_RE.test(lastA) && !aPunct;
    const bHan = CJK_RE.test(firstB) && !bPunct;
    const latinA = a.kind === "element" || !(CJK_RE.test(lastA) || aPunct);
    const latinB = b.kind === "element" || !(CJK_RE.test(firstB) || bPunct);

    // 二阶：text-autospace 的中西间隙（汉字↔字母；标点边界无隙）
    if ((aHan && latinB) || (bHan && latinA)) {
      const natural = fontSize / 8;
      return { natural, stretch: fontSize / 4, shrink: Math.min(fontSize / 8, natural), order: 2 };
    }

    // 三阶：汉字字间
    return { natural: 0, stretch: fontSize / 4, shrink: 0, order: 3 };
  };
}

function splitTextNodes(entries: Entry[], runs: KpRun[], tokens: KpToken[]): (Node | null)[] {
  // Split each text node at its token boundaries so every token owns exactly
  // one dedicated node (single-use when reassembling lines). `splitText`
  // returns the tail; the head stays in the current node.
  const nodeForToken: (Node | null)[] = new Array(tokens.length).fill(null);

  entries.forEach((entry, runIndex) => {
    const runTokens = tokens
      .map((t, index) => ({ t, index }))
      .filter(({ t }) => t.runIndex === runIndex);

    if (entry.kind === "element") {
      runTokens.forEach(({ index }) => {
        nodeForToken[index] = entry.node;
      });
      return;
    }

    let current: Text = entry.node;
    runTokens.forEach(({ t, index }, idx) => {
      const length = t.end - t.start;
      if (idx === 0 && t.start > 0) {
        current = current.splitText(t.start); // drop the head before the first token
      }
      // `current` now begins exactly at this token's start
      if (current.length > length) {
        const rest = current.splitText(length);
        nodeForToken[index] = current;
        current = rest;
      } else {
        // exact fit: this token consumed the node to its end
        nodeForToken[index] = current;
      }
    });
  });

  return nodeForToken;
}

/**
 * Slack distribution across a line's gaps. Positive slack (stretch) fills by
 * priority order — 词间空格 first, then 中西自动间距, then 汉字字间 — each
 * order up to its capacity, with any excess spread proportionally over all
 * gaps. Negative slack (compression) only touches gaps that can actually
 * render negative width (their shrink ≤ natural).
 */
function computeShares(gaps: KpGap[], slack: number): number[] {
  const shares = gaps.map(() => 0);
  if (slack === 0) return shares;

  if (slack > 0) {
    let remaining = slack;
    for (const order of [1, 2, 3] as const) {
      const members = gaps.map((g, gi) => ({ g, gi })).filter(({ g }) => (g.order ?? 3) === order && g.stretch > 0);
      const capacity = members.reduce((sum, { g }) => sum + g.stretch, 0);
      if (capacity <= 0 || remaining <= 0) continue;
      const give = Math.min(remaining, capacity);
      members.forEach(({ g, gi }) => {
        shares[gi] = give * (g.stretch / capacity);
      });
      remaining -= give;
    }
    if (remaining > 0.05) {
      const totalStretch = gaps.reduce((sum, g) => sum + g.stretch, 0);
      if (totalStretch > 0) {
        gaps.forEach((g, gi) => {
          shares[gi] += remaining * (g.stretch / totalStretch);
        });
      }
    }
    return shares;
  }

  // compression: only gaps whose shrink ≤ natural can render it
  const compressible = gaps.map((g, gi) => ({ g, gi })).filter(({ g }) => g.shrink > 0);
  const totalShrink = compressible.reduce((sum, { g }) => sum + g.shrink, 0);
  if (totalShrink <= 0) return shares;
  compressible.forEach(({ g, gi }) => {
    shares[gi] = -((-slack) * (g.shrink / totalShrink));
  });
  return shares;
}

/**
 * Re-lays out justified paragraphs with the KP engine. Returns a restore
 * function; call it after the capture finishes.
 */
export function applyKpLayout(frame: HTMLElement): () => void {
  const restoreFns: Array<() => void> = [];

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  frame.querySelectorAll<HTMLElement>("p, li").forEach((p) => {
    // loose lists emit li > p: processing both would double-hit; the inner p
    // carries the real styles, so it wins and the li is left to the browser.
    if (p.tagName === "LI" && p.querySelector("p")) return;
    if (getComputedStyle(p).textAlign !== "justify") return;
    if (p.querySelector("ul, ol")) return; // nested lists: keep browser layout
    if (!ctx) return;

    const entries = collectEntries(p);
    if (!entries || entries.length === 0) return;

    const cs = getComputedStyle(p);
    const fontSize = parseFloat(cs.fontSize) || 15;


    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${fontSize}px ${cs.fontFamily}`;
    const measure = (text: string, font?: string) => {
      if (font) ctx!.font = font;
      return ctx!.measureText(text).width;
    };

    // Exact content-box width (clientWidth rounds to integers; the budget and
    // the rendered line box are both fractional).
    const pRect = p.getBoundingClientRect();
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const lineWidthExact = pRect.width - padX;

    const runs: KpRun[] = entries.map((entry) =>
      entry.kind === "element"
        ? { text: entry.node.textContent || "", element: true }
        : { text: entry.node.textContent || "" },
    );

    const tokens = tokenize(runs);
    if (tokens.length === 0) return;

    const widths = tokens.map((t) => {
      const entry = entries[t.runIndex];
      if (entry.kind === "element") return entry.node.getBoundingClientRect().width;
      return measure(runs[t.runIndex].text.slice(t.start, t.end), entry.font || undefined);
    });

    /*
     * Ink-exact hang (Telari's punct_folds): a fullwidth glyph's trailing
     * blank is advance − ink right edge, measured per character with the
     * paragraph's own font. 「。」hangs ~0.55em, 「，」~0.6em, 「：」 less —
     * this is what flushes the ink with the text edge instead of a flat
     * half-em guess. Capped at 0.75em for fonts with odd metrics. Shared by
     * the break decision AND the spacer distribution so both agree.
     */
    const hangOf = (ch: string, font?: string): number => {
      if (!HANGABLE.includes(ch)) return 0;
      if (font) ctx.font = font;
      const m = ctx.measureText(ch);
      const blank = m.width - m.actualBoundingBoxRight;
      return Math.max(0, Math.min(blank, fontSize * 0.75));
    };

    const lines = kpBreak(runs, widths, makeGapFn(runs, fontSize), {
      lineWidth: lineWidthExact,
      hang: (ch, token) => {
        const entry = entries[token.runIndex];
        return hangOf(ch, entry.kind === "text" ? entry.font : undefined);
      },
    });
    if (!lines || lines.length === 0) return;

    const savedHtml = p.innerHTML;
    const savedStyle = p.getAttribute("style");

    try {
      const nodeForToken = splitTextNodes(entries, runs, tokens);

      const doc = p.ownerDocument;
      p.textContent = "";

      // Corrections must run AFTER the lines are attached to the live document
      // (a detached subtree has no layout — its rects read as zero, which
      // would blow the whole measure into one spacer).
      const corrections: Array<{
        lineEl: HTMLElement;
        lastSpacer: HTMLElement | null;
        lastItem: HTMLElement | null;
        spacerRefs: Array<{ el: HTMLElement; weight: number }>;
        target: number;
        squeeze: number;
      }> = [];

      lines.forEach((line, lineIndex) => {
        const isLast = lineIndex === lines.length - 1;
        const lineEl = doc.createElement("span");
        /*
         * Flex line box: nowrap makes a second visual row STRUCTURALLY
         * impossible (the old inline-flow renderer could soft-wrap inside the
         * line block whenever the content grazed the measure), and
         * flex-shrink: 0 on every item forbids the browser from squeezing
         * items back into the measure. Overflow is measurable and hangs
         * cleanly instead of collapsing.
         */
        lineEl.style.display = "flex";
        lineEl.style.flexWrap = "nowrap";
        lineEl.style.alignItems = "baseline";
        lineEl.style.width = "100%";

        // tokens with edge spaces trimmed (they render nothing)
        let s = line.start;
        while (s <= line.end && tokens[s].kind === "space") s++;
        let e = line.end;
        while (e >= s && tokens[e].kind === "space") e--;

        let lastSpacer: HTMLElement | null = null;
        const spacerRefs: Array<{ el: HTMLElement; weight: number }> = [];

        if (e >= s) {
          let natural = 0;
          let stretch = 0;
          let shrink = 0;
          const gaps: KpGap[] = [];
          for (let i = s; i <= e; i++) {
            natural += widths[i];
            if (i > s) {
              const g = makeGapFn(runs, fontSize)(tokens[i - 1], tokens[i]);
              gaps.push(g);
              natural += g.natural;
              stretch += g.stretch;
              shrink += g.shrink;
            }
          }

          /*
           * The spacers must fill the SAME budget the engine broke against:
           * lineWidth plus the hang amount when the line ends in punctuation.
           * Non-hanging lines keep target = lineWidth.
           */
          const lastChar = runs[tokens[e].runIndex].text.slice(tokens[e].start, tokens[e].end).slice(-1);
          const lastEntry = entries[tokens[e].runIndex];
          const lastEntryFont = lastEntry.font;
          const hangWidth = hangOf(lastChar, lastEntryFont);
          const target = lineWidthExact + hangWidth;
          const slack = target - natural;
          const isJustified = !isLast && slack !== 0;
          const shares = computeShares(gaps, isJustified ? slack : 0);

          // 挤压 for the paragraph-final glyph (Telari squeezes the last line
          // too): pull the box end to the ink right edge by hanging the
          // trailing blank. The glyph keeps its full shape.
          const squeezeBlank = isLast && hangWidth > 0 ? hangWidth : 0;

          const lastItemRef: { current: HTMLElement | null } = { current: null };
          const appendItem = (node: Node) => {
            if (node instanceof HTMLElement) {
              // flex item: never let the browser squeeze or wrap it
              node.style.flex = "0 0 auto";
              if (node.tagName === "IMG") {
                // `.image` is display:block in the preview; inside a KP line
                // the image flows as an atomic box (undone by the innerHTML
                // restore after export).
                node.style.display = "inline-block";
                node.style.alignSelf = "center";
              }
            }
            if (node instanceof HTMLElement) lastItemRef.current = node;
            lineEl.appendChild(node);
          };

          let gapIndex = 0;
          for (let i = s; i <= e; i++) {
            let marginLeft = 0;
            if (i > s) {
              const g = gaps[gapIndex++];
              const share = shares[gapIndex - 1] || 0;
              const w = g.natural + share;
              if (g.natural < 0) {
                // 标点对压缩: the gap is negative — realized as a negative
                // left margin on the right glyph (a spacer cannot render
                // negative width)
                marginLeft = g.natural;
              } else {
                const spacer = doc.createElement("span");
                spacer.style.flex = "0 0 auto";
                spacer.style.width = `${Math.max(0, w).toFixed(2)}px`;
                lineEl.appendChild(spacer);
                lastSpacer = spacer;
                spacerRefs.push({ el: spacer, weight: g.stretch });
              }
            }

            const node = nodeForToken[i];
            if (!node) continue;
            if (node.nodeType === Node.TEXT_NODE) {
              // text tokens get their own flex item so flex-shrink: 0 is
              // expressible (raw text nodes would become anonymous items)
              const item = doc.createElement("span");
              item.style.flex = "0 0 auto";
              item.style.whiteSpace = "pre";
              if (marginLeft) item.style.marginLeft = `${marginLeft.toFixed(2)}px`;
              item.appendChild(node);
              appendItem(item);
            } else {
              if (marginLeft) (node as HTMLElement).style.marginLeft = `${marginLeft.toFixed(2)}px`;
              appendItem(node);
            }
          }

          /*
           * Trailing-space correction pass: canvas measurement and DOM
           * rendering drift by a fraction of a px per run (kerning, feature
           * synthesis). Measure the finished line and absorb the whole
           * residual into the last spacer so the line lands exactly on its
           * budget — drift can no longer accumulate across the line. Executed
           * after attachment (see `corrections`).
           */
          if (squeezeBlank > 0 && lastItemRef.current) {
            lastItemRef.current.style.marginRight = `-${squeezeBlank.toFixed(2)}px`;
          }

          if (isJustified || squeezeBlank > 0) {
            corrections.push({
              lineEl,
              lastSpacer,
              lastItem: lastItemRef.current,
              spacerRefs,
              target: isJustified ? target : natural,
              squeeze: squeezeBlank,
            });
          }
        }

        p.appendChild(lineEl);
      });

      corrections.forEach(({ lineEl, lastSpacer, spacerRefs, target, squeeze }) => {
        if (!lastSpacer) return;
        const range = doc.createRange();
        range.selectNodeContents(lineEl);
        // squeezed lines end at (content − blank): correct against the ink
        // edge, not the box edge.
        const actual = range.getBoundingClientRect().width - squeeze;
        const drift = target - squeeze - actual;
        if (Math.abs(drift) <= 0.05) return;

        // B5: absorb the residual across all stretchable gaps by weight —
        // dumping it into the last spacer was warping the gap before 行尾标点
        const totalWeight = spacerRefs.reduce((sum, ref) => sum + ref.weight, 0);
        if (totalWeight <= 0) return;
        spacerRefs.forEach((ref) => {
          const current = parseFloat(ref.el.style.width);
          ref.el.style.width = `${Math.max(0, current + (drift * ref.weight) / totalWeight).toFixed(2)}px`;
        });
      });

      p.style.setProperty("text-align", "left");
      p.style.setProperty("text-autospace", "no-autospace");
      p.style.setProperty("text-spacing-trim", "none");
    } catch {
      // any failure: put the paragraph back exactly as it was
      p.innerHTML = savedHtml;
      if (savedStyle === null) p.removeAttribute("style");
      else p.setAttribute("style", savedStyle);
      return;
    }

    restoreFns.push(() => {
      p.innerHTML = savedHtml;
      if (savedStyle === null) p.removeAttribute("style");
      else p.setAttribute("style", savedStyle);
    });
  });

  return () => restoreFns.forEach((restore) => restore());
}

export type KpAuditIssue = {
  paragraph: number;
  line: number;
  kind: "wrapped" | "underfull" | "overhang" | "kinsoku";
  delta: number;
};

/**
 * The alignment invariants, as a checkable contract rather than a screenshot
 * comparison:
 *  1. no KP line internally wraps (block height stays at one line);
 *  2. every non-final line's content lands on its budget — within `tolerance`
 *     of the measure for regular lines, up to ~0.75em past it for hanging
 *     punctuation lines (never short of it);
 *  3. the final line is unconstrained (ragged right).
 */
export function auditKpAlignment(frame: HTMLElement, tolerance = 1): { checked: number; issues: KpAuditIssue[] } {
  const issues: KpAuditIssue[] = [];
  let checked = 0;

  frame.querySelectorAll<HTMLElement>("p, li").forEach((p, pi) => {
    // KP-rendered paragraphs carry inline text-align:left (the flex lines
    // justify themselves), so the gate is the presence of KP line spans —
    // not the computed text-align.
    const lines = Array.from(p.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el.tagName === "SPAN" && el.style.display === "flex");
    if (lines.length === 0) return;
    const cs = getComputedStyle(p);
    const fontSize = parseFloat(cs.fontSize) || 15;
    const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.7;
    // tolerance scales with the type size (1px at 12px type is 8% — sloppy)
    const tol = Math.max(1, fontSize * 0.08);
    // exact content-box measure instead of the integer clientWidth
    const pRect = p.getBoundingClientRect();
    const measure = pRect.width - (parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight));

    lines.forEach((line, li) => {
      checked += 1;
      const isLast = li === lines.length - 1;

      const hasImage = !!line.querySelector("img");
      const height = line.getBoundingClientRect().height;
      if (!hasImage && height > lineHeight * 1.6) {
        issues.push({ paragraph: pi, line: li, kind: "wrapped", delta: Math.round(height - lineHeight) });
      }
      if (isLast) return;

      // kinsoku invariant: no line may START with closing punctuation
      const firstText = (line.textContent || "").slice(0, 1);
      if (firstText && NO_BREAK_BEFORE.includes(firstText)) {
        issues.push({ paragraph: pi, line: li, kind: "kinsoku", delta: 0 });
      }

      const range = document.createRange();
      range.selectNodeContents(line);
      const right = range.getBoundingClientRect().right;
      const delta = Math.round((right - pRect.left - measure) * 100) / 100;

      if (delta < -tol) {
        issues.push({ paragraph: pi, line: li, kind: "underfull", delta });
      } else if (delta > fontSize * 0.8) {
        // lines ending in hangable punctuation intentionally overflow by the
        // glyph's trailing blank — that is the feature, not a defect
        const lastCh = (line.textContent || "").slice(-1);
        if (!HANGABLE.includes(lastCh)) {
          issues.push({ paragraph: pi, line: li, kind: "overhang", delta });
        }
      }
    });
  });

  return { checked, issues };
}
