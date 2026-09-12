"use client";

import React, { useEffect, useId, useState } from "react";
import { useAtomValue } from "jotai";
import { themeAtom, themeDarkModeAtom } from "../store/themes";

import styles from "./Markdown.module.css";

type PropTypes = {
  code: string;
};

/**
 * Renders a ```mermaid fenced block to inline SVG.
 *
 * mermaid is ~1MB, so it is imported lazily and only when a diagram is actually
 * present. `htmlLabels` is forced off: mermaid 12 defaults it to true, which
 * emits `<foreignObject>` and reliably turns blank when html-to-image serialises
 * the frame. `securityLevel: "strict"` also keeps the diagram from executing
 * anything embedded in the source.
 */
const Mermaid: React.FC<PropTypes> = ({ code }) => {
  const rawId = useId();
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const darkMode = useAtomValue(themeDarkModeAtom);
  const theme = useAtomValue(themeAtom);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      try {
        const mermaid = (await import("mermaid")).default;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          htmlLabels: false,
          flowchart: { htmlLabels: false },
          theme: darkMode ? "dark" : "default",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        });

        // mermaid ids must be valid CSS selectors; useId() contains colons.
        // djb2 over the full source: cheap, stable across renders, never NaN
        // (an empty loop just returns the seed), and spreads collisions far
        // better than length-plus-first-char would.
        let hash = 5381;
        for (let i = 0; i < code.length; i++) {
          hash = ((hash << 5) + hash + code.charCodeAt(i)) >>> 0;
        }
        const id = `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}-${hash}`;

        const { svg: rendered } = await mermaid.render(id, code);
        if (!cancelled) {
          setSvg(rendered);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setSvg("");
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    };

    render();

    return () => {
      cancelled = true;
    };
    // `theme.id` is included so switching theme re-renders with matching colours.
  }, [code, darkMode, rawId, theme.id]);

  if (error) {
    return <div className={styles.mermaidError}>{`Mermaid error: ${error}`}</div>;
  }

  if (!svg) {
    return <div className={styles.mermaid} aria-busy="true" />;
  }

  return (
    <div
      className={styles.mermaid}
      // The SVG comes from mermaid's own renderer, not from the document, and
      // `securityLevel: "strict"` sandboxes it; there is no user HTML path here.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

export default Mermaid;
