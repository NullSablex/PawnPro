import { stripCommentsPreserveColumns } from './includes.js';
/**
 * Semantic analyzer - validates declaration structure only.
 * Call validation is handled by intellisense signatures.
 */
function buildLineOffsets(text) {
    const offsets = [0];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n')
            offsets.push(i + 1);
    }
    return offsets;
}
function pushDiagnostic(out, lineOffsets, line, col, len, message, severity) {
    const startOffset = (lineOffsets[line] ?? 0) + col;
    const endOffset = startOffset + Math.max(1, len);
    out.push({ startOffset, endOffset, message, severity, source: 'PawnPro' });
}
function updateBraceDepth(line, currentDepth) {
    let depth = currentDepth;
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        const prev = i > 0 ? line[i - 1] : '';
        if (ch === '"' && !inSingle && prev !== '\\') {
            inDouble = !inDouble;
            continue;
        }
        if (ch === '\'' && !inDouble && prev !== '\\') {
            inSingle = !inSingle;
            continue;
        }
        if (inSingle || inDouble)
            continue;
        if (ch === '{')
            depth++;
        else if (ch === '}')
            depth = Math.max(0, depth - 1);
    }
    return depth;
}
function findTerminator(cleanLines, startLine, startCol) {
    const endLine = Math.min(cleanLines.length - 1, startLine + 5);
    for (let lineIdx = startLine; lineIdx <= endLine; lineIdx++) {
        const line = cleanLines[lineIdx];
        const from = lineIdx === startLine ? startCol : 0;
        for (let i = from; i < line.length; i++) {
            const ch = line[i];
            if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n')
                continue;
            if (ch === '{' || ch === ';')
                return ch;
            return '';
        }
    }
    return '';
}
/**
 * Analyze declaration structure (native/forward/public/stock).
 */
export function analyzeSemantics(text) {
    const diagnostics = [];
    const lineOffsets = buildLineOffsets(text);
    const lines = text.split(/\r?\n/);
    const cleanLines = [];
    let inBlock = false;
    for (let i = 0; i < lines.length; i++) {
        const stripped = stripCommentsPreserveColumns(lines[i], inBlock);
        inBlock = stripped.inBlock;
        cleanLines.push(stripped.text);
    }
    const rxNative = /^\s*(?:forward\s+)?native\s+(?:(?:[A-Za-z_]\w*::)*|(?:[A-Za-z_]\w*:))?\s*([A-Za-z_]\w*)\s*\([^)]*\)\s*([;{])?/;
    const rxForward = /^\s*forward\s+(?:(?:[A-Za-z_]\w*::)*|(?:[A-Za-z_]\w*:))?\s*([A-Za-z_]\w*)\s*\([^)]*\)\s*([;{])?/;
    const rxPublicStock = /^\s*(public|stock)\s+(?:(?:[A-Za-z_]\w*::)*|(?:[A-Za-z_]\w*:))?\s*([A-Za-z_]\w*)\s*\([^)]*\)\s*([;{])?/;
    let blockDepth = 0;
    for (let i = 0; i < cleanLines.length; i++) {
        const line = cleanLines[i];
        if (!line.trim()) {
            blockDepth = updateBraceDepth(line, blockDepth);
            continue;
        }
        const topLevel = blockDepth === 0;
        if (!topLevel) {
            blockDepth = updateBraceDepth(line, blockDepth);
            continue;
        }
        // Native: cannot have body
        const mNative = rxNative.exec(line);
        if (mNative && !rxForward.test(line)) {
            const name = mNative[1];
            const trail = mNative[2] ?? findTerminator(cleanLines, i, mNative.index + mNative[0].length);
            if (trail === '{') {
                const col = line.indexOf(name, mNative.index);
                pushDiagnostic(diagnostics, lineOffsets, i, col >= 0 ? col : 0, name.length, `Função native "${name}" não pode ter corpo.`, 'error');
            }
            blockDepth = updateBraceDepth(line, blockDepth);
            continue;
        }
        // Forward: cannot have body
        const mForward = rxForward.exec(line);
        if (mForward) {
            const name = mForward[1];
            const trail = mForward[2] ?? findTerminator(cleanLines, i, mForward.index + mForward[0].length);
            if (trail === '{') {
                const col = line.indexOf(name, mForward.index);
                pushDiagnostic(diagnostics, lineOffsets, i, col >= 0 ? col : 0, name.length, `Declaração forward "${name}" não pode ter corpo.`, 'error');
            }
            blockDepth = updateBraceDepth(line, blockDepth);
            continue;
        }
        // Public/Stock: should have body
        const mPS = rxPublicStock.exec(line);
        if (mPS) {
            const kind = mPS[1];
            const name = mPS[2];
            const trail = mPS[3] ?? findTerminator(cleanLines, i, mPS.index + mPS[0].length);
            if (trail === ';') {
                const col = line.indexOf(name, mPS.index);
                pushDiagnostic(diagnostics, lineOffsets, i, col >= 0 ? col : 0, name.length, `Declaração ${kind} "${name}" sem corpo. Use "forward" para protótipos.`, 'warning');
            }
        }
        blockDepth = updateBraceDepth(line, blockDepth);
    }
    return diagnostics;
}
//# sourceMappingURL=semanticAnalyzer.js.map