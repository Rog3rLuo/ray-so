import { atom } from "jotai";
import { atomWithHash } from "jotai-location";

/**
 * What the frame renders. "code" keeps the original syntax-highlighted editor,
 * "markdown" renders the same text as a document.
 *
 * Persisted in the URL hash so a markdown document is shareable with the same
 * short-link flow as code (`ExportButton` -> `/api/shorten-url`).
 */
export type ContentType = "code" | "markdown";

export const contentTypeAtom = atomWithHash<ContentType>("type", "code", {
  serialize(value) {
    return value;
  },
  deserialize(value) {
    return value === "markdown" ? "markdown" : "code";
  },
});

/**
 * How the markdown workspace is laid out around the export frame.
 *
 * "split" shows the source pane beside the frame; "preview" gives the frame the
 * full width. There is no "source"-only mode on purpose: the frame is the export
 * boundary, and exporting raw markdown text is not a useful image.
 */
export type MarkdownViewMode = "split" | "preview";

export const markdownViewModeAtom = atomWithHash<MarkdownViewMode>("mdView", "split", {
  serialize(value) {
    return value;
  },
  deserialize(value) {
    return value === "preview" ? "preview" : "split";
  },
});

/** True while the source pane is on screen. */
export const showMarkdownSourceAtom = atom<boolean>((get) => get(markdownViewModeAtom) === "split");

export type MarkdownBodyFont = "sans" | "serif" | "mono";

export const markdownBodyFontAtom = atomWithHash<MarkdownBodyFont>("mdFont", "sans", {
  serialize(value) {
    return value;
  },
  deserialize(value) {
    return value === "serif" || value === "mono" ? value : "sans";
  },
});

/**
 * Han (Chinese) face, independent of the Latin body font: CSS font matching
 * falls through the Latin stack to this stack per glyph, so mixed paragraphs
 * pair any Latin face with any Han face. Follows Telari's prefs.fonts.han.
 * The emphasis faces key off this choice: song/kai bodies get heiti for
 * **bold** (宋体正文·黑体强调), hei bodies keep weight-based bold.
 */
export type MarkdownHanFont = "hei" | "song" | "kai";

export const markdownHanFontAtom = atomWithHash<MarkdownHanFont>("mdHan", "hei", {
  serialize(value) {
    return value;
  },
  deserialize(value) {
    return value === "song" || value === "kai" ? value : "hei";
  },
});

/** Monospace face for code (inline chips, fenced blocks, kbd, errors). */
export type MarkdownCodeFont = "jetbrains" | "sfmono" | "consolas";

export const markdownCodeFontAtom = atomWithHash<MarkdownCodeFont>("mdCodeFont", "jetbrains", {
  serialize(value) {
    return value;
  },
  deserialize(value) {
    return value === "sfmono" || value === "consolas" ? value : "jetbrains";
  },
});

export const markdownFontSizeAtom = atomWithHash<number>("mdSize", 15, {
  serialize(value) {
    return String(value);
  },
  deserialize(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 12 && parsed <= 24 ? parsed : 15;
  },
});

export const markdownLineHeightAtom = atomWithHash<number>("mdLeading", 1.7, {
  serialize(value) {
    return String(value);
  },
  deserialize(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 1.2 && parsed <= 2.4 ? parsed : 1.7;
  },
});

/**
 * Browser-level CJK typography. This is deliberately *not* a reimplementation of
 * Knuth-Plass: it only turns on the CSS features browsers expose
 * (`line-break: strict`, `text-spacing-trim`, `text-autospace`) and avoids
 * forcing justification, which is what actually degrades CJK in a browser.
 */
export const markdownCjkAtom = atomWithHash<boolean>("mdCjk", true, {
  serialize(value) {
    return String(value);
  },
  deserialize(value) {
    return value !== "false";
  },
});

/**
 * Paragraph alignment. Justified by default (the flush right edge Telari
 * produces), with `hyphens: auto` keeping greedy browser justification from
 * opening wide rivers in Latin text. "start" restores the ragged right.
 */
export type MarkdownAlign = "start" | "justify";

export const markdownAlignAtom = atomWithHash<MarkdownAlign>("mdAlign", "justify", {
  serialize(value) {
    return value;
  },
  deserialize(value) {
    return value === "start" ? "start" : "justify";
  },
});

/** Relative size of code (inline chips and fenced blocks) against body text. */
export const markdownCodeScaleAtom = atomWithHash<number>("mdCodeScale", 1, {
  serialize(value) {
    return String(value);
  },
  deserialize(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0.8 && parsed <= 1.3 ? parsed : 1;
  },
});

/**
 * Halfwidth punctuation policy (Telari prefs.punct), display-only.
 * "faithful" leaves the text alone; "fold" corrects halfwidth punctuation that
 * directly follows a Han character to its fullwidth form; "spacing" keeps the
 * halfwidth glyph but adds a thin space after it. Code is always untouched.
 */
export type MarkdownPunct = "faithful" | "fold" | "spacing";

export const markdownPunctAtom = atomWithHash<MarkdownPunct>("mdPunct", "faithful", {
  serialize(value) {
    return value;
  },
  deserialize(value) {
    return value === "fold" || value === "spacing" ? value : "faithful";
  },
});
