import { expect, test } from '@playwright/test';
import { completeSetup, errors, launch, trackErrors, win } from './helpers';

/**
 * Full-stack journeys: these talk to a real Solace backend (Spring Boot + PostgreSQL) through the
 * same-origin /api proxy. They only run when E2E_BACKEND=1 (see README → Testing).
 */
test.skip(!process.env.E2E_BACKEND, 'set E2E_BACKEND=1 with a running backend to enable');

const unique = () => `e2e${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const PASSWORD = 'correct horse battery staple';

test.beforeEach(async ({ page }) => {
  trackErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});
test.afterEach(({ page }, info) => {
  // The browser itself logs rejected requests; the wrong-password test provokes a 401 on purpose.
  const expected401 = info.title.includes('wrong password');
  const list = (errors.get(page) ?? []).filter((e) => !(expected401 && e.includes('401')));
  expect(list, 'no console errors (CSP violations show up here)').toEqual([]);
});

async function register(page: import('@playwright/test').Page, username: string) {
  await launch(page, 'settings');
  const w = win(page, 'Settings');
  await w.getByRole('button', { name: 'Account' }).click();
  await w.getByRole('radio', { name: 'Create account' }).click();
  await w.getByLabel('Username').fill(username);
  await w.getByLabel('Password').fill(PASSWORD);
  await w.getByRole('button', { name: 'Create account' }).click();
  await expect(w.getByText('Signed in', { exact: true })).toBeVisible();
  return w;
}

test('register → notes sync to the server → another browser sees them → cloud files → sign out', async ({ page, browser }) => {
  const username = unique();
  await completeSetup(page);
  // A local note created *before* signing up is uploaded by the first sync.
  await launch(page, 'notes');
  const notes = win(page, 'Notes');
  await notes.getByRole('button', { name: 'New note' }).first().click();
  await notes.getByLabel('Note title').fill('Synced note');
  await notes.getByLabel('Note content').fill('written on device one');

  const settings = await register(page, username);
  await expect(settings.getByText(/Up to date/)).toBeVisible({ timeout: 15_000 });

  // The data really is on the server (checked via the API with the browser's own session cookie).
  const list = await page.request.get('/api/notes');
  expect(list.ok()).toBeTruthy();
  expect((await list.json()).items.map((n: { title: string }) => n.title)).toContain('Synced note');

  // Cloud files: upload through the UI, then see it in the API.
  await launch(page, 'files');
  const files = win(page, 'Files');
  await files.getByRole('button', { name: 'Cloud files' }).click();
  await files.getByLabel('Choose files to upload to the cloud').setInputFiles({ name: 'cloud.txt', mimeType: 'text/plain', buffer: Buffer.from('stored on the server') });
  await expect(files.getByRole('option', { name: /cloud\.txt/ })).toBeVisible();
  const cloudList = await (await page.request.get('/api/files')).json();
  expect(cloudList.items.map((f: { name: string }) => f.name)).toContain('cloud.txt');

  // A second, clean browser profile signs in and receives the same note.
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page2 = await ctx2.newPage();
  trackErrors(page2);
  await completeSetup(page2);
  await launch(page2, 'settings');
  const w2 = win(page2, 'Settings');
  await w2.getByRole('button', { name: 'Account' }).click();
  await w2.getByLabel('Username').fill(username);
  await w2.getByLabel('Password').fill(PASSWORD);
  await w2.getByRole('button', { name: 'Sign in' }).click();
  await expect(w2.getByText('Signed in', { exact: true })).toBeVisible();
  await launch(page2, 'notes');
  await expect(win(page2, 'Notes').getByText('Synced note')).toBeVisible({ timeout: 15_000 });
  await ctx2.close();

  // Sign out removing local data: the server keeps it.
  await settings.click({ position: { x: 80, y: 12 } }); // bring Settings back to the front
  await settings.getByRole('button', { name: /Sign out…/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out and remove data' }).click();
  await expect(settings.getByRole('form', { name: 'Sign in' })).toBeVisible();
  await expect(win(page, 'Notes').getByText('Synced note')).toHaveCount(0);
  expect((await page.request.get('/api/notes')).status()).toBe(401);
});

test('authorization: a second account cannot see the first account\'s data', async ({ page, browser }) => {
  const alice = unique();
  await completeSetup(page);
  await register(page, alice);
  const put = await page.request.put('/api/notes/note_private', {
    data: { title: 'alice only', content: 'secret', pinned: false, archived: false, createdAt: 1, updatedAt: 1 },
    headers: { 'X-XSRF-TOKEN': decodeURIComponent((await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')!.value) },
  });
  expect(put.status()).toBe(201);

  const ctx = await browser.newContext();
  const bob = await ctx.newPage();
  await bob.goto('/');
  await bob.request.get('/api/auth/session'); // primes the CSRF cookie
  const token = decodeURIComponent((await ctx.cookies()).find((c) => c.name === 'XSRF-TOKEN')!.value);
  const reg = await bob.request.post('/api/auth/register', { data: { username: unique(), password: PASSWORD }, headers: { 'X-XSRF-TOKEN': token } });
  expect(reg.status()).toBe(201);
  expect((await bob.request.get('/api/notes/note_private')).status()).toBe(404);
  expect((await (await bob.request.get('/api/notes')).json()).items).toEqual([]);
  await ctx.close();
});

test('wrong password is rejected without leaking details', async ({ page }) => {
  await completeSetup(page);
  await launch(page, 'settings');
  const w = win(page, 'Settings');
  await w.getByRole('button', { name: 'Account' }).click();
  await w.getByLabel('Username').fill('nobody-' + unique());
  await w.getByLabel('Password').fill('definitely wrong password');
  await w.getByRole('button', { name: 'Sign in' }).click();
  await expect(w.getByRole('alert')).toHaveText('Invalid username or password');
});
