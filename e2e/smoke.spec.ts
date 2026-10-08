import { expect, test } from '@playwright/test';

test('template car can be test-driven and the editor comes back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  await expect(page.getByTestId('errors')).toHaveText('');
  await page.getByTestId('btn-test').click();

  const speed = page.getByTestId('hud-speed');
  await expect(speed).toBeVisible({ timeout: 20_000 });
  await page.keyboard.down('w');
  await expect.poll(async () => Number(await speed.innerText()), { timeout: 10_000 }).toBeGreaterThan(0);
  await page.keyboard.up('w');

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('btn-test')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a broken car blocks the test drive with a message', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('btn-new').click();
  await expect(page.getByTestId('errors')).toContainText('Нет двигателя');
  await page.getByTestId('btn-test').click();
  await expect(page.getByTestId('toast')).toContainText('не готова');
  await expect(page.getByTestId('hud-speed')).toHaveCount(0);
});

test('body without mounts blocks the test, removing it unblocks', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('btn-template').click();

  await page.getByTestId('btn-body').click();
  await page.getByTestId('body-add-box').click();
  await expect(page.getByTestId('body-stats')).toContainText('Деталей 1');
  await page.getByTestId('body-done').click();

  await expect(page.getByTestId('errors')).toContainText('Кузов не прикреплён к каркасу');
  await page.getByTestId('btn-test').click();
  await expect(page.getByTestId('hud-speed')).toHaveCount(0);

  // Reopen the body editor and select the part: it sits at the camera target, i.e. the viewport centre.
  await page.getByTestId('btn-body').click();
  const viewport = page.locator('.screen:not([hidden]) .viewport');
  const box = (await viewport.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('body-part')).toBeVisible();
  await page.getByTestId('part-delete').click();
  await expect(page.getByTestId('body-stats')).toContainText('Деталей 0');
  await page.getByTestId('body-done').click();

  await expect(page.getByTestId('errors')).toHaveText('');
  await page.getByTestId('btn-test').click();
  const speed = page.getByTestId('hud-speed');
  await expect(speed).toBeVisible({ timeout: 20_000 });
  await page.keyboard.down('w');
  await expect.poll(async () => Number(await speed.innerText()), { timeout: 10_000 }).toBeGreaterThan(0);
  await page.keyboard.up('w');
});
