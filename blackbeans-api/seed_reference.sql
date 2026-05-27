BEGIN;

-- Seed de referência para ambiente de testes (PostgreSQL / Django).
-- Importante: este script limpa tabelas funcionais e reinsere uma base mínima coerente.

TRUNCATE TABLE
    governance_permissionconflictresolution,
    governance_permissionbulkpreview,
    governance_permissionassignment,
    governance_auditlog,
    governance_notification,
    governance_timelog,
    governance_taskactivity,
    governance_taskattachment,
    governance_taskcomment,
    governance_taskdependency,
    governance_task,
    governance_boardgroup,
    governance_board,
    governance_project,
    governance_portfolio,
    governance_workspace,
    users_usercollaboratorlink,
    users_collaboratordepartmentlink,
    users_collaborator,
    users_department,
    clients_client,
    users_user
RESTART IDENTITY CASCADE;

INSERT INTO users_department (id, name, code, created_at, updated_at) VALUES
('7a1d8c14-2f03-4a4f-90f8-1c9d26a7d3f1', 'Tecnologia', 'TEC', NOW(), NOW()),
('0e9b39c2-6f0c-4f4f-8e6a-2d4dce4b8a85', 'Produto', 'PRD', NOW(), NOW()),
('9f67d6bc-1d12-4c0a-b93a-8acb5b74d2e7', 'Operações', 'OPS', NOW(), NOW());

INSERT INTO users_collaborator (
    id, display_name, job_title, professional_email, phone, created_at, updated_at
) VALUES
('4be2e4df-6fdb-45b8-b697-3e4f2fd9f6aa', 'Ana Souza', 'Tech Lead', 'ana.souza@blackbeans.local', '+55 11 90000-0001', NOW(), NOW()),
('f8f2b5ab-d8b8-49f3-90c4-d30ee5fcb6f1', 'Bruno Lima', 'Product Manager', 'bruno.lima@blackbeans.local', '+55 11 90000-0002', NOW(), NOW()),
('3a4e4ec5-2f31-429f-b4a8-d95a3be8e0d2', 'Carla Mendes', 'Developer', 'carla.mendes@blackbeans.local', '+55 11 90000-0003', NOW(), NOW()),
('a97f48c5-0d8e-4188-a329-5adcb89b3e91', 'Diego Rocha', 'QA Analyst', 'diego.rocha@blackbeans.local', '+55 11 90000-0004', NOW(), NOW());

INSERT INTO users_user (
    id, password, last_login, is_superuser, username, email, is_staff, is_active,
    date_joined, name, totp_enabled, totp_secret, totp_pending_secret, totp_recovery_codes
) VALUES
(1001, '!', NULL, TRUE,  'admin',  'admin@blackbeans.local',  TRUE,  TRUE, NOW(), 'Administrador', FALSE, '', '', '[]'::jsonb),
(1002, '!', NULL, FALSE, 'ana',    'ana@blackbeans.local',    TRUE,  TRUE, NOW(), 'Ana Souza',    FALSE, '', '', '[]'::jsonb),
(1003, '!', NULL, FALSE, 'bruno',  'bruno@blackbeans.local',  TRUE,  TRUE, NOW(), 'Bruno Lima',   FALSE, '', '', '[]'::jsonb),
(1004, '!', NULL, FALSE, 'carla',  'carla@blackbeans.local',  FALSE, TRUE, NOW(), 'Carla Mendes', FALSE, '', '', '[]'::jsonb),
(1005, '!', NULL, FALSE, 'diego',  'diego@blackbeans.local',  FALSE, TRUE, NOW(), 'Diego Rocha',  FALSE, '', '', '[]'::jsonb);

