/**
 * Changelog / guia de novidades (modal Versao).
 * Ao publicar: incremente APP_WHATS_NEW_VERSION e adicione paginas em WHATS_NEW_RELEASE.pages.
 * Opcional: coloque prints em /public/whats-new/ e referencie em imageSrc.
 */
export const APP_WHATS_NEW_VERSION = "1.3.1";

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
  /** Ex.: "/whats-new/subtarefas.png" em public/ */
  imageSrc?: string;
  imageAlt?: string;
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
  version: APP_WHATS_NEW_VERSION,
  title: "Novidades da versao 1.3.1",
  subtitle: "Folheie as paginas: o que mudou, onde fica e como testar.",
  pages: [
    {
      id: "cover",
      chapter: "Capa",
      title: "Bem-vindo as novidades da versao",
      summary:
        "Cada mudanca tem uma pagina: local no sistema, o que mudou e um mini roteiro de teste.",
      where: "Este modal aparece no login quando ha versao nova (ou via ?whatsNew=1).",
      howToTest: [
        "Use as setas ← → ou os botoes Anterior / Proximo.",
        "Pule capitulos pelos pontos ou pelos rotulos no topo.",
        "No fim, clique em Entendi para marcar como visto.",
      ],
      highlights: [
        "Versao 1.3.1 — subtarefas, tempo estilo Monday, grupos por status, pedido com audio e guias de teste.",
      ],
    },
    {
      id: "subtarefas",
      chapter: "Subtarefas",
      title: "Subtarefas iguais as tarefas mae",
      summary:
        "Ao expandir uma tarefa, as subtarefas mostram prazo inicio, prazo fim, tempo e as mesmas acoes (play, editar, excluir).",
      where: "Dashboard · Meu trabalho · Projeto (lista do board) → seta de expandir na linha da tarefa.",
      howToTest: [
        "Abra Dashboard ou Meu trabalho e expanda uma tarefa com subtarefas.",
        "Confirme as colunas Prazo inicio, Prazo fim, Tempo e Acoes.",
        "Inicie o play numa subtarefa e abra o drawer dela pelo lapis.",
      ],
      highlights: [
        "Mesmo padrao visual nas tres areas (Dashboard, Meu trabalho e board).",
        "Correcao do aviso do Ant Design na expansao de Meu trabalho.",
      ],
      imageAlt: "Tabela expandida com subtarefas e colunas alinhadas",
    },
    {
      id: "tempo",
      chapter: "Tempo",
      title: "Editar tempo estilo Monday",
      summary:
        "Adicionar ou editar sessao usa calendario (dia) + horario de inicio e fim separados, com duracao ao vivo.",
      where: "Abra uma tarefa → aba Registros de tempo → Adicionar sessao ou Editar num registro.",
      howToTest: [
        "Abra uma tarefa e va em Registros de tempo.",
        "Clique Editar num registro (ou Adicionar sessao).",
        "Mude so o dia, depois so o horario de fim — veja a duracao (00h XXm XXs) atualizar.",
        "Salve: sessao editada fica em vermelho com rotulo (editado); manual fica (manual).",
      ],
      highlights: [
        "Util quando o play ficou ligado demais.",
        "Modal sem datetime unico — dia e horarios separados.",
      ],
      imageAlt: "Modal de atualizar sessao com dia e horarios",
    },
    {
      id: "grupos",
      chapter: "Grupos",
      title: "Grupos automaticos por status",
      summary:
        "Mudar o status move a tarefa para o grupo certo do board (e cria o grupo se nao existir).",
      where: "Qualquer tarefa no board / tabela → coluna Status (ou no drawer).",
      howToTest: [
        "Pegue uma tarefa em Backlog / A fazer e mude para Em andamento — deve ir ao grupo Em andamento.",
        "Mude para Concluido — deve ir ao grupo Concluido.",
        "Volte para A fazer — deve voltar ao Backlog (ou alias Todo / A fazer).",
      ],
      highlights: [
        "Backlog / a fazer → Backlog",
        "Concluido → Concluido",
        "Qualquer outro status → Em andamento",
      ],
    },
    {
      id: "pedido",
      chapter: "Pedido",
      title: "Pedido publico com audio",
      summary:
        "No formulario publico o cliente grava audio com nivel do microfone e preview; o admin ouve no pedido.",
      where: "Pagina /pedido (publico) · Admin → Pedidos de clientes → Visualizar.",
      howToTest: [
        "Abra /pedido, clique Gravar audio, fale e confira a barra de nivel.",
        "Pare e ouça o Preview (barra de progresso deve andar).",
        "Envie o pedido; no admin, abra Detalhes e reproduza o anexo.",
      ],
      highlights: [
        "Preview local com scrub corrigido.",
        "Anexos e midia via /media mais estaveis.",
      ],
      imageAlt: "Preview da gravacao no pedido publico",
    },
    {
      id: "busca",
      chapter: "Busca",
      title: "Busca e filtro de colaborador",
      summary:
        "A busca olha titulo, descricao e subtarefas. No Dashboard, filtrar colaborador tambem acha quem so esta na subtarefa.",
      where: "Dashboard (filtros no topo) · Meu trabalho (busca).",
      howToTest: [
        "No Dashboard, busque um trecho que so existe na subtarefa — a mae deve aparecer.",
        "Filtre por um colaborador que so e responsavel da subtarefa — a mae entra na lista.",
        "Em Meu trabalho, repita a busca por texto da subtarefa.",
      ],
    },
    {
      id: "modal-tarefa",
      chapter: "UI",
      title: "Modal Nova tarefa sem scroll feio",
      summary: "O formulario de criar tarefa cabe na largura do modal, sem barra horizontal.",
      where: "Projeto / board → Nova tarefa (ou atalho equivalente).",
      howToTest: [
        "Abra Nova tarefa.",
        "Confirme que nao ha barra de rolagem horizontal no rodape do formulario.",
        "Preencha prazos inicio/fim e crie normalmente.",
      ],
    },
    {
      id: "fim",
      chapter: "Fim",
      title: "Um recado do Dev",
      summary:
        "Um bom dia para nossos colaboradores — em especial a chefia Babi e Fagu (que gosta desse lembrete) — e lembrem: precisamos achar um nome melhor para esse sistema do que Blackbeans System kkkk",
      where: "",
      howToTest: [],
      imageSrc: "/whats-new/equipe-blackbeans.png",
      imageAlt: "Time Black Beans",
      ps: "nao gastei horas de trabalho nisso, eu nao fui pra academia e acabou saindo isso kkkk",
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
