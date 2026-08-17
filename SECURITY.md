# Política de Segurança — PawnPro

## Reportar uma vulnerabilidade

Encontrou uma vulnerabilidade de segurança? **Não abra uma issue pública.**

Reporte de forma privada por um destes canais:

- Abra um [Security Advisory](https://github.com/NullSablex/PawnPro/security/advisories/new) privado no GitHub (preferido); ou
- Envie um e-mail diretamente ao mantenedor.

Inclua, se possível: uma descrição do problema, os passos para reproduzir, a versão afetada e o impacto esperado. Resposta inicial em até **7 dias úteis**.

---

## Escopo

Esta política cobre o código-fonte da extensão PawnPro (`NullSablex/PawnPro`) e o motor LSP ([`NullSablex/PawnPro-Engine`](https://github.com/NullSablex/PawnPro-Engine)).

O que **está** no escopo:

- Execução de código, escalonamento de privilégios ou vazamento de dados a partir da extensão ou do motor.
- Tratamento inseguro de arquivos do projeto, configuração (`.pawnpro/`), entrada do compilador ou do servidor.
- Manuseio de credenciais (ex.: senha RCON) e de conexões de rede da extensão.

O que **não** está no escopo:

- Vulnerabilidades em dependências de terceiros — reporte aos respectivos mantenedores. A extensão embute no `.vsix` apenas as dependências de runtime estritamente necessárias; as ferramentas de build e teste (`devDependencies`) **não são distribuídas** e não afetam quem usa a extensão. O `.vsix` publicado é a fonte da verdade sobre o que é distribuído.
- Comportamento do compilador `pawncc`, do servidor SA-MP/open.mp ou de plugins de terceiros.
- Configurações inseguras feitas pelo próprio usuário (ex.: expor a porta RCON publicamente).

---

## Versões suportadas

Somente a versão mais recente recebe correções de segurança. A extensão é distribuída pelo [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=NullSablex.pawnpro), [Open VSX](https://open-vsx.org/extension/NullSablex/pawnpro) e como artefato `.vsix` nas [Releases do GitHub](https://github.com/NullSablex/PawnPro/releases).

---

## Práticas do projeto

- As dependências de CI são fixadas por commit SHA; o build usa lockfile (`npm ci`) e o deploy da documentação usa hashes (`pip install --require-hashes`).
- Análise estática de segurança via **CodeQL** e avaliação de boas práticas via **OpenSSF Scorecard** rodam no repositório.
- Atualizações de dependências chegam pelo **Dependabot**.
