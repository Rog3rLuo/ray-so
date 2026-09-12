"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Components } from "react-markdown";
import type { Element, Nodes } from "hast";

import "katex/dist/katex.min.css";

import MarkdownCodeBlock from "./MarkdownCodeBlock";
import Mermaid from "./Mermaid";
import styles from "./Markdown.module.css";
import type { MarkdownPunct } from "../store/content";

type PropTypes = {
  source: string;
  className?: string;
  punct?: MarkdownPunct;
};

/** Flattens a hast subtree back to its text content (used for code fences). */
function toText(node: Nodes): string {
  if (node.type === "text") return node.value;
  if (node.type !== "element" && node.type !== "root") return "";

  return node.children.map(toText).join("");
}

/*
 * Halfwidth punctuation policies (display-only; the markdown source is never
 * modified). Both only fire when the punctuation sits in a Chinese context —
 * right after a Han character or fullwidth punctuation — so real English
 * sentences keep their halfwidth glyphs.
 */
const HAN = "[\\u4e00-\\u9fff\\u3400-\\u4dbf\\u3000-\\u303f\\uff00-\\uffef]";
const FOLD: Record<string, string> = {
  ",": "，",
  ".": "。",
  ";": "；",
  ":": "：",
  "!": "！",
  "?": "？",
};

function foldHalfwidth(text: string): string {
  return text
    .replace(new RegExp(`(?<=${HAN})([,.;:!?])`, "g"), (mark) => FOLD[mark])
    .replace(new RegExp(`(?<=${HAN})\\((?=[${HAN.replace("\\uff00-\\uffef", "")}])`, "g"), "（")
    .replace(new RegExp(`(?<=${HAN})\\)`, "g"), "）");
}

function spaceHalfwidth(text: string): string {
  return text.replace(new RegExp(`(?<=${HAN})([,.;:!?])`, "g"), `$1\u2009`);
}

/**
 * Walks the hast tree rewriting text nodes. Code never changes: fenced blocks
 * and inline code are skipped so copied snippets stay byte-identical.
 *
 * Attached as `[rehypeCjkPunct, { transform }]`: unified calls the factory with
 * the options and attaches the returned transformer to the pipeline.
 */
function rehypeCjkPunct({ transform }: { transform: (text: string) => string }) {
  const walk = (node: Nodes): void => {
    if (!node || typeof node !== "object" || typeof node.type !== "string") return;

    if (node.type === "text") {
      if (typeof node.value === "string") node.value = transform(node.value);
      return;
    }
    if (node.type !== "element" && node.type !== "root") return;
    if (node.type === "element" && (node.tagName === "code" || node.tagName === "pre")) return;

    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) walk(child);
  };

  return (tree: Nodes) => walk(tree);
}

function getLanguage(codeElement: Element | undefined): string {
  const className = codeElement?.properties?.className;
  const classes = Array.isArray(className) ? className.map(String) : [];

  for (const value of classes) {
    if (value.startsWith("language-")) {
      return value.slice("language-".length);
    }
  }

  return "";
}

/**
 * Cross-origin images cannot be fetched by html-to-image while exporting, which
 * leaves blank boxes in the PNG/SVG. Same-origin, relative and `data:` sources
 * are fine, so only absolute http(s) URLs are funnelled through the proxy.
 */
function resolveImageSrc(src: string | undefined): string | undefined {
  if (!src) return src;
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;
  if (!/^https?:\/\//i.test(src)) return src;

  if (typeof window !== "undefined" && src.startsWith(window.location.origin)) {
    return src;
  }

  return `/api/image-proxy?url=${encodeURIComponent(src)}`;
}

/**
 * Inline-code density over React children (Telari prefs.raggedCode): the
 * share of characters living inside `code` elements. Computed at render so
 * the paragraph carries its own `codeHeavy` class at commit — no effect race
 * with the KP layout pass.
 */
function codeDensityOf(children: React.ReactNode): { code: number; total: number } {
  let code = 0;
  let total = 0;

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      const props = child.props as { className?: string; children?: React.ReactNode };
      const isCode = child.type === "code" || (typeof props.className === "string" && props.className.includes(styles.inlineCode));
      const sub = codeDensityOf(props.children);
      if (isCode) {
        code += sub.total;
      } else {
        code += sub.code;
      }
      total += sub.total;
      return;
    }
    if (typeof child === "string") {
      total += child.length;
    }
  });

  return { code, total };
}

const MarkdownImage: React.FC<{ src: string; alt?: string; title?: string }> = ({ src, alt, title }) => {
  const [failed, setFailed] = useState(false);

  // Broken images otherwise export as the browser's broken-icon glyph; a
  // failed load degrades to the same placeholder as a missing source.
  if (failed) {
    return (
      <span className={styles.imagePlaceholder} data-ignore-in-export="">
        {alt || "image"}
      </span>
    );
  }

  return (
    // Plain <img>: next/image would rewrite the src and break both the
    // proxy and html-to-image inlining.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={styles.image}
      src={src}
      alt={alt || ""}
      title={title}
      loading="lazy"
      onError={() => setFailed(true)}
      onLoad={() => window.dispatchEvent(new Event("kp-media-loaded"))}
    />
  );
};

