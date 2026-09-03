# Compiladores

O PawnPro usa o compilador para mais do que gerar o `.amx`: a análise da engine
e a depuração dependem do bloco de informação de debug (`-d3`). Um compilador
que gere esse bloco em formato diferente quebra os breakpoints, ainda que o
script rode.

Esta página lista o que foi **verificado em uso real**. "Não testado" não
significa que falhe — significa que ninguém confirmou.

## Verificados

| Compilador | Versão | Linux | Windows | macOS |
|---|---|---|---|---|
| [open.mp](https://github.com/openmultiplayer/compiler) | 3.10.10 (i386) | sim | não testado | não há build |
| SA-MP (Pawno) | 3.10.x (i386) | não há build | não testado | não há build |

As colunas são por **sistema**, não por arquitetura: os compiladores são de 32
bits e rodam em máquina de 64.

!!! warning "macOS"

    Nenhum dos dois publica build para macOS. Quem depura num Mac precisa
    compilar o `.amx` noutra máquina, ou construir o compilador do open.mp a
    partir do fonte — caminho não verificado aqui.

O compilador do open.mp é o único com build para Linux, e serve tanto a
gamemodes open.mp quanto SA-MP — o fork mantém a compatibilidade. O do SA-MP
vem no Pawno, só para Windows.

Usa uma combinação que não está aqui? O relato ajuda:
[abra uma issue](https://github.com/NullSablex/PawnPro/issues).

## Sobre a versão

O pacote do servidor open.mp distribui a **3.10.10**, em `qawno/`. O
repositório tem a tag **v3.10.11**, mais recente que a distribuída e ainda sem
verificação aqui.

A linha de versão que o compilador imprime (`Pawn compiler 3.10.10`) vem do
Pawn original e é a mesma em builds diferentes — ela não identifica de onde o
binário veio.

## Onde o PawnPro procura

A detecção automática busca o `pawncc` nos caminhos usuais do projeto:
`qawno/`, `pawno/` e a raiz. Para apontar um caminho fixo, use `compiler.path`
em `.pawnpro/config.json`, ou o campo **Caminho do compilador** na página de
configurações.

## Outros compiladores

Podem funcionar, mas não há verificação. Os riscos são um bloco de debug que o
depurador não lê — os breakpoints não pegam, sem erro visível — ou construções
que a análise da engine não reconhece.
