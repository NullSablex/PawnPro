/**
 * O que a barra de progresso do ciclo de depuração deve fazer a cada mensagem
 * DAP.
 *
 * Separado do editor para a sequência real poder ser testada. Ao parar, o
 * editor manda `terminate`, recebe `terminated` e só então manda `disconnect`.
 * Abrir "parando" no `disconnect` e esperar outro `terminated` deixava a barra
 * presa: o fim já tinha sido avisado, e um adaptador que roda dentro do núcleo
 * não gera saída de processo.
 */

/** A ação sobre a barra: abrir com um título, fechar, ou nada. */
export type CycleAction = { open: 'restarting' | 'stopping' } | 'close' | null;

export class DebugCycle {
  /** A sessão já avisou o fim: nada mais abre barra. */
  private ended = false;

  /** Uma mensagem que o editor manda ao adaptador. */
  onRequest(command: string | undefined): CycleAction {
    if (this.ended) return null;
    // As ações longas que o usuário dispara e fica sem retorno. `launch` já
    // tem a barra da compilação.
    if (command === 'restart') return { open: 'restarting' };
    if (command === 'terminate' || command === 'disconnect') return { open: 'stopping' };
    return null;
  }

  /** Um evento que o adaptador manda ao editor. */
  onEvent(event: string | undefined): CycleAction {
    // `continued`: o servidor novo está de pé. O rebuild NÃO fecha: quem
    // compila reusa a mesma barra, trocando o título.
    if (event === 'continued') return 'close';
    if (event === 'terminated') {
      this.ended = true;
      return 'close';
    }
    return null;
  }

  /** Uma resposta do adaptador: a do `disconnect` encerra a sessão. */
  onResponse(command: string | undefined): CycleAction {
    if (command !== 'disconnect') return null;
    this.ended = true;
    return 'close';
  }
}
