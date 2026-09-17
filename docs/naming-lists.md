# Listas de nomes (.ban / .allow)

As listas longas do [assistente de nomes](naming-assistant.md) — **nomes
proibidos** e **índices de loop tolerados** — ficam em arquivos próprios, não no
JSON de configuração. O `config.json` continua enxuto, e a lista vira um arquivo
simples de editar, com realce de sintaxe próprio.

## Arquivos

| Lista | Chave | Arquivo padrão |
|-------|-------|----------------|
| Nomes proibidos | `analysis.naming.blocklistFile` | `.pawnpro/naming-blocklist.ban` |
| Índices de loop tolerados | `analysis.naming.loopIndicesFile` | `.pawnpro/naming-loop-indices.allow` |

**Formato:** um termo por linha. Linhas em branco e as iniciadas por `#` são
ignoradas, e os espaços nas pontas são removidos.

```
# PawnPro — nomes proibidos
tmp
foo
data
```

O núcleo lê no máximo `analysis.naming.maxListFileBytes` de cada arquivo
(padrão 32 MB); o limite não impede editá-lo.

## De onde vem a lista

O núcleo resolve `${workspaceFolder}` no caminho, lê o arquivo e entrega a lista
pronta à engine:

1. Arquivo legível e com pelo menos um termo → vale o arquivo.
2. Senão → valem as listas inline do JSON (`blocklist` / `allowShortInLoops`),
   ou os padrões.

Editar o arquivo reaplica os diagnósticos sozinho: o núcleo observa os arquivos
de configuração e as listas.

## Criação

Com o assistente ligado, os arquivos que não existem são criados com os termos
da configuração. Arquivos existentes nunca são sobrescritos. A seção
**Nomenclatura** da página de configurações tem um botão **Abrir arquivo** por
lista, que também cria o arquivo se faltar.

## Migrar listas do JSON

Configurações antigas guardavam as listas no `config.json`. A migração é
**manual** — quem decide é o desenvolvedor:

- **Botão Migrar**, na seção Nomenclatura, aparece só quando há listas inline no
  `config.json` do projeto. Acrescenta os termos aos arquivos `.ban`/`.allow`,
  sem duplicar os que já estão lá, e tira as listas do JSON.
- **Backup** só das listas migradas, num `naming-backup-<data>.json`, com o
  caminho informado ao final.
- **Confirmação por tamanho:** listas grandes pedem aval antes de migrar. A
  lista inteira é movida, por maior que seja.
- **Comando PawnPro: Recuperar configuração grande (migrar listas)** (`pawnpro.recoverConfig`):
  para um `config.json` grande demais para ser lido normalmente. Extrai as
  listas para os arquivos e reduz o JSON.

## Pendente

- **Prévia na página** — mostrar os primeiros termos do arquivo na própria seção
  Nomenclatura, com um botão para abrir o resto.
