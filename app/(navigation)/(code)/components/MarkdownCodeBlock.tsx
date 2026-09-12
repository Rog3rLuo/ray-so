"use client";

import React, { useDeferredValue, useEffect, useState } from "react";
import { useAtomValue } from "jotai";

import { LANGUAGES } from "../util/languages";
import { highlighterAtom } from "../store";
import { themeAtom, themeDarkModeAtom } from "../store/themes";

import styles from "./Markdown.module.css";

type PropTypes = {
  code: string;
  lang: string;
};

/**
 * Aliases seen in real markdown fences mapped onto `LANGUAGES` keys. Anything
 * not listed is tried as a key, then as a display name, then as a raw shiki id.
 */
const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  node: "javascript",
  ts: "typescript",
  py: "python",
  python3: "python",
  rb: "ruby",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  console: "console",
  yml: "yaml",
  md: "markdown",
  rs: "rust",
  kt: "kotlin",
  kts: "kotlin",
  cs: "csharp",
  "c#": "csharp",
  "c++": "cpp",
  cc: "cpp",
  hpp: "cpp",
  objc: "objectivec",
  ps1: "powershell",
  pwsh: "powershell",
  docker: "dockerfile",
  tex: "latex",
  hs: "haskell",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  gql: "graphql",
  hcl2: "hcl",
  terraform: "hcl",
  tf: "hcl",
  text: "plaintext",
  txt: "plaintext",
  plain: "plaintext",
  clj: "clojure",
  cr: "crystal",
  postgres: "sql",
  psql: "sql",
  mysql: "sql",
  golang: "go",
  vue: "vue",
  sv: "svelte",
  html5: "html",
  jsonc: "json",
  json5: "json",
  scss: "scss",
  sass: "scss",
  less: "css",
};

/** The language id shiki should be asked for, or null when there is none. */
function resolveShikiId(lang: string): string | null {
  const normalized = lang.trim().toLowerCase();
  if (!normalized) return null;

  const aliased = LANGUAGE_ALIASES[normalized] ?? normalized;
  if (LANGUAGES[aliased]) return aliased;

  const byName = Object.keys(LANGUAGES).find((key) => LANGUAGES[key].name.toLowerCase() === normalized);
  if (byName) return byName;

  // Not in the catalog: still let shiki try, so fences for languages ray-so has
  // no entry for (e.g. `wasm`) highlight instead of silently going plain.
  return normalized;
}

const MarkdownCodeBlock: React.FC<PropTypes> = ({ code, lang }) => {
  const [html, setHtml] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const highlighter = useAtomValue(highlighterAtom);
  const darkMode = useAtomValue(themeDarkModeAtom);
  const theme = useAtomValue(themeAtom);
  const themeName = theme.id === "tailwind" ? (darkMode ? "tailwind-dark" : "tailwind-light") : "css-variables";
  const label = lang.trim();

  /*
   * Typing re-renders every fence of the document; shiki runs at lower priority
   * behind the input via useDeferredValue so a large document can't block the
   * keystroke on highlighting. The stale render stays visible until caught up.
   */
  const deferredCode = useDeferredValue(code);

  useEffect(() => {
    let cancelled = false;

    const generate = async () => {
      if (!highlighter || !label) {
        setHtml("");
        return;
      }

      const shikiId = resolveShikiId(label);
      if (!shikiId) {
        setHtml("");
        return;
      }

      try {
        const loaded = highlighter.getLoadedLanguages() || [];
        if (!loaded.includes(shikiId as never)) {
          setIsLoading(true);
          await highlighter.loadLanguage(shikiId as never);
          setIsLoading(false);
        }

        const result = highlighter.codeToHtml(deferredCode, { lang: shikiId, theme: themeName });
        if (!cancelled) setHtml(result);
      } catch {
        // Unknown grammar: fall back to the plain rendering below.
        setIsLoading(false);
        if (!cancelled) setHtml("");
      }
    };

    generate();

    return () => {
      cancelled = true;
    };
  }, [deferredCode, label, highlighter, themeName]);

  return (
    <div className={styles.codeBlock} data-markdown-code-block="">
      {label ? (
        <div className={styles.codeBlockHeader}>
          <span className={styles.codeBlockLang}>{isLoading ? `${label} …` : label}</span>
        </div>
      ) : null}
      <div className={styles.codeBlockBody}>
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className={styles.codeFallback}>{code}</pre>
        )}
      </div>
    </div>
  );
};

export default MarkdownCodeBlock;
