/**
 * Minimal ambient declaration for the one node builtin the family-sheet
 * script uses. The repo does not ship @types/node; the runtime (tsx) resolves
 * node builtins natively. If @types/node is ever installed these declarations
 * merge harmlessly as extra overloads.
 */
declare module "node:fs" {
  export function mkdirSync(path: string, options?: { recursive?: boolean }): unknown;
  export function writeFileSync(path: string, data: string): void;
}
