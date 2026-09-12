"use client";

import React, { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import classNames from "classnames";

import Frame from "./Frame";
import MarkdownSourceEditor from "./MarkdownSourceEditor";
import styles from "./MarkdownWorkspace.module.css";
import { showMarkdownSourceAtom } from "../store/content";

/**
 * Markdown editing workspace: source pane beside the export frame.
 *
 * The source pane lives *outside* `#frame` on purpose. `#frame` is the export
 * boundary (`ExportButton` renders exactly that element), so anything inside it
 * ends up in the PNG/SVG. Keeping the textarea out here means exports contain the
 * rendered document and nothing else — no need to lean on `data-ignore-in-export`
 * for the editor surface itself.
 */
const MarkdownWorkspace: React.FC = () => {
  const showSource = useAtomValue(showMarkdownSourceAtom);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  /*
   * Split-view scroll sync: the textarea and the page (the scroller the preview
   * frame lives in) follow each other by scroll ratio, so the top of the source
   * lines up with the top of the document and both hit the bottom together.
   * A short lock held by whichever side is being driven programmatically keeps
   * the two listeners from feeding back into each other.
   */
  useEffect(() => {
    const textarea = textareaRef.current;
    const preview = previewRef.current;
    if (!textarea || !preview || !showSource) return;

    // The fixed navigation bar covers the top of the viewport; the preview is
    // "visible" in the strip below it.
    const HEADER = 90;

    let locked: "source" | "preview" | null = null;
    let unlockTimer: ReturnType<typeof setTimeout> | undefined;

    const claim = (side: "source" | "preview") => {
      locked = side;
      clearTimeout(unlockTimer);
      unlockTimer = setTimeout(() => {
        locked = null;
      }, 120);
    };

    const previewTop = () => preview.getBoundingClientRect().top + window.scrollY;
    const previewScrollable = () => preview.offsetHeight - (window.innerHeight - HEADER);

    const onSourceScroll = () => {
      if (locked === "preview") return;
      claim("source");

      const sourceRange = textarea.scrollHeight - textarea.clientHeight;
      if (sourceRange <= 0) return;
      const scrollable = previewScrollable();
      if (scrollable <= 0) return;

      const ratio = Math.min(1, Math.max(0, textarea.scrollTop / sourceRange));
      window.scrollTo({ top: previewTop() - HEADER + ratio * scrollable });
    };

    const onWindowScroll = () => {
      if (locked === "source") return;
      const sourceRange = textarea.scrollHeight - textarea.clientHeight;
      if (sourceRange <= 0) return;
      const scrollable = previewScrollable();
      if (scrollable <= 0) return;
      claim("preview");

      const ratio = Math.min(1, Math.max(0, (window.scrollY - previewTop() + HEADER) / scrollable));
      textarea.scrollTop = ratio * sourceRange;
    };

    textarea.addEventListener("scroll", onSourceScroll, { passive: true });
    window.addEventListener("scroll", onWindowScroll, { passive: true });

    return () => {
      textarea.removeEventListener("scroll", onSourceScroll);
      window.removeEventListener("scroll", onWindowScroll);
      clearTimeout(unlockTimer);
    };
  }, [showSource]);

  return (
    <div className={classNames(styles.workspace, !showSource && styles.previewOnly)}>
      {/*
       * The source pane stays mounted in preview mode: unmounting it would drop
       * the textarea's IME composition, focus and native undo history. CSS only
       * takes it out of layout and the tab order.
       */}
      <MarkdownSourceEditor
        className={classNames(styles.source, !showSource && styles.sourceHidden)}
        textareaRef={textareaRef}
      />
      <div ref={previewRef} className={styles.preview}>
        <Frame />
      </div>
    </div>
  );
};

export default MarkdownWorkspace;
