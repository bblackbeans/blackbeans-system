import { test, expect } from "@playwright/test";

test.describe("BlackBeans Web", () => {
  test("exibe tela de login", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Entrar no BlackBeans/i })).toBeVisible();
    await expect(page.getByTestId("login-username")).toBeVisible();
    await expect(page.getByTestId("login-password")).toBeVisible();
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