const MarkdownPreview: React.FC<PropTypes> = ({ source, className, punct = "faithful" }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const components = useMemo<Components>(
    () => ({
      h1: ({ children }) => <h1 className={`${styles.heading} ${styles.h1}`}>{children}</h1>,
      h2: ({ children }) => <h2 className={`${styles.heading} ${styles.h2}`}>{children}</h2>,
      h3: ({ children }) => <h3 className={`${styles.heading} ${styles.h3}`}>{children}</h3>,
      h4: ({ children }) => <h4 className={`${styles.heading} ${styles.h4}`}>{children}</h4>,
      h5: ({ children }) => <h5 className={`${styles.heading} ${styles.h5}`}>{children}</h5>,
      h6: ({ children }) => <h6 className={`${styles.heading} ${styles.h6}`}>{children}</h6>,

      p: ({ children }) => {
        const { code, total } = codeDensityOf(children);
        const heavy = code / Math.max(1, total) > 0.35;
        return <p className={`${styles.paragraph}${heavy ? ` ${styles.codeHeavy}` : ""}`}>{children}</p>;
      },

      a: ({ href, children }) => (
        <a className={styles.link} href={href} target="_blank" rel="noreferrer noopener">
          {children}
        </a>
      ),

      strong: ({ children }) => <strong className={styles.strong}>{children}</strong>,
      em: ({ children }) => <em className={styles.emphasis}>{children}</em>,
      hr: () => <hr className={styles.hr} />,

      ul: ({ children }) => <ul className={styles.list}>{children}</ul>,
      ol: ({ children }) => <ol className={styles.list}>{children}</ol>,
      li: ({ children, node }) => {
        const classes = Array.isArray(node?.properties?.className) ? node.properties.className.map(String) : [];
        const isTask = classes.includes("task-list-item");

        return <li className={`${styles.listItem} ${isTask ? styles.taskListItem : ""}`.trim()}>{children}</li>;
      },
      // The only input markdown can produce is a GFM task-list checkbox.
      input: ({ checked }) => (
        <input className={styles.taskCheckbox} type="checkbox" checked={checked} readOnly disabled />
      ),

      blockquote: ({ children }) => <blockquote className={styles.quote}>{children}</blockquote>,

      /*
       * Inline code only: fenced blocks are intercepted at `pre` below, because
       * react-markdown v10 no longer passes the old `inline` flag to `code`.
       */
      code: ({ children }) => <code className={styles.inlineCode}>{children}</code>,

      pre: ({ node }) => {
        const codeElement = node?.children?.find(
          (child): child is Element => child.type === "element" && child.tagName === "code",
        );

        if (!codeElement) return null;

        const lang = getLanguage(codeElement);
        const text = toText(codeElement).replace(/\n$/, "");

        if (lang.toLowerCase() === "mermaid") {
          return <Mermaid code={text} />;
        }

        return <MarkdownCodeBlock code={text} lang={lang} />;
      },

      table: ({ children }) => (
        <div className={styles.tableScroll}>
          <table className={styles.table}>{children}</table>
        </div>
      ),

      img: ({ src, alt, title }) => {
        // react-markdown types `src` as `string | Blob`; a Blob never reaches an
        // <img> here because it is not produced by the markdown pipeline.
        const source = typeof src === "string" ? src : undefined;

        if (!source) {
          return (
            <span className={styles.imagePlaceholder} data-ignore-in-export="">
              {alt || "image"}
            </span>
          );
        }

        return <MarkdownImage src={resolveImageSrc(source) ?? source} alt={alt} title={title} />;
      },

      kbd: ({ children }) => <kbd className={styles.kbd}>{children}</kbd>,

      section: ({ children, node }) => {
        const classes = Array.isArray(node?.properties?.className) ? node.properties.className.map(String) : [];
        if (classes.includes("footnotes")) {
          return <section className={styles.footnotes}>{children}</section>;
        }

        return <section>{children}</section>;
      },
    }),
    [],
  );

  /*
   * Inline-code density (Telari prefs.raggedCode) is computed at render time
   * inside the `p` component (see codeDensityOf) — computing it here in a
   * passive effect raced the KP layout effect, whose justify gate read the
   * class before this one wrote it.
   */

  const rehypePlugins = useMemo(() => {
    const transform = punct === "fold" ? foldHalfwidth : punct === "spacing" ? spaceHalfwidth : null;

    return [
      [rehypeKatex, { throwOnError: false, strict: false, output: "html" }],
      ...(transform ? [[rehypeCjkPunct, { transform }]] : []),
    ];
  }, [punct]);

  return (
    <div ref={containerRef} className={`${styles.markdown} ${className || ""}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={rehypePlugins as never} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownPreview;
