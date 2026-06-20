# Listas externas do assistente de nomes (.ban / .allow)

As listas longas do assistente de nomes — **nomes proibidos** (blocklist) e
**índices de loop tolerados** — moram em arquivos próprios, não no JSON de
configuração. Isso mantém o `config.json` enxuto e dá ao dev um arquivo simples
de editar.

## Arquivos

| Lista | Arquivo padrão | Extensão |
|-------|----------------|----------|
| Nomes proibidos | `.pawnpro/naming-blocklist.ban` | `.ban` |
| Índices de loop tolerados | `.pawnpro/naming-loop-indices.allow` | `.allow` |

**Formato:** um termo por linha; linhas em branco e iniciadas por `#` são
ignoradas; espaços nas pontas são removidos. Sem dependência de parser (a engine
lê com `lines().filter(...)`).

```
# PawnPro — nomes proibidos
tmp
foo
data
```

## Resolução (engine)

`NamingConfig::resolved_blocklist` / `resolved_loop_indices`:

1. Se o caminho (`blocklistFile` / `loopIndicesFile`) aponta para um arquivo
   legível → usa o arquivo.
2. Senão → cai no fallback inline (`blocklist` / `allowShortInLoops` do JSON).

O caminho chega à engine já com `${workspaceFolder}` resolvido pela extensão.

## Geração (extensão)

Quando o assistente está ligado (`naming.enabled`), a extensão semeia os
arquivos ausentes com os padrões da config (`configBridge::ensureNamingFiles`),
sem sobrescrever os existentes. A página de configurações expõe um botão
**"Abrir arquivo"** por lista (cria e abre).

## Status

| Fase | Estado |
|------|--------|
| 1 — Arquivos como fonte + leitura com fallback + geração + "Abrir arquivo" | ✅ |
| 2 — Migração do JSON (botão + recuperação) | ✅ |
| 3 — Exibição inline limitada na página | ⬜ planejado |

### Migração (implementada)

Decidido durante a implementação que a migração é **manual**, não automática
("migrar automaticamente é ruim" — o dev controla):

- **Botão "Migrar"** na seção Nomenclatura, exibido só quando há listas inline
  obsoletas no `config.json`. Move os termos para os arquivos `.ban`/`.allow` e
  limpa o JSON.
- **Backup só dos itens** das chaves migradas (não do `config.json` inteiro),
  num `naming-backup-<timestamp>.json`; o caminho é informado ao dev.
- **Confirmação por tamanho**: se o conteúdo excede o limite, pede aval antes.
- **Sem limite na migração**: a lista inteira é movida, por maior que seja.
- **Comando "Recuperar configuração grande"** — lê o `config.json` cru ignorando
  o teto (caso esteja grande demais para ser parseado normalmente), extrai as
  listas e reduz o JSON. Salva-vidas para o impasse de config gigante.

### Pendente (Fase 3)

- **Exibição inline limitada** — uma prévia dos primeiros N termos do arquivo na
  própria página (lendo do arquivo, não do JSON), com botão para abrir o resto.
