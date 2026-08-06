/**
 * Changelog exibido no modal "Novidades".
 * Ao publicar uma atualização, incremente APP_WHATS_NEW_VERSION e descreva as mudanças.
 * Usuarios que ainda nao viram essa versao veem o modal na primeira sessao logada.
 */
export const APP_WHATS_NEW_VERSION = "1.3";

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
  title: "Novidades da versao 1.3",
  subtitle: "Subtarefas completas, tempo estilo Monday, grupos por status e pedido com audio",
  sections: [
    {
      title: "Subtarefas",
      items: [
        "Mesmas colunas das tarefas mae: prazo inicio, prazo fim, tempo e acoes (play, editar, excluir).",
        "Expansao igual no Dashboard, Meu trabalho e boards de projeto.",
      ],
    },
    {
      title: "Controle de tempo",
      items: [
        "Editar ou adicionar sessao com dia no calendario e horarios de inicio/fim separados (estilo Monday).",
        "Duracao aparece na hora (horas, minutos e segundos) enquanto voce ajusta.",
        "Sessoes manuais e editadas ficam em vermelho — util quando o play ficou ligado demais.",
      ],
    },
    {
      title: "Grupos automaticos",
      items: [
        "Status backlog / a fazer → grupo Backlog.",
        "Status concluido → grupo Concluido.",
        "Qualquer outro status → grupo Em andamento.",
      ],
    },
    {
      title: "Pedido publico e midia",
      items: [
        "Cliente anexa imagem, arquivo ou grava audio no pedido publico.",
        "Preview da gravacao com barra de progresso correta; audio chega no admin.",
        "Anexos e midia mais estaveis (URLs /media) e mencoes com som de alerta.",
      ],
    },
    {
      title: "Busca e filtros",
      items: [
        "Busca em titulo, descricao e subtarefas.",
        "Filtro de colaborador no Dashboard tambem encontra quem esta so na subtarefa.",
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
