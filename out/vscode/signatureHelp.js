import * as vscode from 'vscode';
import { isPawnFile } from '../core/utils.js';
import { buildIntelliData, getCallContext, signatureToDetail } from './intellisense.js';
export function registerSignatureHelp(context, config) {
    const provider = {
        async provideSignatureHelp(document, position) {
            if (!isPawnFile(document.fileName))
                return undefined;
            const lineText = document.lineAt(position.line).text;
            const call = getCallContext(lineText, position.character);
            if (!call)
                return undefined;
            const data = await buildIntelliData(document, config);
            const sig = data.sigs.get(call.name);
            if (!sig)
                return undefined;
            const info = new vscode.SignatureInformation(sig.signature, signatureToDetail(sig));
            info.parameters = sig.params.map(p => new vscode.ParameterInformation(p));
            const help = new vscode.SignatureHelp();
            help.signatures = [info];
            help.activeSignature = 0;
            help.activeParameter = Math.min(call.activeParam, Math.max(0, info.parameters.length - 1));
            return help;
        },
    };
    context.subscriptions.push(vscode.languages.registerSignatureHelpProvider({ language: 'pawn', scheme: 'file' }, provider, '(', ','));
}
//# sourceMappingURL=signatureHelp.js.map