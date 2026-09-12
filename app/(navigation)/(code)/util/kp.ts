/*
 * Knuth–Plass line breaking for the export pipeline (the "path 2" alignment
 * with Telari's layout engine).
 *
 * Scope decisions:
 * - Pure module, no DOM: the caller tokenizes nothing — it passes styled runs
 *   plus a token-width table and a gap model; this file decides where lines
 *   break and how feasible each breaking was.
 * - Simplified TeX model: badness = 100·(slack/stretch)³ capped at the
 *   tolerance, demerits = (linePenalty + badness)², O(n²) DP over token
 *   positions — paragraphs are short enough that the optimal active-node list
 *   buys nothing.
 * - Kinsoku (avoid a line starting with closing punctuation or ending with
 *   opening punctuation) is a hard constraint on candidate breakpoints,
 *   matching `line-break: strict`.
 * - The last line may be ragged (badness 0 while it fits), like TeX's
 *   \parfillskip. Returns null when nothing fits within tolerance (long
 *   unbreakable chips): the caller then keeps the browser's own layout.
 */

import { NO_BREAK_BEFORE, NO_BREAK_AFTER } from "./cjkCharClass";

export type KpRun = {
  text: string;
  /** Inline elements (code chips, links) are atomic: never split internally. */
  element?: boolean;
};

export type KpTokenKind = "word" | "cjk" | "space" | "element";

export type KpToken = {
  runIndex: number;
  start: number;
  end: number;
  kind: KpTokenKind;
};

const CJK = /[\u2e80-\u2fdf\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f\uff01-\uff60\u2010-\u2015\u2025\u2026\u00b7]/;
const SPACE = /\s/;

export function isCjkChar(ch: string): boolean {
  return CJK.test(ch);
}

/** Splits styled runs into unbreakable tokens: Latin words / single CJK chars / spaces / elements. */
export function tokenize(runs: KpRun[]): KpToken[] {
  const tokens: KpToken[] = [];

  runs.forEach((run, runIndex) => {
    if (run.element) {
      // 原子元素即便没有文本也必须成 token（checkbox/img 的 textContent 为
      // 空）——否则 KP 重建时整个元素被静默丢弃
      tokens.push({ runIndex, start: 0, end: run.text.length, kind: "element" });
      return;
    }

    let i = 0;
    while (i < run.text.length) {
      const ch = run.text[i];

      if (SPACE.test(ch)) {
        let j = i + 1;
        while (j < run.text.length && SPACE.test(run.text[j])) j++;
        tokens.push({ runIndex, start: i, end: j, kind: "space" });
        i = j;
        continue;
      }

      if (CJK.test(ch)) {
        tokens.push({ runIndex, start: i, end: i + 1, kind: "cjk" });
        i += 1;
        continue;
      }

      let j = i + 1;
      while (j < run.text.length && !SPACE.test(run.text[j]) && !CJK.test(run.text[j])) j++;
      tokens.push({ runIndex, start: i, end: j, kind: "word" });
      i = j;
    }
  });

  return tokens;
}

export type KpGap = {
  /** Natural width of the gap between two adjacent tokens (px). May be
   * negative for 标点对压缩 (adjacent fullwidth punctuation overlap). */
  natural: number;
  /** Justification stretch available at this gap (px). */
  stretch: number;
  /** Compression available at this gap (px). */
  shrink: number;
  /**
   * Stretch priority order (renderer distributes slack lowest order first):
   * 1 = 词间空格, 2 = 中西自动间距, 3 = 汉字字间. Defaults to 3.
   */
  order?: 1 | 2 | 3;
};

export type KpOptions = {
  /** Width a justified line must fill (px). */
  lineWidth: number;
  /** Flat cost added per line; higher = flatter spacing across lines. */
  linePenalty?: number;
  /**
   * Badness above which a line is infeasible. Default 1500 ≈ a stretch ratio
   * of 2.47 — deliberately tighter than TeX's emergency 10000 so that a
   * paragraph the engine cannot set well returns null and the caller falls
   * back to the browser's layout instead of shipping gappy lines.
   */
  tolerance?: number;
  /**
   * How far a line-final glyph may hang past the measure (px). Fullwidth CJK
   * punctuation carries ~half an em of blank on its trailing side; letting
   * the box overflow by that amount flushes the *ink* with the text edge
   * (Telari's prefs.hangingPunct / punct_folds). The callback receives the
   * line's last token so styled runs (bold, kaiti) can measure with their
   * own face.
   */
  hang?: (lastChar: string, token: KpToken) => number;
  /**
   * 孤行惩罚：末行内容窄于该宽度（px）时记 1000 badness——DP 优先把末行的
   * 一两个字救回上一行（Telari 同款语义）；没有替代断点时仍可接受。
   */
  widowMinWidth?: number;
};

export type KpLine = {
  /** First token index of the line (inclusive). */
  start: number;
  /** Last token index of the line (inclusive). Trailing spaces render as nothing. */
  end: number;
};

const BADNESS_MAX = 10000;