INSERT INTO users_collaboratordepartmentlink (
    collaborator_id, department_id, is_active, created_at, updated_at
) VALUES
('4be2e4df-6fdb-45b8-b697-3e4f2fd9f6aa', '7a1d8c14-2f03-4a4f-90f8-1c9d26a7d3f1', TRUE, NOW(), NOW()),
('f8f2b5ab-d8b8-49f3-90c4-d30ee5fcb6f1', '0e9b39c2-6f0c-4f4f-8e6a-2d4dce4b8a85', TRUE, NOW(), NOW()),
('3a4e4ec5-2f31-429f-b4a8-d95a3be8e0d2', '7a1d8c14-2f03-4a4f-90f8-1c9d26a7d3f1', TRUE, NOW(), NOW()),
('a97f48c5-0d8e-4188-a329-5adcb89b3e91', '9f67d6bc-1d12-4c0a-b93a-8acb5b74d2e7', TRUE, NOW(), NOW());

INSERT INTO users_usercollaboratorlink (
    user_id, collaborator_id, is_active, created_at, updated_at
) VALUES
(1002, '4be2e4df-6fdb-45b8-b697-3e4f2fd9f6aa', TRUE, NOW(), NOW()),
(1003, 'f8f2b5ab-d8b8-49f3-90c4-d30ee5fcb6f1', TRUE, NOW(), NOW()),
(1004, '3a4e4ec5-2f31-429f-b4a8-d95a3be8e0d2', TRUE, NOW(), NOW()),
(1005, 'a97f48c5-0d8e-4188-a329-5adcb89b3e91', TRUE, NOW(), NOW());

INSERT INTO clients_client (id, name, status, description, created_at, updated_at) VALUES
('31c6727b-46f0-4a59-bb5a-2f8f3bfbb2f3', 'Cliente Alpha', 'active', 'Cliente ativo para cenários de entrega contínua.', NOW(), NOW()),
('5bf638a2-2f2a-4d28-8fa6-f4e1981795e0', 'Cliente Beta', 'active', 'Cliente ativo para cenários de sustentação.', NOW(), NOW()),
('8a8d59e3-7f9d-4a46-a2c1-6456b71c0e2a', 'Cliente Arquivado', 'inactive', 'Cliente inativo para testes de filtros.', NOW(), NOW());

INSERT INTO governance_workspace (id, name, client_id, created_at, updated_at) VALUES
('1a0f33d4-f8df-4f7a-b89a-beb4f1e53d8e', 'Workspace Alpha', '31c6727b-46f0-4a59-bb5a-2f8f3bfbb2f3', NOW(), NOW()),
('6d74f40f-9f16-4607-a7f8-3c7a4f8e4e6c', 'Workspace Beta', '5bf638a2-2f2a-4d28-8fa6-f4e1981795e0', NOW(), NOW());

INSERT INTO governance_portfolio (id, workspace_id, name, description, created_at, updated_at) VALUES
('21d67a5c-f7de-487f-b11a-d8526f62889e', '1a0f33d4-f8df-4f7a-b89a-beb4f1e53d8e', 'Plataforma Principal', 'Portfólio das frentes core.', NOW(), NOW()),
('2b6af38f-32dd-4ad8-b8cf-c9c74cdb503f', '6d74f40f-9f16-4607-a7f8-3c7a4f8e4e6c', 'Operações Internas', 'Portfólio das frentes operacionais.', NOW(), NOW());

INSERT INTO governance_project (
    id, portfolio_id, client_id, name, description, status,
    start_date, end_date, actual_start_date, actual_end_date, created_at, updated_at
) VALUES
(
    'f71344f4-c718-43c4-95f1-3ef0baac9d5e',
    '21d67a5c-f7de-487f-b11a-d8526f62889e',
    '31c6727b-46f0-4a59-bb5a-2f8f3bfbb2f3',
    'Portal B2B',
    'Evolução de portal para clientes enterprise.',
    'active',
    NOW() - INTERVAL '45 days',
    NOW() + INTERVAL '30 days',
    NOW() - INTERVAL '40 days',
    NULL,
    NOW(),
    NOW()
),
(
    '184d4743-df31-4f37-a479-f2ece45028ce',
    '2b6af38f-32dd-4ad8-b8cf-c9c74cdb503f',
    '5bf638a2-2f2a-4d28-8fa6-f4e1981795e0',
    'Automação de Backoffice',
    'Automação de processos internos e auditoria.',
    'on_hold',
    NOW() - INTERVAL '90 days',
    NOW() + INTERVAL '10 days',
    NOW() - INTERVAL '85 days',
    NULL,
    NOW(),
    NOW()
);

