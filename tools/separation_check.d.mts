export const ALLOWED: string[];
export const FORBIDDEN: string[];
export function imports(text: string): string[];
export function resolveImport(root: string, from: string, spec: string): string | null;
export function findings(root: string, o?: { read?: (path: string) => string; files?: (dir: string) => string[] }): string[];
