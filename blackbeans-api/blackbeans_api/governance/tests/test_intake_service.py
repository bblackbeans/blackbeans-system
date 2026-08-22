from blackbeans_api.governance.intake_service import extract_gemini_actions
from blackbeans_api.governance.intake_service import extract_tasks_heuristic
from blackbeans_api.governance.intake_service import suggest_tasks_from_ata


def test_heuristic_splits_action_bullets():
    text = """Sprint Diária
Convidados Ana Bruno
Resumo
Reunião de alinhamento revisou fluxos.
Ações
- Ana monta o brand book da campanha
- Bruno revisa os posts do Instagram
"""
    tasks = extract_tasks_heuristic(text)
    assert len(tasks) == 2
    assert "brand book" in tasks[0]["title"].lower()
    assert "instagram" in tasks[1]["title"].lower()


def test_heuristic_named_assignee_with_colon():
    text = """Ações
- Barbara: enviar o relatório semanal da sprint
"""
    tasks = extract_tasks_heuristic(text)
    assert len(tasks) == 1
    assert tasks[0]["assignee_hint"] == "Barbara"
    assert "relatório" in tasks[0]["title"].lower() or "relatorio" in tasks[0]["title"].lower()


def test_suggest_without_llm_does_not_dump_whole_file(monkeypatch):
    monkeypatch.setattr("blackbeans_api.governance.intake_service.is_llm_enabled", lambda: False)
    result = suggest_tasks_from_ata(
        filename="Sprint Diaria.pdf",
        text="Resumo da reuniao sem lista de acoes claras.",
    )
    assert result["tasks"] == []


def test_suggest_without_llm_uses_bullets(monkeypatch):
    monkeypatch.setattr("blackbeans_api.governance.intake_service.is_llm_enabled", lambda: False)
    result = suggest_tasks_from_ata(
        filename="ata.pdf",
        text="Ações\n- Entregar o brand book\n- Revisar posts do cliente",
    )
    assert len(result["tasks"]) == 2
    assert result["tasks"][0]["title"].startswith("Entregar")


def test_word_per_line_pdf_does_not_become_tasks():
    text = """pendências
 de
 marketing
 e
 desenvolvimento,
 priorizando
 a
 organização
 do
 fluxo
 de
 tarefas.
"""
    assert extract_tasks_heuristic(text) == []


GEMINI_ATA = """
ago. 17, 2026
Sprint Semanal
Resumo
A equipe analisou as pendências de marketing e desenvolvimento, priorizando a organização do fluxo de tarefas.
Próximas etapas
[Gabriela Bernardes] Investigar imagem Losinsk: Verificar documentacao para identificar referencia de imagem de estruturacao de servicos conforme site.
[Gabriela Bernardes] Enviar testemunho BNI: Submeter testemunho BNI para aprovacao final.
[Kauê Ronald Silva Nascimento] Finalizar enriquecimento: Concluir tarefa pendente de enriquecimento de listas da Black Beans.
[Kauê Ronald Silva Nascimento] Desenvolver sistema Alpha: Implementar funcionalidades do sistema Alpha e realizar testes locais para o evento.
[Barbara Thimoteo] Consultar clientes: Consultar clientes sobre imagem de estruturacao de servicos e pontos de diagramacao para Losinsk.
[Barbara Thimoteo] Estruturar projeto Celine: Inserir tarefas no sistema seguindo o escopo do projeto Celine e validar itens concluidos.
[Fagner de Sousa] Validar estrutura Celine: Revisar checklist de entregas do projeto Celine com a equipe.
[Fagner de Sousa] Finalizar Reforte: Finalizar as configurações pendentes de Google Tag Manager e Analytics para o projeto Reforte.
[Barbara Thimoteo, Fagner de Sousa] Discutir Leads: Realizar o alinhamento sobre a estratégia de campanhas de leads antes da reunião com o cliente.
[O grupo] Definir Estimativas: Mapear e definir estimativas de tempo base para os serviços padrões no sistema de gestão de tarefas.
Detalhes
● Conversa Inicial: O grupo iniciou a reunião com uma conversa informal sobre cortes de cabelo.
"""


def test_gemini_proximas_etapas_are_real_actions():
    tasks = extract_gemini_actions(GEMINI_ATA)
    titles = [row["title"] for row in tasks]
    assert len(tasks) == 10
    assert "Investigar imagem Losinsk" in titles
    assert "Desenvolver sistema Alpha" in titles
    assert "Definir Estimativas" in titles
    assert not any(row["title"].casefold() in {"marketing", "desenvolvimento,", "priorizando", "organização"} for row in tasks)
    gabriela = next(row for row in tasks if row["title"].startswith("Investigar"))
    assert gabriela["assignee_hint"] == "Gabriela Bernardes"
    grupo = next(row for row in tasks if row["title"].startswith("Definir"))
    assert grupo["assignee_hint"] == ""


def test_gemini_pdf_word_wrap_still_finds_actions():
    wrapped = (
        "Próximas  etapas \n "
        "[Gabriela  Bernardes]  Investigar  imagem  Losinsk:  Verificar  documentacao  para  site.   "
        "[Fagner  de  Sousa]  Finalizar  Reforte:  Finalizar  as  configuracoes  do  GTM.\n"
        "Detalhes  \n●  Conversa  Inicial :  papo  informal."
    )
    tasks = extract_gemini_actions(wrapped)
    assert [row["title"] for row in tasks] == ["Investigar imagem Losinsk", "Finalizar Reforte"]


def test_suggest_uses_llm_when_enabled(monkeypatch):
    monkeypatch.setattr("blackbeans_api.governance.intake_service.is_llm_enabled", lambda: True)
    monkeypatch.setattr(
        "blackbeans_api.governance.intake_service.complete_text",
        lambda **_kwargs: (
            '{"client_name": "Losinsk", "tasks": ['
            '{"title": "Investigar imagem Losinsk", "description": "Verificar documentacao",'
            ' "assignee_hint": "Gabriela Bernardes", "client_name": "Losinsk"}]}'
        ),
    )
    result = suggest_tasks_from_ata(filename="ata.pdf", text=GEMINI_ATA)
    assert len(result["tasks"]) == 1
    assert result["tasks"][0]["title"] == "Investigar imagem Losinsk"
    assert result["client_name"] == "Losinsk"


def test_suggest_falls_back_to_gemini_if_llm_returns_junk(monkeypatch):
    monkeypatch.setattr("blackbeans_api.governance.intake_service.is_llm_enabled", lambda: True)
    monkeypatch.setattr(
        "blackbeans_api.governance.intake_service.complete_text",
        lambda **_kwargs: '{"client_name": null, "tasks": [{"title": "marketing", "description": "marketing"}]}',
    )
    result = suggest_tasks_from_ata(filename="ata.pdf", text=GEMINI_ATA)
    assert len(result["tasks"]) == 10
    assert result["tasks"][0]["title"] != "marketing"
