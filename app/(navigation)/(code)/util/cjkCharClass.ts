/*
 * Single source of truth for CJK character classification in the KP pipeline.
 *
 * Everything that behaves "per character" — kinsoku, hanging, autospace,
 * tokenization — must read from these tables. They were previously four
 * independently hand-maintained strings across two files and had already
 * drifted (duplicated glyphs, contradictory membership).
 *
 * Note on hanging eligibility: the renderer measures the actual trailing
 * blank (advance − ink right edge) per glyph, so this table may safely
 * over-include right-aligned glyphs (》」』) — their measured blank is ~0 and
 * they hang by nothing. The table answers "may hang", the metrics answer
 * "how much".
 */

/** CJK ideographs, kana, fullwidth forms and CJK punctuation blocks. */
const CJK_BLOCKS = "[\\u2e80-\\u2fdf\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\u3000-\\u303f\\uff01-\\uff60]";

/** May not start a line (避头): closing punctuation and similar. */
export const NO_BREAK_BEFORE = "，。；：？！、）》」』〉》”’％‰…‥．｡〕｝］﹚﹜";

/** May not end a line (避尾): opening punctuation and similar. */
export const NO_BREAK_AFTER = "（【「『〈《“‘〔［｛﹙﹘";

/**
 * Line-final glyphs whose trailing blank may hang past the measure. The
 * renderer measures the real blank per glyph, so left-inked punctuation gets
 * its full blank and right-inked glyphs (》」）) hang by ~0 — both correct.
 */
export const HANGABLE = "，。；：？！、）》」』〉》”’％‰…‥．｡〕｝］﹚﹜—～·";

/** CJK-context punctuation that must never be treated as Latin word material. */
export const CJK_PUNCT = "——…‥··–—―‐";

export const CJK_RE_SOURCE = CJK_BLOCKS;

/** Fullwidth/CJK punctuation blocks (，。；「」etc.) — not Han ideographs. */
const CJK_PUNCT_BLOCKS = "[\\u3000-\\u303f\\uff01-\\uff60]";

export function isCjkChar(ch: string): boolean {
  return new RegExp(CJK_RE_SOURCE).test(ch);
}

/**
 * True for CJK punctuation (fullwidth marks and the dash/ellipsis family).
 * Used to suppress autospace: 浏览器只在「汉字↔字母」之间给隙，标点边界不给。
 */
export function isCjkPunctChar(ch: string): boolean {
  if (!ch) return false;
  return CJK_PUNCT.includes(ch) || new RegExp(CJK_PUNCT_BLOCKS).test(ch);
}
