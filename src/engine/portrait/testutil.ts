/**
 * Pure helpers shared by the portrait test files (no vitest imports).
 */

/** Returns an error string if the markup is not well-formed, else null. */
export function svgProblem(svg: string): string | null {
  if (!svg.startsWith("<svg")) return "does not start with <svg";
  if (!svg.endsWith("</svg>")) return "does not end with </svg>";
  if (svg.includes("NaN") || svg.includes("Infinity")) return "non-finite number in markup";
  if (svg.includes("undefined")) return "undefined leaked into markup";
  const tokens = svg.match(/<\/?[a-zA-Z][^>]*>/g);
  if (!tokens) return "no tags";
  const stack: string[] = [];
  for (const t of tokens) {
    if (t.endsWith("/>")) continue;
    if (t.startsWith("</")) {
      const name = t.slice(2, -1).trim();
      const open = stack.pop();
      if (open !== name) return `mismatched close ${name} (open was ${open})`;
    } else {
      const match = t.slice(1).match(/^[a-zA-Z][a-zA-Z0-9]*/);
      if (!match) return `bad tag ${t}`;
      stack.push(match[0]);
    }
  }
  if (stack.length > 0) return `unclosed tags: ${stack.join(",")}`;
  return null;
}

/** All fill="..." values in the markup. */
export function fills(svg: string): string[] {
  return [...svg.matchAll(/fill="([^"]*)"/g)].map((m) => m[1]);
}

/** Extract attr value of the first element matching a data marker. */
export function attrNear(svg: string, marker: string, attr: string): string | null {
  const i = svg.indexOf(marker);
  if (i < 0) return null;
  // Search backward to the start of the enclosing tag, then find the attr.
  const start = svg.lastIndexOf("<", i);
  const end = svg.indexOf(">", i);
  const tag = svg.slice(start, end);
  const m = tag.match(new RegExp(`${attr}="([^"]*)"`));
  return m ? m[1] : null;
}

/** The head outline path `d` (the clip path whose id ends in "h"). */
export function headPathOf(svg: string): string | null {
  const m = svg.match(/<clipPath id="[^"]*h"><path d="([^"]*)"/);
  return m ? m[1] : null;
}
