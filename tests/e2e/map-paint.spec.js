const { test, expect } = require('@playwright/test');
const { dominantColor, colorsCovering, shareOf } = require('./helpers/png');

/* Colorado is a rectangle, so its bounding box is almost entirely itself --
   which makes it the honest state to sample a fill from. */
const CO = '.us-map__shapes [data-state="CO"]';

const BASE = '#e2e8f0';
const HOVER = '#0284c7';
const SELECTED = '#0369a1';
const INERT = '#f1f5f9';

async function fillOf(page, selector) {
  // `animations: 'disabled'` finishes the fill transition first, otherwise we
  // sample a colour part-way between the old one and the new one.
  return dominantColor(
    await page.locator(selector).screenshot({ animations: 'disabled' })
  );
}

test.describe('what the map actually paints', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/map-examples');
    await page.waitForFunction(() => window.USMap && window.USMap.get('examples'));
  });

  test('a state paints the base colour at rest', async ({ page }) => {
    expect(await fillOf(page, CO)).toBe(BASE);
  });

  test('hovering repaints the state', async ({ page }) => {
    await page.locator(CO).hover();
    expect(await fillOf(page, CO)).toBe(HOVER);
  });

  test('selecting paints a different colour from hovering', async ({ page }) => {
    await page.locator(CO).click();
    await page.mouse.move(0, 0); // move the pointer away so hover is not involved

    const selected = await fillOf(page, CO);
    expect(selected).toBe(SELECTED);
    expect(selected).not.toBe(HOVER);
    expect(selected).not.toBe(BASE);
  });

  test('an inert state paints as inert and never reacts', async ({ page }) => {
    await page.goto('/');

    // D.C. is four pixels wide on the map, so its bounding box is mostly
    // Maryland. The rail chip is the target that really stands for it.
    const dc = '.us-map__rail [data-state="DC"]';
    expect(await fillOf(page, dc)).toBe(INERT);

    await page.locator(dc).hover();
    expect(await fillOf(page, dc)).toBe(INERT);

    await page.locator(dc).click({ force: true });
    expect(await fillOf(page, dc)).toBe(INERT);
  });

  test('a rail chip paints like the state it stands for', async ({ page }) => {
    const chip = '.us-map__rail [data-state="RI"]';

    expect(await fillOf(page, chip)).toBe(BASE);
    await page.evaluate(() => USMap.get('examples').select('RI'));
    expect(await fillOf(page, chip)).toBe(SELECTED);
  });

  test('hovering a chip repaints the state on the map', async ({ page }) => {
    const shape = page.locator('.us-map__shapes [data-state="RI"]');
    const shot = () => shape.screenshot({ animations: 'disabled' });

    // Rhode Island's bounding box is mostly its neighbours and the Atlantic,
    // so measure how much of that box turns the hover colour rather than
    // asking what the dominant colour is.
    expect(shareOf(await shot(), HOVER)).toBeLessThan(0.01);

    await page.locator('.us-map__rail [data-state="RI"]').hover();

    expect(shareOf(await shot(), HOVER)).toBeGreaterThan(0.1);
  });

  test('the choropleth paints the whole scale', async ({ page }) => {
    await page.getByRole('button', { name: 'Choropleth' }).click();

    const map = await page.locator('.us-map__svg').screenshot({ animations: 'disabled' });
    const painted = colorsCovering(map, 0.005);

    for (const step of ['#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0284c7']) {
      expect(painted).toContain(step);
    }
  });

  test('selection still wins over a choropleth colour', async ({ page }) => {
    await page.getByRole('button', { name: 'Choropleth' }).click();

    const coloured = await fillOf(page, CO);
    expect(coloured).not.toBe(BASE);

    await page.locator(CO).click();
    await page.mouse.move(0, 0);

    expect(await fillOf(page, CO)).toBe(SELECTED);
  });

  test('turning the choropleth off puts the base colour back', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Choropleth' });

    await button.click();
    expect(await fillOf(page, CO)).not.toBe(BASE);

    await button.click();
    expect(await fillOf(page, CO)).toBe(BASE);
  });
});
