/**
 * Changelog exibido no modal "Novidades".
 * Ao publicar uma atualização, incremente APP_WHATS_NEW_VERSION e descreva as mudanças.
 * Usuarios que ainda nao viram essa versao veem o modal na primeira sessao logada.
 */
export const APP_WHATS_NEW_VERSION = "2026.08.04";

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
  title: "Novidades desta atualizacao",
  subtitle: "Resumo do que mudou no BlackBeans System",
  sections: [
    {
      title: "Horas dos colaboradores",
      items: [
        "Detalhes por tarefa abrem em modal (esforco, horas, cliente e projeto).",
        "Coluna de esforco total por pessoa, junto com horas e quantidade de tarefas.",
        "Filtros de periodo: semana (seg–sex), total do mes e todo o tempo.",
        "Filtro por tipo: todos, so colaborador ou so admin — lista inclui ambos.",
        "Limpar filtros volta ao estado inicial e recarrega os dados (nao some a tabela).",
      ],
    },
    {
      title: "Pedidos de clientes",
      items: [
        "Status em portugues: Novo, Em analise, Convertido e Rejeitado.",
      ],
    },
    {
      title: "Visual e status",
      items: [
        "Cores dos status de tarefas mais vivas, no mesmo estilo das prioridades.",
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
