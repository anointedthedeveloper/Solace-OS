import { expect, test } from '@playwright/test';
import { completeSetup, errors, launch, trackErrors, win } from './helpers';

test.beforeEach(async ({ page }) => {
  trackErrors(page);
  // Deterministic geometry: no entry animations while we measure boxes.
  await page.emulateMedia({ reducedMotion: 'reduce' });
});
test.afterEach(({ page }) => {
  expect(errors.get(page), 'no console errors').toEqual([]);
});

test('first run: welcome → desktop, and preferences survive a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome to Solace OS' })).toBeVisible();
  await page.getByRole('button', { name: /get started/i }).click();
  await page.getByRole('radio', { name: 'Light' }).click();
  await page.getByRole('radio', { name: 'Teal' }).click();
  await page.getByLabel(/display name/i).fill('Ada');
  await page.getByRole('button', { name: /enter solace/i }).click();
  await expect(page.getByTestId('desktop')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.getByTestId('desktop')).toBeVisible();
  await expect(page.getByTestId('welcome')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByTestId('launcher-button').click();
  await expect(page.getByRole('dialog', { name: 'Application launcher' })).toContainText('Ada');
});

test('launcher: keyboard shortcut, search, launch, and multiple windows', async ({ page }) => {
  await completeSetup(page);
  await page.keyboard.press('Alt+Space');
  await expect(page.getByRole('dialog', { name: 'Application launcher' })).toBeVisible();
  await page.keyboard.type('calc');
  await page.keyboard.press('Enter');
  await expect(win(page, 'Calculator')).toBeVisible();
  await launch(page, 'notes');
  await launch(page, 'terminal');
  await expect(win(page, 'Notes')).toBeVisible();
  await expect(win(page, 'Terminal')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('window controls: focus, minimize/restore from the dock, maximize, close', async ({ page }) => {
  await completeSetup(page);
  await launch(page, 'notes');
  await launch(page, 'calendar');
  const notes = win(page, 'Notes');
  const cal = win(page, 'Calendar');
  await expect(cal).toHaveAttribute('data-focused', 'true');
  await notes.click({ position: { x: 60, y: 12 } }); // its title bar, which stays visible under the Calendar window
  await expect(notes).toHaveAttribute('data-focused', 'true');
  const z = async (l: typeof notes) => Number(await l.evaluate((el) => (el as HTMLElement).style.zIndex));
  expect(await z(notes)).toBeGreaterThan(await z(cal));

  await notes.getByRole('button', { name: 'Minimize Notes' }).click();
  await expect(notes).toBeHidden();
  await page.locator('[data-dock-app="notes"]').click();
  await expect(notes).toBeVisible();

  await notes.getByRole('button', { name: 'Maximize Notes' }).click();
  const box = await notes.boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.width).toBeGreaterThan(vp.width - 5);
  await notes.getByRole('button', { name: 'Restore Notes' }).click();
  expect((await notes.boundingBox())!.width).toBeLessThan(vp.width - 100);

  await notes.getByRole('button', { name: 'Close Notes' }).click();
  await expect(notes).toHaveCount(0);
});

test('windows can be dragged by the title bar and resized from the edges, within the workspace', async ({ page }) => {
  await completeSetup(page);
  await launch(page, 'terminal');
  const w = win(page, 'Terminal');
  const before = (await w.boundingBox())!;
  const title = w.getByText('Terminal', { exact: true }).first();
  const t = (await title.boundingBox())!;
  await page.mouse.move(t.x + 40, t.y + 5);
  await page.mouse.down();
  await page.mouse.move(t.x + 140, t.y + 85, { steps: 6 });
  await page.mouse.up();
  const moved = (await w.boundingBox())!;
  expect(Math.round(moved.x - before.x)).toBe(100);
  expect(Math.round(moved.y - before.y)).toBe(80);

  const se = w.locator('[data-resize="se"]');
  const s = (await se.boundingBox())!;
  await page.mouse.move(s.x + 5, s.y + 5);
  await page.mouse.down();
  await page.mouse.move(s.x + 85, s.y + 65, { steps: 6 });
  await page.mouse.up();
  const resized = (await w.boundingBox())!;
  expect(Math.round(resized.width - moved.width)).toBe(80);
  expect(Math.round(resized.height - moved.height)).toBe(60);

  // Drag far off-screen: the title bar must stay reachable.
  const t2 = (await title.boundingBox())!;
  await page.mouse.move(t2.x + 20, t2.y + 5);
  await page.mouse.down();
  await page.mouse.move(-500, 3000, { steps: 8 });
  await page.mouse.up();
  const lost = (await w.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(lost.y).toBeLessThan(vp.height - 30);
  expect(lost.x + lost.width).toBeGreaterThan(50);
});

test('window layout is restored after a refresh', async ({ page }) => {
  await completeSetup(page);
  await launch(page, 'notes');
  await launch(page, 'tasks');
  const before = (await win(page, 'Tasks').boundingBox())!;
  await page.reload();
  await expect(win(page, 'Notes')).toBeVisible();
  await expect(win(page, 'Tasks')).toBeVisible();
  const after = (await win(page, 'Tasks').boundingBox())!;
  expect(Math.round(after.x)).toBe(Math.round(before.x));
  expect(Math.round(after.width)).toBe(Math.round(before.width));
});

test('notes: create, edit, and they persist across reloads', async ({ page }) => {
  await completeSetup(page);
  await launch(page, 'notes');
  const w = win(page, 'Notes');
  await w.getByRole('button', { name: 'New note' }).first().click();
  await w.getByLabel('Note title').fill('Shopping');
  await w.getByLabel('Note content').fill('apples and pears');
  await page.waitForTimeout(500); // persistence is debounced
  await page.reload();
  await expect(win(page, 'Notes').getByText('Shopping')).toBeVisible();
  await win(page, 'Notes').getByText('Shopping').click();
  await expect(win(page, 'Notes').getByLabel('Note content')).toHaveValue('apples and pears');
});

test('tasks: add, complete, filter and delete with confirmation', async ({ page }) => {
  await completeSetup(page);
  await launch(page, 'tasks');
  const w = win(page, 'Tasks');
  await w.getByLabel('New task title').fill('Write tests');
  await w.getByLabel('New task title').press('Enter');
  await expect(w.getByText('Write tests')).toBeVisible();
  await w.getByRole('checkbox', { name: /Complete: Write tests/ }).click();
  await expect(w.getByText('Write tests')).toHaveCount(0);
  await w.getByRole('tab', { name: 'Completed' }).click();
  await expect(w.getByText('Write tests')).toBeVisible();
  await w.getByRole('button', { name: 'Delete Write tests' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(w.getByText('Write tests')).toHaveCount(0);
});

test('calculator: keyboard input, precedence, errors', async ({ page }) => {
  await completeSetup(page);
  await launch(page, 'calculator');
  const w = win(page, 'Calculator');
  await w.getByRole('application').focus();
  await page.keyboard.type('2+3*4');
  await page.keyboard.press('Enter');
  await expect(w.getByTestId('calc-display')).toHaveText('14');
  await page.keyboard.press('Escape');
  await page.keyboard.type('1/0');
  await page.keyboard.press('Enter');
  await expect(w.getByTestId('calc-display')).toHaveText('Cannot divide by zero');
});

test('files: create folder, upload, trash and restore', async ({ page }) => {
  await completeSetup(page);
  await launch(page, 'files');
  const w = win(page, 'Files');
  await w.getByRole('button', { name: /new folder/i }).click();
  await page.getByLabel('Folder name').fill('Projects');
  await page.keyboard.press('Enter');
  await expect(w.getByRole('option', { name: /Projects/ })).toBeVisible();
  await w.getByLabel('Choose files to upload').setInputFiles({ name: 'hello.txt', mimeType: 'text/plain', buffer: Buffer.from('hello world') });
  const row = w.getByRole('listbox').getByRole('option', { name: /hello\.txt/ });
  await expect(row).toBeVisible();
  await row.click();
  await page.keyboard.press('Delete');
  await expect(row).toHaveCount(0);
  await w.getByRole('button', { name: /Trash/ }).first().click();
  await expect(w.getByRole('option', { name: /hello\.txt/ })).toBeVisible();
  await w.getByRole('option', { name: /hello\.txt/ }).click();
  await w.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(w.getByText('Trash is empty')).toBeVisible();
});

test('text editor: type, save, and unsaved-changes protection on close', async ({ page }) => {
  await completeSetup(page);
  await launch(page, 'text editor');
  const w = win(page, 'Text Editor');
  await w.getByRole('checkbox', { name: 'Autosave' }).uncheck();
  await w.getByRole('button', { name: 'New document' }).first().click();
  await w.getByLabel(/Editing/).fill('some important words');
  await expect(w.getByText(/3 words/)).toBeVisible();
  await w.getByRole('button', { name: 'Close Text Editor' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('unsaved changes');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(w).toBeVisible();
  await w.getByRole('button', { name: 'Close Text Editor' }).click();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByLabel('Document name').fill('words.txt');
  await page.keyboard.press('Enter');
  await expect(w).toHaveCount(0);
});

test('settings apply immediately and persist; dock can move', async ({ page }) => {
  await completeSetup(page);
  await launch(page, 'settings');
  const w = win(page, 'Settings');
  await w.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await w.getByRole('radio', { name: 'Rose' }).click();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--s-accent').trim())).toBe('#b0305b');
  await w.getByRole('button', { name: 'Dock & taskbar' }).click();
  await w.getByRole('radio', { name: 'Left' }).click();
  await expect(page.getByRole('toolbar', { name: 'Applications' })).toHaveAttribute('aria-orientation', 'vertical');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('toolbar', { name: 'Applications' })).toHaveAttribute('aria-orientation', 'vertical');
});

test('terminal: simulated commands drive the real desktop', async ({ page }) => {
  await completeSetup(page);
  await launch(page, 'terminal');
  const w = win(page, 'Terminal');
  const input = w.getByLabel('Terminal command input');
  await input.fill('help');
  await input.press('Enter');
  await expect(w.getByRole('log')).toContainText('simulated');
  await input.fill('open calendar');
  await input.press('Enter');
  await expect(win(page, 'Calendar')).toBeVisible();
  await input.fill('theme light');
  await input.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await input.fill('rm -rf /');
  await input.press('Enter');
  await expect(w.getByRole('log')).toContainText('command not found');
});

test('context menu, notifications and quick settings', async ({ page }) => {
  await completeSetup(page);
  await page.getByRole('main', { name: 'Desktop' }).click({ button: 'right', position: { x: 600, y: 400 } });
  await page.getByRole('menuitem', { name: 'New note' }).click();
  await expect(win(page, 'Notes')).toBeVisible();
  await page.getByRole('button', { name: /Quick settings/ }).click();
  await page.getByRole('dialog', { name: 'Quick settings' }).getByRole('button', { name: 'Do not disturb' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Notifications/ }).click();
  await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
});

test('keyboard focus is always visible', async ({ page }) => {
  await completeSetup(page);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    return { w: cs.outlineWidth, style: cs.outlineStyle, tag: el.tagName };
  });
  expect(outline.style).toBe('solid');
  expect(parseFloat(outline.w)).toBeGreaterThanOrEqual(2);
});

test('usable at 1366×768 and on a small screen (windows become full-screen)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await completeSetup(page);
  await launch(page, 'files');
  const b = (await win(page, 'Files').boundingBox())!;
  expect(b.x + b.width).toBeLessThanOrEqual(1366);
  expect(b.y + b.height).toBeLessThanOrEqual(768);

  await page.setViewportSize({ width: 480, height: 800 });
  await expect(win(page, 'Files')).toBeVisible();
  const small = (await win(page, 'Files').boundingBox())!;
  expect(small.width).toBeGreaterThan(470);
  await expect(page.getByRole('button', { name: 'Open launcher' })).toBeVisible();
});
