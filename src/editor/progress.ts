import * as vscode from 'vscode';

/**
 * Executa uma etapa longa com a notificação de progresso do editor.
 *
 * Subir, parar, reiniciar e compilar levam segundos e não dão retorno visual
 * nenhum por conta própria — sem isto o clique fica sem resposta e o usuário
 * não sabe se surtiu efeito.
 *
 * Vive fora do `ServerController` porque o F5 precisa da mesma coisa, e ter uma
 * cópia em cada arquivo já tinha começado a acontecer.
 */
export function withProgress<T>(title: string, step: () => Promise<T>): Thenable<T> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `PawnPro: ${title}`,
      cancellable: false,
    },
    step,
  );
}

/**
 * Uma barra de progresso cujo título muda ao longo de um ciclo de várias fases.
 *
 * O reinício em depuração é um ciclo só do ponto de vista do usuário, mas por
 * baixo tem duas etapas (compilar, depois reiniciar de fato). Com uma barra por
 * etapa elas apareciam ao mesmo tempo — e a de "reiniciando" mentia enquanto o
 * compilador rodava, porque o restart só começa depois dele.
 */
export interface DebugPhase {
  /** Troca o texto sem fechar a barra. */
  retitle(title: string): void;
  /** Encerra o ciclo. Chamar duas vezes é inofensivo. */
  done(): void;
}

export function newDebugPhase(title: string, onDone: () => void): DebugPhase {
  let report: ((v: { message?: string }) => void) | null = null;
  let finish: (() => void) | null = null;
  let current = title;

  void vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'PawnPro',
      cancellable: false,
    },
    (progress) => {
      report = (v) => progress.report(v);
      progress.report({ message: current });
      // O teto existe só para a barra não ficar presa se o evento de fim nunca
      // vier; o encerramento normal é sempre por evento do adaptador.
      return new Promise<void>((resolve) => {
        finish = resolve;
        setTimeout(() => finish?.(), 60000);
      });
    },
  );

  return {
    retitle(next: string) {
      current = next;
      report?.({ message: next });
    },
    done() {
      const f = finish;
      finish = null;
      if (f) { f(); onDone(); }
    },
  };
}
