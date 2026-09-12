import React from "react";
import { useAtomValue } from "jotai";

import styles from "./Controls.module.css";
import BackgroundControl from "./BackgroundControl";
import DarkModeControl from "./DarkModeControl";
import ExportButton from "./ExportButton";
import LanguageControl from "./LanguageControl";
import PaddingControl from "./PaddingControl";
import ThemeControl from "./ThemeControl";
import LineNumberControl from "./LineNumberControl";
import ContentTypeControl from "./ContentTypeControl";
import {
  MarkdownFontPopover,
  MarkdownTextPopover,
  MarkdownTypographyPopover,
  MarkdownViewModeControl,
} from "./MarkdownControls";
import { contentTypeAtom } from "../store/content";

const Controls: React.FC = () => {
  const contentType = useAtomValue(contentTypeAtom);
  const isMarkdown = contentType === "markdown";

  return (
    <div className={styles.controls}>
      <ContentTypeControl />
      <ThemeControl />
      <BackgroundControl />
      <DarkModeControl />
      {/* Line numbers and language only apply to code; the markdown pane swaps
          them for document typography controls. */}
      {isMarkdown ? (
        <>
          <MarkdownViewModeControl />
          <MarkdownFontPopover />
          <MarkdownTextPopover />
          <MarkdownTypographyPopover />
        </>
      ) : (
        <>
          <LineNumberControl />
          <LanguageControl />
        </>
      )}
      <PaddingControl />
    </div>
  );
};

export default Controls;