export function kpBreak(
  runs: KpRun[],
  widths: number[],
  gapBetween: (a: KpToken, b: KpToken) => KpGap,
  options: KpOptions,
): KpLine[] | null {
  const { lineWidth, linePenalty = 10, tolerance = 1500, hang, widowMinWidth = 0 } = options;
  const tokens = tokenize(runs);
  const n = tokens.length;
  if (n === 0) return [];

  const textOf = (t: KpToken) => runs[t.runIndex].text.slice(t.start, t.end);

  // A break between token i and i+1 must respect kinsoku on both sides.
  const breakAllowedBefore = (j: number) => {
    if (j <= 0 || j >= n) return true;
    const prev = tokens[j - 1];
    const next = tokens[j];
    if (next.kind === "space") return true; // 行首空格渲染时裁掉，无禁忌
    const nextText = textOf(next);
    if (prev.kind === "space") {
      // 行尾空格也会被裁掉：真正的行首是 next 的首字符，避头规则仍然生效
      return !NO_BREAK_BEFORE.includes(nextText[0]);
    }
    const prevText = textOf(prev);
    if (NO_BREAK_AFTER.includes(prevText[prevText.length - 1])) return false;
    if (NO_BREAK_BEFORE.includes(nextText[0])) return false;
    return true;
  };

  // Gaps and prefix sums over consecutive token pairs.
  const gaps: KpGap[] = [];
  for (let i = 0; i + 1 < n; i++) gaps.push(gapBetween(tokens[i], tokens[i + 1]));
  const widthPrefix = [0];
  for (let i = 0; i < n; i++) widthPrefix.push(widthPrefix[i] + widths[i]);
  const naturalPrefix = [0];
  const stretchPrefix = [0];
  const shrinkPrefix = [0];
  for (let i = 0; i + 1 < n; i++) {
    naturalPrefix.push(naturalPrefix[i] + gaps[i].natural);
    stretchPrefix.push(stretchPrefix[i] + gaps[i].stretch);
    shrinkPrefix.push(shrinkPrefix[i] + gaps[i].shrink);
  }

  // Line content s..e where s walks forward over leading spaces and e walks
  // back over trailing spaces — neither renders any width at a line edge.
  const contentBounds = (j: number, i: number) => {
    let s = j;
    while (s <= i && tokens[s].kind === "space") s++;
    let e = i;
    while (e >= s && tokens[e].kind === "space") e--;
    return { s, e };
  };

  const badnessOf = (j: number, i: number): number => {
    const { s, e } = contentBounds(j, i);
    if (e < s) return i === n - 1 ? 0 : Infinity; // nothing but edge spaces

    // A line ending in fullwidth punctuation may hang its trailing blank past
    // the measure, so its usable width grows by the hang amount.
    const lastChar = textOf(tokens[e]).slice(-1);
    const hangWidth = hang ? hang(lastChar, tokens[e]) : 0;
    const effectiveWidth = lineWidth + hangWidth;

    let natural = widthPrefix[e + 1] - widthPrefix[s];
    let stretch = 0;
    let shrink = 0;
    if (e > s) {
      natural += naturalPrefix[e] - naturalPrefix[s];
      stretch = stretchPrefix[e] - stretchPrefix[s];
      shrink = shrinkPrefix[e] - shrinkPrefix[s];
    }

    const slack = effectiveWidth - natural;
    if (i === n - 1 && slack >= 0) {
      // ragged right is free — except 孤行: a non-first last line narrower
      // than widowMinWidth is infeasible, forcing the DP to pull the final
      // glyph(s) back onto the previous line. A single-line paragraph (j=0)
      // is exempt — there is nothing to rescue it with.
      if (j > 0 && natural < widowMinWidth) return BADNESS_MAX;
      return 0;
    }

    if (slack >= 0) {
      if (stretch <= 0) return slack > 0 ? BADNESS_MAX : 0;
      const ratio = slack / stretch;
      return Math.min(BADNESS_MAX, Math.round(100 * ratio * ratio * ratio));
    }

    // Overfull: only compressible overflow is acceptable. A line that still
    // overflows after using all its shrink (or has none) must not be
    // KP-rendered — the browser's own overflow handling is the fallback.
    if (shrink <= 0) return Infinity;
    const ratio = -slack / shrink;
    if (ratio > 1) return Infinity;
    return Math.round(100 * ratio * ratio * ratio);
  };

  // DP: best[i] = least demerits to lay out tokens 0..i as complete lines.
  const best: number[] = new Array(n).fill(Infinity);
  const prev: number[] = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      if (j > 0 && !breakAllowedBefore(j)) continue;
      const prevCost = j === 0 ? 0 : best[j - 1];
      if (!Number.isFinite(prevCost)) continue;

      const badness = badnessOf(j, i);
      if (badness > tolerance) continue;

      const demerits = prevCost + (linePenalty + badness) * (linePenalty + badness);
      if (demerits < best[i]) {
        best[i] = demerits;
        prev[i] = j;
      }
    }
  }

  if (!Number.isFinite(best[n - 1])) return null;

  // Reconstruct line ranges (end inclusive).
  const lines: KpLine[] = [];
  let cursor = n - 1;
  while (cursor >= 0) {
    const start = prev[cursor];
    lines.push({ start, end: cursor });
    cursor = start - 1;
  }
  lines.reverse();
  return lines;
}
