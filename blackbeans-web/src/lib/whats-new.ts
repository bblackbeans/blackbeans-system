/**
 * Changelog / guia de novidades (modal Versao).
 * Ao publicar: incremente APP_WHATS_NEW_VERSION e adicione paginas em WHATS_NEW_RELEASE.pages.
 * Opcional: coloque prints em /public/whats-new/ e referencie em imageSrc.
 */
export const APP_WHATS_NEW_VERSION = "1.4.0-msg";

export type WhatsNewPage = {
  id: string;
  /** Rotulo curto na barra de capitulos */
  chapter: string;
  title: string;
  summary: string;
  /** Onde achar no sistema */
  where: string;
  /** Passos para validar */
  howToTest: string[];
  /** Bullets extras (o que mudou) */
  highlights?: string[];
  /** Ex.: "/whats-new/sprint.png" em public/ */
  imageSrc?: string;
  imageAlt?: string;
  /** Reserva o bloco de print mesmo sem arquivo ainda */
  showScreenshot?: boolean;
  /** Pos-scriptum na pagina final */
  ps?: string;
};

export type WhatsNewRelease = {
  version: string;
  title: string;
  subtitle: string;
  pages: WhatsNewPage[];
};

/** @deprecated Prefer pages; mantido so para tipagem legada se algum import antigo existir */
export type WhatsNewSection = {
  title: string;
  items: string[];
};

export const WHATS_NEW_RELEASE: WhatsNewRelease = {
  version: "1.4.0",
  title: "Novidades da versao 1.4.0",
  subtitle: "Board puxa status, sprint semanal e imputador de atas.",
  pages: [
    {
      id: "cover",
      chapter: "Capa",
      title: "Versao 1.4.0",
      summary:
        "Tres novidades grandes: o board puxa tarefas pelo status, a sprint vira pasta da semana e o imputador transforma ata em tarefas.",
      where: "",
      howToTest: [
        "Folheie com Anterior / Proximo ou as setas do teclado.",
        "No fim, clique em Entendi.",
      ],
      highlights: [
        "Puxar status no board, Sprint na sidebar e Imputador de tarefas.",
      ],
    },
    {
      id: "board",
      chapter: "Board",
      title: "O board puxa a tarefa pelo status",
      summary:
        "No cabecalho do quadro, Puxar status diz quais status caem naquele board. Ao criar ou mudar o status, a tarefa vai para o board que puxa aquele status e para o grupo certo: A fazer, Em andamento ou Concluido.",
      where: "Projetos → abra um projeto → cabecalho do quadro → Puxar status.",
      howToTest: [
        "Num projeto com dois boards, faca um puxar Em andamento e o outro puxar A fazer.",
        "Mude o status de uma tarefa: ela deve ir para o board correspondente.",
        "Dois boards do mesmo projeto nao podem puxar o mesmo status.",
      ],
      highlights: [
        "A tarefa segue o status, nao o contrario.",
        "Depois do board, o grupo (A fazer / Em andamento / Concluido) tambem alinha.",
      ],
      showScreenshot: true,
      imageSrc: "/whats-new/board-puxar-status.png",
      imageAlt: "Seletor Puxar status no cabecalho do board",
    },
    {
      id: "sprint",
      chapter: "Sprint",
      title: "Pasta da semana, por pessoa",
      summary:
        "Sprint e uma pasta de segunda a sexta com um retrato das tarefas de cada pessoa. Gerar monta a lista da semana. Travar congela o retrato: mudancas futuras nas tarefas nao entram mais nessa pasta. Admin pode ajustar as datas.",
      where: "Menu Sprint (sidebar).",
      howToTest: [
        "Abra Sprint e gere a semana atual.",
        "Confira as tarefas agrupadas por pessoa.",
        "Trave a pasta e veja que ela deixa de acompanhar mudancas novas.",
      ],
      highlights: [
        "Snapshot da semana, nao o board ao vivo.",
        "Travar = essa pasta nao muda mais.",
      ],
      showScreenshot: true,
      imageSrc: "/whats-new/sprint.png",
      imageAlt: "Pasta de sprint com tarefas agrupadas por pessoa",
    },
    {
      id: "imputador",
      chapter: "Imputador",
      title: "Da ata para as tarefas",
      summary:
        "Anexe a ata da reuniao. O sistema gera rascunhos para voce editar. So vira tarefa no projeto quando voce converter — uma a uma ou todas. Responsavel, status, prioridade e prazo sao opcionais (padrao: A fazer, prioridade media, sem data). Cliente e projeto sao obrigatorios: no padrao da ata ou em cada rascunho.",
      where: "Menu Imputador de tarefas (sidebar).",
      howToTest: [
        "Anexe um PDF com texto selecionavel (nao escaneado).",
        "Ajuste cliente/projeto padrao ou por tarefa e clique Converter.",
        "Ata convertida fecha; clique no titulo para reabrir.",
      ],
      highlights: [
        "Nada vai para o projeto sem voce confirmar.",
        "Ata convertida fica fechada no acordeao.",
      ],
      showScreenshot: true,
      imageSrc: "/whats-new/imputador.png",
      imageAlt: "Imputador com rascunhos da ata e botao Converter",
    },
    {
      id: "tambem",
      chapter: "Tambem",
      title: "Ajustes menores",
      summary: "Detalhes que acompanham as tres funcionalidades.",
      where: "Projetos (arvore) · Imputador de tarefas.",
      howToTest: [],
      highlights: [
        "Na arvore de Projetos, o clique abre a area ou o portfolio — nao a lista geral.",
        "Apagar rascunho no imputador pede confirmacao.",
        "Cliente e projeto mostram asterisco de obrigatorio.",
      ],
    },
    {
      id: "fim",
      chapter: "Fim",
      title: "",
      summary: "Aos poucos esse sistema ta ficando muito bom",
      where: "",
      howToTest: [],
      imageSrc: "/whats-new/equipe-blackbeans.png",
      imageAlt: "Time Black Beans",
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
