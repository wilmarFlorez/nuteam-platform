import { APIRequestContext, expect, test } from "@playwright/test";

async function recoveryUrl(request: APIRequestContext, email: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const messages = await (await request.get("http://127.0.0.1:55324/api/v1/messages?limit=100")).json();
    const message = messages.messages.find((item: { To?: Array<{ Address?: string }>; ID: string }) =>
      item.To?.some((recipient) => recipient.Address === email));
    if (message) {
      const detail = await (await request.get(`http://127.0.0.1:55324/api/v1/message/${message.ID}`)).json();
      const match = String(detail.HTML ?? detail.Text).match(/http:\/\/127\.0\.0\.1:55321\/auth\/v1\/verify\?[^"\s<]+/);
      if (match) return match[0].replaceAll("&amp;", "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Recovery email was not delivered to local Mailpit.");
}

test("shows the sign-in screen without a session", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Workspace" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("registers a user and creates an organization", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;
  await page.goto("/");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill("A-secure-test-password-123");
  await page.getByRole("button", { name: "Crear cuenta" }).last().click();
  await expect(page.getByRole("heading", { name: "Organización activa" })).toBeVisible();
  await page.getByPlaceholder("Nueva organización").fill("E2E organization");
  await page.getByPlaceholder("slug-unico").fill(`e2e-${Date.now()}`);
  await page.getByRole("button", { name: "Crear organización" }).click();
  await expect(page.getByRole("heading", { name: "Espacio listo" })).toBeVisible();
});

test("switches organizations and signs out", async ({ page }) => {
  const suffix = Date.now();
  const email = `e2e-switch-${suffix}@example.test`;
  await page.goto("/");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill("A-secure-test-password-123");
  await page.getByRole("button", { name: "Crear cuenta" }).last().click();
  await expect(page.getByRole("heading", { name: "Organización activa" })).toBeVisible();

  for (const name of ["First E2E organization", "Second E2E organization"]) {
    await page.getByLabel("Nueva organización").fill(name);
    await page.getByLabel("Slug").fill(`${name.slice(0, 5).toLowerCase()}-${suffix}-${name[0].toLowerCase()}`);
    await page.getByRole("button", { name: "Crear organización" }).click();
    await expect(page.getByRole("heading", { name: "Espacio listo" })).toBeVisible();
  }

  await page.getByLabel("Organización activa").selectOption({ label: "First E2E organization" });
  await expect(page.getByRole("heading", { name: "Espacio listo" })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("recovers a password through the local email link", async ({ page, request }) => {
  const email = `e2e-recovery-${Date.now()}@example.test`;
  const oldPassword = "A-secure-test-password-123";
  const newPassword = "A-new-secure-test-password-456";
  await page.goto("/");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(oldPassword);
  await page.getByRole("button", { name: "Crear cuenta" }).last().click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.getByRole("button", { name: "Olvidé mi contraseña" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Enviar recuperación" }).click();
  await expect(page.locator("p[role='alert']")).toContainText("recuperación");
  await page.goto(await recoveryUrl(request, email));
  await expect(page.getByRole("heading", { name: "Establecer nueva contraseña" })).toBeVisible();
  await page.getByLabel("Nueva contraseña").fill(newPassword);
  await page.getByLabel("Confirmar contraseña").fill(newPassword);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.locator("p[role='alert']")).toContainText("Contraseña actualizada");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(newPassword);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByTestId("user-id")).toBeVisible();
});

test("manages a registered member and rejects removal of the last owner", async ({ browser, page }) => {
  const suffix = Date.now();
  const password = "A-secure-test-password-123";
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();

  await memberPage.goto("/");
  await memberPage.getByRole("button", { name: "Crear cuenta" }).click();
  await memberPage.getByLabel("Email").fill(`e2e-member-${suffix}@example.test`);
  await memberPage.getByLabel("Contraseña").fill(password);
  await memberPage.getByRole("button", { name: "Crear cuenta" }).last().click();
  const memberId = await memberPage.getByTestId("user-id").textContent();
  expect(memberId).toMatch(/^[0-9a-f-]{36}$/);

  await page.goto("/");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.getByLabel("Email").fill(`e2e-owner-${suffix}@example.test`);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).last().click();
  await page.getByLabel("Nueva organización").fill("Member E2E organization");
  await page.getByLabel("Slug").fill(`member-e2e-${suffix}`);
  await page.getByRole("button", { name: "Crear organización" }).click();
  await expect(page.getByRole("heading", { name: "Espacio listo" })).toBeVisible();

  await page.getByLabel("ID de usuario").fill(memberId!);
  await page.getByRole("button", { name: "Agregar miembro" }).click();
  await expect(page.locator(".members")).toContainText(memberId!);
  const memberRow = page.locator(".members li").filter({ hasText: memberId! });
  await memberRow.getByLabel(`Rol de ${memberId}`).selectOption("admin");
  await memberRow.getByRole("button", { name: "Guardar miembro" }).click();
  await expect(memberRow).toContainText("admin");
  await memberRow.getByLabel("Membresía activa").uncheck();
  await memberRow.getByRole("button", { name: "Guardar miembro" }).click();
  await expect(memberRow).toContainText("Inactivo");

  const ownerId = await page.getByTestId("user-id").textContent();
  const ownerRow = page.locator(".members li").filter({ hasText: ownerId! });
  await ownerRow.getByLabel(`Rol de ${ownerId}`).selectOption("member");
  await ownerRow.getByRole("button", { name: "Guardar miembro" }).click();
  await expect(page.locator("p[role='alert']")).toContainText("debe conservar al menos un propietario");
  await memberContext.close();
});
