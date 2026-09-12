"use client";

import { useLayoutEffect, type RefObject } from "react";

import { applyKpLayout, auditKpAlignment } from "./kpExport";

/**
 * Applies the KP layout to justified paragraphs inside `ref` — the unified
 * rendering mode: the preview carries exactly the line breaking of the export,
 * punctuation hanging included.
 *
 * This hook deliberately performs a one-way application with NO restore: the
 * caller must key the rendered markdown subtree by the layout version (see
 * MarkdownDocument), so every version change remounts a fresh React-owned DOM
 * that this hook then freezes into KP lines. Restoring innerHTML under
 * React's feet is what broke live text updates in the previous design —
 * React's text-node references end up detached and its updates never land.
 *
 * `active` gates on justify mode; narrow columns are skipped inside
 * applyKpLayout via their computed text-align.
 */
export function useKpJustifiedLayout(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  deps: unknown[],
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return;

    applyKpLayout(el);

    // dev-only quality gate: the three invariants, checked on every layout
    if (process.env.NODE_ENV !== "production") {
      const { checked, issues } = auditKpAlignment(el);
      if (issues.length) {
        console.warn("[kp] alignment audit:", checked, "lines,", issues.length, "issues", issues);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
