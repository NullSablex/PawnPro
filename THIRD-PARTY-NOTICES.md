# Avisos de terceiros

Este projeto inclui componentes de terceiros, sob suas respectivas licenças.

---

## Dependências JavaScript empacotadas

O `out/editor/extension.js` do VSIX embute, pelo bundle, estas dependências de
runtime e as delas:

| Pacote | Licença |
|---|---|
| [vscode-languageclient](https://github.com/microsoft/vscode-languageserver-node) | MIT |
| [vscode-languageserver-protocol](https://github.com/microsoft/vscode-languageserver-node) | MIT |
| [vscode-languageserver-types](https://github.com/microsoft/vscode-languageserver-node) | MIT |
| [vscode-languageserver-textdocument](https://github.com/microsoft/vscode-languageserver-node) | MIT |
| [vscode-jsonrpc](https://github.com/microsoft/vscode-languageserver-node) | MIT |
| [minimatch](https://github.com/isaacs/minimatch) | BlueOak-1.0.0 |
| [semver](https://github.com/npm/node-semver) | ISC |
| [brace-expansion](https://github.com/juliangruber/brace-expansion) | MIT |
| [balanced-match](https://github.com/juliangruber/balanced-match) | MIT |

As ferramentas de build e teste (`devDependencies`) não são distribuídas.

---

## Núcleo nativo (`bin/pawnpro-core-*`)

O VSIX traz o binário do [PawnPro-Core](https://github.com/NullSablex/PawnPro-Core),
sob a licença PawnPro-Core v1.0. As bibliotecas Rust compiladas nele têm as
próprias licenças, com o texto completo em `bin/pawnpro-core-THIRD-PARTY.txt`,
que acompanha o binário no VSIX e em cada release do núcleo.

---

## Gramática TOML (`syntaxes/toml.tmLanguage.json`)

Adaptada da gramática TextMate da extensão **Even Better TOML**
(`tamasfe.even-better-toml`).

- Projeto: https://github.com/tamasfe/taplo
- Licença: MIT

```
MIT License

Copyright (c) 2020 Ferenc Tamás

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
