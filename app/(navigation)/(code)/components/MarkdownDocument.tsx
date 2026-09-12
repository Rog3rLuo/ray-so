"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import classNames from "classnames";

import MarkdownPreview from "./MarkdownPreview";
import styles from "./Markdown.module.css";
import documentStyles from "./MarkdownDocument.module.css";
import { codeAtom } from "../store/code";
import { themeCSSAtom } from "../store/themes";
import { useKpJustifiedLayout } from "../util/useKpPreview";
import {
  markdownAlignAtom,
  markdownBodyFontAtom,
  markdownCjkAtom,
  markdownCodeFontAtom,
  markdownCodeScaleAtom,
  markdownFontSizeAtom,
  markdownHanFontAtom,
  markdownLineHeightAtom,
  markdownPunctAtom,
} from "../store/content";

const FONT_CLASS = {
  sans: styles.fontSans,
  serif: styles.fontSerif,
  mono: styles.fontMono,
} as const;

const HAN_CLASS = {
  hei: styles.hanHei,
  song: styles.hanSong,
  kai: styles.hanKai,
} as const;

const CODE_FONT_STACKS = {
  jetbrains: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  sfmono: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, monospace',
  consolas: '"Consolas", "Courier New", ui-monospace, monospace',
} as const;

/**
 * The markdown document as it appears inside the export frame.
 *
 * `themeCSS` has to be re-applied here: it is otherwise attached only to the code
 * editor's root element, so every `--ray-*` variable the document styles read
 * would be undefined in markdown mode.
 */
const MarkdownDocument: React.FC = () => {
  const source = useAtomValue(codeAtom);
  const themeCSS = useAtomValue(themeCSSAtom);
  const bodyFont = useAtomValue(markdownBodyFontAtom);
  const fontSize = useAtomValue(markdownFontSizeAtom);
  const lineHeight = useAtomValue(markdownLineHeightAtom);
  const cjk = useAtomValue(markdownCjkAtom);
  const align = useAtomValue(markdownAlignAtom);
  const codeScale = useAtomValue(markdownCodeScaleAtom);
  const punct = useAtomValue(markdownPunctAtom);
  const hanFont = useAtomValue(markdownHanFontAtom);
  const codeFont = useAtomValue(markdownCodeFontAtom);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  // Bumped when images load or web fonts arrive: both change token widths and
  // would otherwise leave stale KP lines that never self-heal.
  const [mediaVersion, setMediaVersion] = useState(0);

  // Frame width changes (resize, padding, view mode) re-trigger the KP layout.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      setContainerWidth(Math.round(entries[0].contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const bump = () => setMediaVersion((v) => v + 1);
    window.addEventListener("kp-media-loaded", bump);
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(bump).catch(() => {});
    }
    return () => window.removeEventListener("kp-media-loaded", bump);
  }, []);

  /*
   * Unified rendering: every layout-version change REMOUNTS the markdown
   * subtree (via key) with fresh React-owned DOM, and the KP layout pass then
   * freezes it into justified lines. The key covers everything that changes
   * the rendered output. Restoring innerHTML under React instead of
   * remounting detached its text nodes and permanently broke live updates —
   * React's own reconciler must own the subtree between versions.
   */
  const layoutKey = [
    source,
    containerWidth,
    mediaVersion,
    fontSize,
    lineHeight,
    bodyFont,
    hanFont,
    codeFont,
    codeScale,
    punct,
    cjk,
  ].join("\u0000");

  useKpJustifiedLayout(containerRef, align === "justify", [layoutKey, align === "justify"]);

  return (
    <div
      ref={containerRef}
      className={documentStyles.document}
      style={
        {
          ...themeCSS,
          "--md-font-size": `${fontSize}px`,
          "--md-leading": `${lineHeight}`,
          "--md-code-scale": `${codeScale}`,
          "--md-mono-family": CODE_FONT_STACKS[codeFont],
        } as React.CSSProperties
      }
    >
      <MarkdownPreview
        key={layoutKey}
        source={source}
        punct={punct}
        className={classNames(
          FONT_CLASS[bodyFont],
          HAN_CLASS[hanFont],
          cjk && styles.cjk,
          align === "justify" && styles.justify,
        )}
      />
    </div>
  );
};

export default MarkdownDocument;
