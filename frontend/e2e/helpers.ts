import { expect, type Page } from '@playwright/test';

export const errors = new WeakMap<Page, string[]>();

export function trackErrors(page: Page) {
  const list: string[] = [];
  errors.set(page, list);
  page.on('console', (m) => {
    if (m.type() === 'error') list.push(m.text());
  });
  page.on('pageerror', (e) => list.push(String(e)));
}

export async function completeSetup(page: Page, opts: { name?: string; theme?: 'Dark' | 'Light'; accent?: string } = {}) {
  await page.goto('/');
  await page.getByRole('button', { name: /get started/i }).click();
  if (opts.theme) await page.getByRole('radio', { name: opts.theme }).click();
  if (opts.accent) await page.getByRole('radio', { name: opts.accent }).click();
  if (opts.name) await page.getByLabel(/display name/i).fill(opts.name);
  await page.getByRole('button', { name: /enter solace/i }).click();
  await expect(page.getByTestId('desktop')).toBeVisible();
}

export async function launch(page: Page, query: string) {
  await page.getByTestId('launcher-button').click();
  await page.getByRole('combobox', { name: 'Search applications' }).fill(query);
  await page.keyboard.press('Enter');
}

export const win = (page: Page, title: string) => page.getByRole('group', { name: `${title} window` });