INSERT INTO governance_board (id, project_id, name, created_at, updated_at) VALUES
('6c111fce-6a68-45f0-8b4d-f2f6075a4f42', 'f71344f4-c718-43c4-95f1-3ef0baac9d5e', 'Board Portal B2B', NOW(), NOW()),
('35bf2353-f2e7-49f4-b5ec-1c7349c9c4c8', '184d4743-df31-4f37-a479-f2ece45028ce', 'Board Backoffice', NOW(), NOW());

INSERT INTO governance_boardgroup (id, board_id, name, position, wip_limit, created_at, updated_at) VALUES
('f8cf29cb-3c0e-40fb-bc74-4b42387ff2e7', '6c111fce-6a68-45f0-8b4d-f2f6075a4f42', 'A Fazer', 1, 20, NOW(), NOW()),
('89560968-9f66-42bc-8ec8-48fbb3ea3058', '6c111fce-6a68-45f0-8b4d-f2f6075a4f42', 'Em Progresso', 2, 10, NOW(), NOW()),
('f58d4eb8-8a93-4594-9a7d-9f539b4ec17e', '6c111fce-6a68-45f0-8b4d-f2f6075a4f42', 'Concluído', 3, 50, NOW(), NOW()),
('89fd065b-32af-42ec-a3c8-ae2b74af8518', '35bf2353-f2e7-49f4-b5ec-1c7349c9c4c8', 'Backlog', 1, 30, NOW(), NOW()),
('7989f14d-42cf-414f-9b9b-a07302639d9a', '35bf2353-f2e7-49f4-b5ec-1c7349c9c4c8', 'Executando', 2, 10, NOW(), NOW()),
('f0cd5b56-5ce3-48d4-b412-65f7ea3e785a', '35bf2353-f2e7-49f4-b5ec-1c7349c9c4c8', 'Finalizado', 3, 50, NOW(), NOW());

INSERT INTO governance_task (
    id, board_id, group_id, title, description, status, priority, effort_points,
    assignee_id, start_date, end_date, created_at, updated_at
) VALUES
(
    'e6ea88f8-6319-4e91-98e9-ee8b43ceef88',
    '6c111fce-6a68-45f0-8b4d-f2f6075a4f42',
    '89560968-9f66-42bc-8ec8-48fbb3ea3058',
    'Implementar login com 2FA',
    'Tela de autenticação com desafio TOTP.',
    'in_progress',
    'high',
    8,
    1002,
    NOW() - INTERVAL '7 days',
    NOW() + INTERVAL '3 days',
    NOW(),
    NOW()
),
(
    'c7dd6f0f-f898-47bf-a7e1-0cea9d855e51',
    '6c111fce-6a68-45f0-8b4d-f2f6075a4f42',
    'f8cf29cb-3c0e-40fb-bc74-4b42387ff2e7',
    'Criar endpoint de relatórios',
    'Endpoint consolidado para métricas de uso.',
    'todo',
    'medium',
    5,
    1004,
    NULL,
    NOW() + INTERVAL '12 days',
    NOW(),
    NOW()
),
(
    'e07f6290-2dab-4f20-ae5b-a4f0af8f8fe2',
    '6c111fce-6a68-45f0-8b4d-f2f6075a4f42',
    'f58d4eb8-8a93-4594-9a7d-9f539b4ec17e',
    'Configurar pipeline de deploy',
    'Pipeline validando lint, testes e migrações.',
    'done',
    'high',
    3,
    1005,
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '10 days',
    NOW(),
    NOW()
),
(
    '4e4767fd-7f77-4bf7-b21c-f31500e3d0f6',
    '35bf2353-f2e7-49f4-b5ec-1c7349c9c4c8',
    '7989f14d-42cf-414f-9b9b-a07302639d9a',
    'Automatizar conciliação financeira',
    'Rotina de conciliação com trilha de auditoria.',
    'blocked',
    'high',
    13,
    1003,
    NOW() - INTERVAL '15 days',
    NOW() + INTERVAL '5 days',
    NOW(),
    NOW()
);

