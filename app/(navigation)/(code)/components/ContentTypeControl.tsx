import React from "react";
import { useAtom } from "jotai";
import * as ToggleGroup from "@radix-ui/react-toggle-group";

import ControlContainer from "./ControlContainer";
import styles from "./ContentControls.module.css";
import { ContentType, contentTypeAtom } from "../store/content";
import useHotkeys from "../../../../utils/useHotkeys";

const OPTIONS: { value: ContentType; label: string }[] = [
  { value: "code", label: "Code" },
  { value: "markdown", label: "Markdown" },
];

/** Switches what the frame renders: the code editor, or a markdown document. */
const ContentTypeControl: React.FC = () => {
  const [contentType, setContentType] = useAtom(contentTypeAtom);

  useHotkeys("m", () => {
    setContentType((current) => (current === "markdown" ? "code" : "markdown"));
  });

  return (
    <ControlContainer title="Type">
      <ToggleGroup.Root
        className={styles.toggleGroup}
        type="single"
        value={contentType}
        aria-label="Content type"
        onValueChange={(value) => {
          if (value === "code" || value === "markdown") setContentType(value);
        }}
      >
        {OPTIONS.map((option) => (
          <ToggleGroup.Item
            key={option.value}
            className={styles.toggleGroupItem}
            value={option.value}
            aria-label={option.label}
          >
            {option.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </ControlContainer>
  );
};

export default ContentTypeControl;
