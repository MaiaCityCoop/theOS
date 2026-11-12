import { test, expect } from '@playwright/test';

test('shows the first game screen once the world is fully loaded', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/?webgl', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__s8 && Number.isFinite(window.__s8.loadMs), null, {
    timeout: 180_000,
  });
  await expect(page.locator('html')).not.toHaveClass(/os-loading/);
  expect(await page.locator('body').getAttribute('data-step')).toBeNull();
  await page.waitForTimeout(1_000);

  const state = await page.evaluate(() => {
    const game = window.__s8;
    const canvas = document.querySelector('#c');
    const rect = canvas.getBoundingClientRect();
    return {
      loadMs: game.loadMs,
      triangles: game.renderer.info.render.triangles,
      drawCalls: game.renderer.info.render.drawCalls ?? game.renderer.info.render.calls ?? 0,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      cssWidth: rect.width,
      cssHeight: rect.height,
    };
  });

  expect(state.loadMs).toBeGreaterThan(0);
  expect(state.canvasWidth).toBeGreaterThan(0);
  expect(state.canvasHeight).toBeGreaterThan(0);
  expect(state.cssWidth).toBeGreaterThan(0);
  expect(state.cssHeight).toBeGreaterThan(0);
  expect(state.triangles).toBeGreaterThan(0);
  expect(state.drawCalls).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);

  const screenshot = await page.screenshot({ path: testInfo.outputPath('first-screen.png') });
  await testInfo.attach('first-screen', { body: screenshot, contentType: 'image/png' });
  console.log(
    `[e2e] first screen after ${state.loadMs.toFixed(0)} ms: ` +
      `${state.triangles} triangles, ${state.drawCalls} draw calls; ` +
      testInfo.outputPath('first-screen.png')
  );
});
