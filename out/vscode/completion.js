import * as path from 'path';
import * as vscode from 'vscode';
import { isPawnFile } from '../core/utils.js';
import { buildIntelliData, signatureToDetail } from './intellisense.js';
export function registerCompletion(context, config) {
    const provider = {
        async provideCompletionItems(document, position) {
            if (!isPawnFile(document.fileName))
                return [];
            const data = await buildIntelliData(document, config);
            const items = [];
            for (const [name, sig] of data.sigs) {
                const it = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
                it.detail = signatureToDetail(sig);
                it.documentation = new vscode.MarkdownString().appendCodeblock(sig.signature, 'pawn');
                it.insertText = new vscode.SnippetString(`${name}($0)`);
                it.filterText = name;
                it.sortText = `1_${name}`;
                items.push(it);
            }
            for (const macro of data.macros) {
                // Prefer not to shadow function completions with same name.
                if (data.sigs.has(macro))
                    continue;
                const it = new vscode.CompletionItem(macro, vscode.CompletionItemKind.Constant);
                it.detail = `macro • ${path.basename(document.fileName)}`;
                it.insertText = macro;
                it.sortText = `2_${macro}`;
                items.push(it);
            }
            return items;
        },
    };
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ language: 'pawn', scheme: 'file' }, provider, '.', '_', ':'));
}
//# sourceMappingURL=completion.js.map