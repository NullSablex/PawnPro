# Naming Assistant (offline)

Assistente de nomes para o código Pawn do usuário. **100% offline e
determinístico** — sem modelo de IA, sem rede, sem envio de código para fora.
"Inteligência" aqui = heurísticas + o contexto semântico que a engine já extrai
da AST (`Symbol`, `Param`, tags). Alinhado à natureza da engine (Rust puro).

> Convenção: **genérica e configurável**. A ferramenta não impõe um idíge de
> comunidade (ex.: `playerid`/`Iter_`); apenas detecta nomes pobres e aplica o
> estilo de caixa escolhido por categoria de símbolo.

## Por que não IA de verdade

| Opção | Veredito |
|-------|----------|
| Modelo local embarcado | Infla o pacote (centenas de MB), consome RAM/CPU, qualidade baixa para nomear. ❌ |
| API (Claude/OpenAI) | Exige chave + rede + **envia código do gamemode para fora** (privacidade). ❌ |
| Heurística determinística | Leve, instantânea, privada, sem dependências. ✅ |

Para nomes, a maior parte do valor vem de regras + contexto de tipo/escopo —
não de um LLM.

## O que a engine já oferece

- `Symbol { name, kind, signature, params, line, col }`
- `Param { name, tag: Option<String>, is_variadic }` — a `tag` carrega `Float:`,
  tags de enum, etc.: insumo direto para sugerir nome por tipo.
- Pipeline de diagnósticos (`analyzer/`) com `PawnDiagnostic` + `codes::PPxxxx`
  + `MsgKey` (localizável). Próximo código livre: **PP0018**.
- Capabilities LSP em `server.rs::server_capabilities()` — hoje **sem** rename
  nem code action; serão adicionadas na Fase 2.

## Fases

### Fase 1 — Diagnóstico de nomes pobres (`PP0018`)

Puramente analítica: reusa o pipeline de `analyzer/`, vira um diagnóstico novo.
Sem capabilities LSP novas. Entrega valor imediato e é a base do resto.

Detecta (configurável, tudo desligável):
- **1 letra fora de contexto trivial**: `new a` em escopo não-loop. Toleráveis:
  `i`/`j`/`k` em `for`, e o que a config liberar.
- **Placeholders genéricos**: `tmp`, `temp`, `aux`, `foo`, `bar`, `data`, `var`,
  `x1`/`x2` sequenciais — lista configurável.
- **Estilo divergente** da convenção escolhida (ver Fase 3).

Severidade: `hint`/`information` (nunca `error` — é estilo, não correção).

### Fase 2 — Sugestão de nome (rename + code action)

Implementado:

- **Rename nativo** (`rename_provider` com `prepareProvider`): reusa
  `get_references` para achar todas as ocorrências e devolve um `WorkspaceEdit`.
  Em `src/intellisense/rename.rs`. Funciona em qualquer identificador, não só nos
  sinalizados.
- **Code action** (`code_action_provider`): sobre o identificador na seleção,
  oferece converter para os estilos configurados em `naming.style`
  (`src/naming/suggest.rs` → `naming::suggestions_for`), cada um como quick-fix
  que aplica o rename. Associa-se ao diagnóstico `PP0018` quando presente.

A sugestão é **oferta**, não imposição: o usuário escolhe aplicar.

**Escopo desta versão**: a sugestão é **normalização de caixa** ao estilo
configurado (`playerHealth` → `player_health`). A derivação semântica que o
desenho original previa — nome a partir de tag (`Float:`), do inicializador
(`GetPoolSize()` → `poolSize`) ou do papel sintático — **não** está implementada;
fica como evolução futura, pois exige heurística mais arriscada (e podia sugerir
algo pior). O `split_words` de `suggest.rs` já reconhece as fronteiras
(`snake`/`camel`/`Pascal`/`UPPER`), então a base para isso existe.

### Fase 3 — Convenção configurável

Em `.pawnpro/config.json`, seção `naming` (genérica, sem domínio):

```jsonc
{
  "naming": {
    "enabled": true,
    "style": {
      "functions": "camelCase",   // camelCase | snake_case | PascalCase | off
      "globals":   "camelCase",
      "locals":    "camelCase",
      "constants": "UPPER_CASE",
      "enums":     "PascalCase"
    },
    "minLength": 2,
    "allowShortInLoops": ["i", "j", "k"],
    "blocklist": ["tmp", "temp", "aux", "foo", "bar", "data"]
  }
}
```

Sem config, o assistente fica em modo conservador (só placeholders óbvios e
nomes de 1 letra fora de loop) ou totalmente desligado — a definir na Fase 1.

## Arquitetura proposta

```
src/naming/
├── mod.rs        — API pública: analyze(symbols, cfg) -> Vec<NameIssue>
├── rules.rs      — heurísticas de detecção (1 letra, blocklist, estilo)
├── style.rs      — camelCase/snake_case/PascalCase: detectar e converter
└── suggest.rs    — Fase 2: derivar nome a partir de tag/inicializador/papel
```

- `analyzer/` consome `naming::analyze` e emite `PP0018` (Fase 1).
- `server.rs` ganha handlers de rename/code-action que chamam `naming::suggest`
  (Fase 2).
- Mensagens via `MsgKey` (novas chaves em `messages/`), localizadas como o resto.

## Decisões em aberto (resolver ao implementar a Fase 1)

1. **Default desligado ou conservador?** Recomendação: conservador (só sinais
   fortes) para não irritar quem não pediu.
2. **Escopo de "local"**: `symbols.rs` cobre top-level (funções/globais/enums);
   variáveis locais já aparecem no `StmtTree` como `StmtKind::VarDecl` com
   `depth`. Verificado: a Fase 1 alcança ambos — top-level via `Symbol`, locais
   via `VarDecl` no StmtTree (resta extrair o identificador do token da decl).
3. **Severidade exata** e se entra no "Problems" ou só como hint inline.

## Status

| Fase | Estado |
|------|--------|
| 1 — Diagnóstico `PP0018` | ✅ implementado (funções, parâmetros e locais) |
| 2 — Sugestão (rename/code action) | ✅ implementado — rename nativo + quick-fix de estilo |
| 3 — Convenção configurável (estilo) | ✅ implementado — estilo por categoria (functions/globals/locals/constants/parameters), `off` por padrão |

### Cobertura atual da Fase 1

- Avalia: nomes de **funções definidas pelo usuário** (stock/public/static/plain)
  e seus **parâmetros**; e **variáveis locais** (`new`/`decl`/`static` dentro de
  corpo, incl. listas `a, b, c`, tags `Float:x`, dimensões e inicializadores).
  Exclui nativas/forwards de include (API externa) e globais de topo só entram
  uma vez (via `parsed.symbols`).
- Regras: **placeholder** (blocklist) e **comprimento mínimo** (com tolerância a
  índices de loop e ao descarte `_`).
- Severidade: `hint`. Desligado por padrão (`naming.enabled = false`).
- Extração de locais: `src/naming/locals.rs` varre os tokens (o `StmtTree` não
  guarda o identificador do `VarDecl`).
- **Estilo de caixa** (`src/naming/style.rs`): por categoria, em
  `analysis.naming.style` (`functions`/`globals`/`locals`/`constants`/
  `parameters`), cada um `camelCase`/`snake_case`/`PascalCase`/`UPPER_CASE`/`Capitalized_Snake`/`off`.
  Padrão `off` em todas — só checa o que o usuário pedir. Ordem das regras:
  placeholder → comprimento → estilo (a mais específica vence).