INSERT INTO governance_taskdependency (id, task_id, depends_on_id, created_at) VALUES
('1d61bfa3-0f71-4ef3-b19b-732e3d04f4c1', 'e6ea88f8-6319-4e91-98e9-ee8b43ceef88', 'e07f6290-2dab-4f20-ae5b-a4f0af8f8fe2', NOW()),
('3cb2b4bd-71f1-4605-b594-4672f3df9722', 'c7dd6f0f-f898-47bf-a7e1-0cea9d855e51', 'e6ea88f8-6319-4e91-98e9-ee8b43ceef88', NOW());

INSERT INTO governance_taskcomment (id, task_id, author_id, content, created_at) VALUES
('d6d73671-eeb0-4a57-bf23-05b5288a306b', 'e6ea88f8-6319-4e91-98e9-ee8b43ceef88', 1002, 'Primeira entrega em homologação concluída.', NOW() - INTERVAL '2 days'),
('ae7df021-4c74-4c52-9515-77557f74b0ba', '4e4767fd-7f77-4bf7-b21c-f31500e3d0f6', 1003, 'Dependência externa ainda sem previsão.', NOW() - INTERVAL '1 day');

INSERT INTO governance_taskattachment (
    id, task_id, author_id, filename, content_type, size_bytes, created_at
) VALUES
('10ee7930-5cb2-4f45-a0d2-c27e5e43f2be', 'e6ea88f8-6319-4e91-98e9-ee8b43ceef88', 1002, 'especificacao-2fa.pdf', 'application/pdf', 245760, NOW() - INTERVAL '3 days'),
('a0e7f63c-7435-4f42-a48d-e639f24b2069', 'c7dd6f0f-f898-47bf-a7e1-0cea9d855e51', 1004, 'draft-relatorio.md', 'text/markdown', 8192, NOW() - INTERVAL '8 hours');

INSERT INTO governance_taskactivity (id, task_id, actor_id, event_type, summary, created_at) VALUES
('50b7aacb-efe3-4556-8764-0bd4dd8dbd3b', 'e6ea88f8-6319-4e91-98e9-ee8b43ceef88', 1002, 'status_changed', 'Status alterado para in_progress.', NOW() - INTERVAL '7 days'),
('ba3d157f-fd8e-4cfd-9762-84ba68c432ee', 'e07f6290-2dab-4f20-ae5b-a4f0af8f8fe2', 1005, 'status_changed', 'Status alterado para done.', NOW() - INTERVAL '10 days');

INSERT INTO governance_timelog (
    id, task_id, user_id, status, started_at, current_started_at, ended_at,
    accumulated_seconds, created_at, updated_at
) VALUES
(
    'db8e1d89-89bc-4f9c-ba72-16f97858eb3d',
    'e6ea88f8-6319-4e91-98e9-ee8b43ceef88',
    1002,
    'active',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '30 minutes',
    NULL,
    19800,
    NOW(),
    NOW()
),
(
    '04df05d4-6be4-4f04-96ad-b654f1d2f4f0',
    'e07f6290-2dab-4f20-ae5b-a4f0af8f8fe2',
    1005,
    'completed',
    NOW() - INTERVAL '15 days',
    NULL,
    NOW() - INTERVAL '10 days',
    14400,
    NOW(),
    NOW()
);

