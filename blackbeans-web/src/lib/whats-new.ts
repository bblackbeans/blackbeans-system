/**
 * Changelog exibido no modal "Novidades".
 * Ao publicar uma atualização, incremente APP_WHATS_NEW_VERSION e descreva as mudanças.
 * Usuarios que ainda nao viram essa versao veem o modal na primeira sessao logada.
 */
export const APP_WHATS_NEW_VERSION = "1.2.1";

export type WhatsNewSection = {
  title: string;
  items: string[];
};

export type WhatsNewRelease = {
  version: string;
  title: string;
  subtitle: string;
  sections: WhatsNewSection[];
};

export const WHATS_NEW_RELEASE: WhatsNewRelease = {
  version: APP_WHATS_NEW_VERSION,
  title: "Novidades da versao 1.2",
  subtitle: "Composer Monday, midia estavel, filtros, historico e reporte de erros",
  sections: [
    {
      title: "Descricao e Atualizacoes",
      items: [
        "Editor estilo Monday: formatacao, @mencao, emoji, link, checklist, anexar imagem ou arquivo.",
        "Colar print (Ctrl+V) sobe a imagem com preview na hora e toast de envio — sem duplicar o bloco.",
        "Rascunho local ate Atualizar (comentario) ou Salvar a tarefa (descricao).",
        "Apos Atualizar, o compositor limpa sozinho; clique unico nao cria comentario em dobro.",
        "Visualizacao com uma imagem so (lightbox no clique, sem thumbnail duplicado).",
      ],
    },
    {
      title: "Filtros",
      items: [
        "Meu trabalho no mesmo padrao do Dashboard: Incluir ou Exceto.",
        "Escolha varios status, prioridades, clientes e projetos de uma vez.",
        "No Dashboard, multiplos colaboradores e grupos tambem.",
      ],
    },
    {
      title: "Tarefas e historico",
      items: [
        "Colaboradores editam todas as infos da tarefa; mudancas entram no historico.",
        "Historico com cronometro, status e campos em portugues legivel.",
        "Menção (@) gera notificacao in-app e e-mail (conforme preferencias).",
      ],
    },
    {
      title: "Relatar problema",
      items: [
        "Print funciona com modais abertos; botao de reporte nao some com a tarefa aberta.",
        "Erros do sistema geram log automatico em Problemas (sem duplicar a cada poucos minutos).",
        "JSON de contexto tecnico com scroll — nao quebra mais o layout.",
      ],
    },
  ],
};

export function whatsNewStorageKey(userKey: string): string {
  return `bb_whats_new_seen:${userKey || "anon"}`;
}

export function hasSeenWhatsNew(userKey: string, version = APP_WHATS_NEW_VERSION): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(whatsNewStorageKey(userKey)) === version;
  } catch {
    return true;
  }
}

export function markWhatsNewSeen(userKey: string, version = APP_WHATS_NEW_VERSION): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(whatsNewStorageKey(userKey), version);
  } catch {
    // ignore quota / private mode
  }
}
