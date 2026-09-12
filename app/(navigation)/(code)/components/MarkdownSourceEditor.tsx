"use client";

import React, { ChangeEventHandler, useCallback, useRef } from "react";
import { useAtom } from "jotai";

import { codeAtom } from "../store/code";
import { markdownFontSizeAtom } from "../store/content";

import styles from "./MarkdownSourceEditor.module.css";

type PropTypes = {
  /** Layout class supplied by the workspace (sizing / stickiness). */
  className?: string;
  /** Ref the workspace uses to observe and drive scrolling for sync. */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
};

/**
 * Plain source pane for markdown mode.
 *
 * This is intentionally *not* the code editor's textarea-over-highlighted-layer
 * trick: that only works because code renders character-for-character, which
 * markdown does not. A plain textarea keeps the caret and IME behaviour correct,
 * and it lives outside `#frame` so exports never contain the raw source.
 */
const MarkdownSourceEditor: React.FC<PropTypes> = ({ className, textareaRef }) => {
  const [code, setCode] = useAtom(codeAtom);
  const [fontSize] = useAtom(markdownFontSizeAtom);
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? localRef;

  const handleChange = useCallback<ChangeEventHandler<HTMLTextAreaElement>>(
    (event) => {
      setCode(event.target.value);
    },
    [setCode],
  );

  /**
   * Applies an edit through `execCommand("insertText")` so the browser's native
   * undo stack sees a single step; React still hears about the change through
   * the normal `onChange` -> `setCode` path. Falls back to a plain atom write
   * (two undo steps) where execCommand is unavailable.
   */
  const applyEdit = useCallback(
    (textarea: HTMLTextAreaElement, start: number, end: number, replacement: string, selStart: number, selEnd: number) => {
      textarea.setSelectionRange(start, end);
      const applied = document.execCommand("insertText", false, replacement);

      if (!applied) {
        const value = textarea.value;
        setCode(value.slice(0, start) + replacement + value.slice(end));
      }

      requestAnimationFrame(() => {
        textarea.setSelectionRange(selStart, selEnd);
      });
    },
    [setCode],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Tab") return;

      event.preventDefault();

      const textarea = event.currentTarget;
      const { selectionStart, selectionEnd, value } = textarea;

      if (!event.shiftKey) {
        applyEdit(textarea, selectionStart, selectionEnd, "  ", selectionStart + 2, selectionStart + 2);
        return;
      }

      // Dedent every line the selection touches: one tab or up to two spaces.
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const block = value.slice(lineStart, selectionEnd);
      const lines = block.split("\n");

      const dropOf = (line: string) => line.match(/^(?:\t| {1,2})/)?.[0].length ?? 0;

      // Removed characters strictly before each selection endpoint, so the
      // restored selection tracks the text rather than a fixed offset.
      const removedBefore = (caretInBlock: number) => {
        let removed = 0;
        let walk = 0;
        for (const line of lines) {
          if (caretInBlock <= walk) break;
          const drop = dropOf(line);
          if (caretInBlock <= walk + drop) {
            removed = caretInBlock - walk;
            break;
          }
          removed += drop;
          walk += line.length + 1;
        }
        return removed;
      };

      const dedented = lines.map((line) => line.slice(dropOf(line))).join("\n");
      const newStart = selectionStart - removedBefore(selectionStart - lineStart);
      const newEnd = selectionEnd - removedBefore(selectionEnd - lineStart);

      applyEdit(textarea, lineStart, lineStart + block.length, dedented, newStart, newEnd);
    },
    [applyEdit],
  );

  return (
    <div className={`${styles.pane} ${className || ""}`.trim()}>
      <div className={styles.header}>
        <span className={styles.label}>Markdown</span>
      </div>
      <textarea
        ref={ref}
        className={styles.textarea}
        style={{ fontSize: `${fontSize}px` }}
        value={code}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        data-enable-grammarly="false"
        aria-label="Markdown source"
        placeholder={"# Write markdown here…"}
      />
    </div>
  );
};

export default MarkdownSourceEditor;