INSERT INTO governance_notification (
    id, user_id, task_id, type, title, message, channel, metadata, is_read, read_at, created_at, updated_at
) VALUES
(
    '11eb450a-5bbf-47bd-b4ee-c7d9a02b2fcc',
    1004,
    'c7dd6f0f-f898-47bf-a7e1-0cea9d855e51',
    'task_assigned',
    'Nova tarefa atribuída',
    'Você foi designada para criar endpoint de relatórios.',
    'in_app',
    '{"source":"seed"}'::jsonb,
    FALSE,
    NULL,
    NOW() - INTERVAL '12 hours',
    NOW() - INTERVAL '12 hours'
),
(
    '10c6a5c1-b5c5-4bab-a0f1-f701f6a82a8f',
    1003,
    '4e4767fd-7f77-4bf7-b21c-f31500e3d0f6',
    'task_overdue',
    'Tarefa bloqueada próxima do prazo',
    'A tarefa de conciliação financeira está bloqueada e próxima do vencimento.',
    'in_app',
    '{"source":"seed","severity":"high"}'::jsonb,
    TRUE,
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '5 hours',
    NOW() - INTERVAL '2 hours'
);

INSERT INTO governance_auditlog (
    id, event_type, action, entity_type, entity_id, actor_id, workspace_id,
    correlation_id, before, after, metadata, created_at
) VALUES
(
    '6079c7f3-f0f2-40a2-9029-c6742ef26d08',
    'task.updated',
    'update',
    'task',
    'e6ea88f8-6319-4e91-98e9-ee8b43ceef88',
    1002,
    '1a0f33d4-f8df-4f7a-b89a-beb4f1e53d8e',
    'corr-seed-001',
    '{"status":"todo"}'::jsonb,
    '{"status":"in_progress"}'::jsonb,
    '{"origin":"seed_reference.sql"}'::jsonb,
    NOW() - INTERVAL '7 days'
),
(
    '60bac47d-b2f5-49d4-8f46-c6d4b6af0747',
    'permission.assigned',
    'create',
    'permission_assignment',
    '1',
    1001,
    '1a0f33d4-f8df-4f7a-b89a-beb4f1e53d8e',
    'corr-seed-002',
    '{}'::jsonb,
    '{"permission_key":"task.update"}'::jsonb,
    '{"origin":"seed_reference.sql"}'::jsonb,
    NOW() - INTERVAL '3 days'
);

INSERT INTO governance_permissionassignment (
    workspace_id, subject_id, scope_type, scope_id, permission_key, effect, created_at, updated_at
) VALUES
(
    '1a0f33d4-f8df-4f7a-b89a-beb4f1e53d8e',
    1002,
    'project',
    'f71344f4-c718-43c4-95f1-3ef0baac9d5e',
    'task.update',
    'allow',
    NOW(),
    NOW()
),
(
    '1a0f33d4-f8df-4f7a-b89a-beb4f1e53d8e',
    1003,
    'project',
    'f71344f4-c718-43c4-95f1-3ef0baac9d5e',
    'task.delete',
    'deny',
    NOW(),
    NOW()
);

INSERT INTO governance_permissionbulkpreview (
    id, workspace_id, created_by_id, status, expires_at, items_json, summary_json, created_at, updated_at
) VALUES
(
    '1f6700ea-7cee-4e15-b5ac-6e6330dc58a5',
    '1a0f33d4-f8df-4f7a-b89a-beb4f1e53d8e',
    1001,
    'pending',
    NOW() + INTERVAL '1 hour',
    '[{"subject_id":1004,"permission_key":"task.view","effect":"allow"}]'::jsonb,
    '{"total":1,"allow":1,"deny":0}'::jsonb,
    NOW(),
    NOW()
);

INSERT INTO governance_permissionconflictresolution (
    workspace_id, actor_id, option_id, context_summary, before_summary, after_summary, created_at
) VALUES
(
    '1a0f33d4-f8df-4f7a-b89a-beb4f1e53d8e',
    1001,
    'prefer_deny',
    'Conflito entre herança de papel e regra explícita.',
    'Usuário herdava allow em escopo amplo.',
    'Regra explícita deny mantida para escopo restrito.',
    NOW() - INTERVAL '1 day'
);

COMMIT;
