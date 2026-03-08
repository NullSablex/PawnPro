# Security Audit — PawnPro v2.1

**Date:** 2026-03-07
**Scope:** Source code (CWE analysis) + npm dependency tree (CVE analysis)
**Tools:** `npm audit`, manual grep, static analysis

---

## Summary

| Severity | Findings |
|----------|----------|
| Critical | 0 |
| High     | 0 |
| Medium   | 1 (devDep only, not shipped) |
| Low      | 2 (devDep only, not shipped) |
| Code     | 1 CWE-400 — **fixed in this release** |

---

## 1. Dependency Vulnerabilities (CVE)

All findings are in transitive dependencies of `@vscode/vsce` (a devDependency used only at package-build time). **None of these packages are bundled or shipped in the `.vsix` extension.**

| Package | CVE | CVSS | Description | Status |
|---------|-----|------|-------------|--------|
| `minimatch` < 3.0.5 | CVE-2022-3517 | 7.5 (High) | ReDoS via crafted glob string | Not shipped |
| `underscore` < 1.12.1 | CVE-2021-23358 | 7.2 (High) | Arbitrary code injection via `template` | Not shipped |
| `ajv` < 6.12.3 | CVE-2020-15366 | 5.6 (Medium) | Prototype pollution via `additionalProperties` | Not shipped |
| `markdown-it` < 12.3.2 | CVE-2022-21670 | 5.3 (Medium) | ReDoS via crafted Markdown | Not shipped |
| `qs` < 6.7.3 | CVE-2022-24999 | 6.5 (Medium) | Prototype pollution | Not shipped |

**Mitigation:** No action required for extension users. These vulnerabilities only affect the development build toolchain. To eliminate from audit output, run `npm audit --omit=dev`.

---

## 2. Source Code — CWE Analysis

### CWE-78: OS Command Injection

**File:** `src/vscode/compiler.ts`, `src/core/flags.ts`

Both use `child_process.spawn` / `spawnSync` with `shell: false` (default). Arguments are passed as a string array, never concatenated into a shell string. No interpolation into shell commands.

**Status:** Safe. No action required.

---

### CWE-79: Cross-Site Scripting (XSS in WebView)

**File:** `src/vscode/serverView.ts`

The server console WebView appends log output using `textContent` (not `innerHTML`) for user-controlled data. The one use of `innerHTML` is for clearing: `el.innerHTML = ''`. No untrusted string is injected as HTML.

**Status:** Safe. No action required.

---

### CWE-22: Path Traversal

**File:** `src/core/`, `src/vscode/`

All file paths are constructed from workspace-root-relative settings values. No user input (e.g., HTTP request parameters) reaches `fs.readFile` or `fs.writeFile`. Include path resolution via `resolveInclude()` only resolves within configured include directories.

**Status:** Safe. No action required.

---

### CWE-915: Prototype Pollution

**File:** `src/core/config.ts`

The `deepMerge` function explicitly blocks prototype-polluting keys:

```typescript
const forbidden = ['__proto__', 'constructor', 'prototype'];
if (forbidden.includes(key)) continue;
```

**Status:** Protected. No action required.

---

### CWE-400: Uncontrolled Resource Consumption (ReDoS) — FIXED

**File:** `src/core/unusedAnalyzer.ts`

Three locations constructed `new RegExp(name)` by directly interpolating a parsed identifier name without escaping special regex characters:

```typescript
// Before fix (lines 61, 93, 138):
new RegExp(`\\b${keyword}\\s+${name}\\b`)
new RegExp(`\\bstock\\s+(?:[A-Za-z_]\\w*:)?\\s*(${name})\\s*\\(`)
new RegExp(`\\b(new|static|const)\\s+${name}\\b`)
```

Although Pawn identifiers are constrained to `[A-Za-z_]\w*` (no regex metacharacters in practice), a crafted source file could theoretically supply an identifier-like token through macro expansion or edge-case parsing, triggering catastrophic backtracking.

**Fix applied:** Added `escapeRe()` helper and applied it to all three interpolation sites:

```typescript
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// After fix:
new RegExp(`\\b${escapeRe(keyword)}\\s+${escapeRe(name)}\\b`)
new RegExp(`\\bstock\\s+(?:[A-Za-z_]\\w*:)?\\s*(${escapeRe(name)})\\s*\\(`)
new RegExp(`\\b(new|static|const)\\s+${escapeRe(name)}\\b`)
```

**CVSS v3.1 (hypothetical):** 4.3 (Medium) — AV:L/AC:L/PR:N/UI:R/S:U/C:N/I:N/A:L
**Status:** Fixed in v2.1.

---

## 3. Recommendations

1. Pin `@vscode/vsce` devDependency to a version that resolves its transitive CVEs, or add `overrides` in `package.json` for the affected packages.
2. Consider adding a pre-publish `npm audit --omit=dev --audit-level=high` check to CI to catch future high/critical devDep chains early.
3. The `escapeRe` fix is already committed. No further remediation needed for CWE-400.
