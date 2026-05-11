import { test, expect } from "@playwright/test";

test.describe("BlackBeans Web", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/v1/health", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { status: "ok", timestamp: "2026-01-01T00:00:00Z", checks: { db: "ok" } } }),
      });
    });
    await page.route("**/api/v1/notifications?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { notifications: [] } }),
      });
    });
    await page.route("**/api/v1/notifications/unread-count", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { unread_count: 0 } }),
      });
    });
    await page.route("**/api/v1/my-tasks", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { tasks: [] } }),
      });
    });
    await page.route("**/api/v1/audit/dashboard", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { total_logs: 0, failures: 0 } }),
      });
    });
    await page.route("**/api/v1/audit/logs?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { logs: [] } }),
      });
    });
    await page.route("**/api/v1/auth/2fa/settings", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { totp_enabled: false, has_pending_enrollment: false, recovery_codes_count: 0 } }),
      });
    });
    await page.route("**/api/v1/me/collaborator-profile", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            profile: {
              display_name: "Admin Teste",
              professional_email: "admin@blackbeans.local",
              phone: "0000-0000",
            },
          },
        }),
      });
    });
    await page.route("**/api/v1/me/workspace-access", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { all: true, workspace_ids: [] } }),
      });
    });
    await page.route("**/api/v1/clients?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { clients: [] } }),
      });
    });
    await page.route("**/api/v1/workspaces", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { workspaces: [] } }),
      });
    });
    await page.route("**/api/v1/portfolios", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { portfolios: [] } }),
      });
    });
    await page.route("**/api/v1/projects", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { projects: [] } }),
      });
    });
    await page.route("**/api/v1/boards", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { boards: [] } }),
      });
    });
    await page.route("**/api/v1/permissions/matrix?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { matrix: [] }, meta: { count: 0 } }),
      });
    });
    await page.route("**/api/v1/permissions/conflicts/resolve-preview", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { options: [] } }),
      });
    });
  });

  test("exibe tela de login", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Entrar no BlackBeans/i })).toBeVisible();
    await expect(page.getByTestId("login-username")).toBeVisible();
    await expect(page.getByTestId("login-password")).toBeVisible();
  });

  test("navega entre modulos principais com hash sincronizado", async ({ page }) => {
    await page.addInitScript(() => {
      const payload = btoa(JSON.stringify({ user_id: 1, is_staff: true, is_superuser: true }));
      localStorage.setItem("bb_access_token", `x.${payload}.x`);
      localStorage.setItem("bb_refresh_token", "refresh-e2e");
    });

    await page.goto("/");
    await expect(page.getByRole("navigation", { name: /Navegacao principal/i })).toBeVisible();

    await page.getByRole("menuitem", { name: "Projetos" }).click();
    await expect(page).toHaveURL(/#projects$/);
    await expect(page.getByText("Novo cliente")).toBeVisible();

    await page.getByRole("button", { name: "Conta" }).click();
    await page.getByRole("menuitem", { name: /Notificacoes/i }).click();
    await expect(page).toHaveURL(/#notifications$/);
    await expect(page.getByText("Central de notificacoes")).toBeVisible();
    await expect(page.getByText("Nenhuma notificacao no momento.")).toBeVisible();
  });

  test("exibe novos blocos de governanca", async ({ page }) => {
    await page.route("**/api/v1/workspaces", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            workspaces: [{ id: "11111111-1111-1111-1111-111111111111", name: "Workspace QA" }],
          },
        }),
      });
    });
    await page.addInitScript(() => {
      const payload = btoa(JSON.stringify({ user_id: 1, is_staff: true, is_superuser: true }));
      localStorage.setItem("bb_access_token", `x.${payload}.x`);
      localStorage.setItem("bb_refresh_token", "refresh-e2e");
    });

    await page.goto("/#governance");
    await expect(page.getByText("Permissao pontual (assignment)")).toBeVisible();
    await expect(page.getByText("Permissoes em lote (preview/apply)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Aplicar permissao" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gerar preview" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Aplicar preview" })).toBeVisible();
  });

  test("exibe seletor de visualizacao board", async ({ page }) => {
    await page.route("**/api/v1/projects", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { projects: [{ id: "p1", name: "Projeto QA" }] } }),
      });
    });
    await page.route("**/api/v1/boards", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { boards: [{ id: "b1", name: "Board QA", project_id: "p1", workspace_id: "w1" }] } }),
      });
    });
    await page.route("**/api/v1/boards/b1/groups", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            groups: [{ id: "g1", board_id: "b1", name: "Todo", position: 1, wip_limit: 5 }],
          },
        }),
      });
    });
    await page.route("**/api/v1/boards/b1?view=kanban", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            view: "kanban",
            groups: [
              {
                group: { id: "g1", board_id: "b1", name: "Todo", position: 1, wip_limit: 5 },
                tasks: [],
              },
            ],
          },
        }),
      });
    });
    await page.route("**/api/v1/boards/b1?view=list", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            view: "list",
            tasks: [
              {
                id: "t1",
                title: "Tarefa Lista QA",
                description: "",
                status: "todo",
                priority: "medium",
                effort_points: 1,
                assignee_id: 1,
                start_date: null,
                end_date: null,
                board_id: "b1",
                group_id: "g1",
              },
            ],
          },
        }),
      });
    });
    await page.addInitScript(() => {
      const payload = btoa(JSON.stringify({ user_id: 1, is_staff: true, is_superuser: true }));
      localStorage.setItem("bb_access_token", `x.${payload}.x`);
      localStorage.setItem("bb_refresh_token", "refresh-e2e");
    });

    await page.goto("/#projects");
    await page.getByRole("tab", { name: "Kanban" }).click();
    await expect(page.getByText("Quadro (kanban/lista/timeline)")).toBeVisible();
  });

  test("login com credenciais de demo (requer API)", async ({ page }) => {
    test.skip(!process.env.E2E_PASSWORD, "Defina E2E_PASSWORD (e opcionalmente E2E_LOGIN) para rodar o login E2E.");

    const user = process.env.E2E_LOGIN ?? "demo_admin";
    const pass = process.env.E2E_PASSWORD!;

    await page.goto("/");
    await page.getByTestId("login-username").fill(user);
    await page.getByTestId("login-password").fill(pass);
    await page.getByRole("button", { name: /Entrar/i }).click();

    await expect(page.getByText(/Sessao iniciada|Recomendado configurar 2FA/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("navigation", { name: /Navegacao principal/i })).toBeVisible();
  });
});
