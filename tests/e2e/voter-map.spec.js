const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/* The same CSV the app reads, so the test fails if the two drift apart. */
function registrationSites() {
  const csv = fs.readFileSync(path.join(__dirname, '..', '..', 'views', 'voter_reg.csv'), 'utf8');
  const sites = {};

  csv.trim().split(/\r?\n/).slice(1).forEach((line) => {
    const comma = line.indexOf(',');
    sites[line.slice(0, comma).trim()] = line.slice(comma + 1).trim();
  });

  return sites;
}

test.describe('voter registration map', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders every state and D.C.', async ({ page }) => {
    await expect(page.locator('.us-map__shape')).toHaveCount(51);
  });

  test('every state in the CSV is a real link to its own site', async ({ page }) => {
    const sites = registrationSites();
    const links = page.locator('a.us-map__hit');

    await expect(links).toHaveCount(50);

    const hrefs = await links.evaluateAll((nodes) =>
      nodes.map((node) => [node.getAttribute('data-state'), node.getAttribute('href')])
    );

    expect(new Set(hrefs.map(([, href]) => href)).size).toBe(50);

    // spot-check that codes line up with the right URLs
    const byCode = Object.fromEntries(hrefs);
    expect(byCode.TX).toBe(sites.Texas);
    expect(byCode.CA).toBe(sites.California);
    expect(byCode.AK).toBe(sites.Alaska);
  });

  test('links open in a new tab without leaking the opener', async ({ page }) => {
    const tx = page.locator('a[data-state="TX"]');

    await expect(tx).toHaveAttribute('target', '_blank');
    await expect(tx).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('D.C. has no CSV row, so it renders inert', async ({ page }) => {
    const dc = page.locator('.us-map__shapes [data-state="DC"]');

    await expect(dc).toHaveClass(/is-static/);
    expect(await dc.evaluate((node) => node.tagName.toLowerCase())).toBe('g');
    await expect(dc.locator('title')).toHaveText(/no registration link/);
  });

  test('each state carries an accessible name', async ({ page }) => {
    await expect(page.locator('a[data-state="TX"]')).toHaveAttribute(
      'aria-label',
      'Register to vote in Texas'
    );
    await expect(page.locator('.us-map__shapes [data-state="TX"] title')).toHaveText(
      'Register to vote in Texas'
    );
  });

  test('small states get a rail chip as well as a shape', async ({ page }) => {
    await expect(page.locator('.us-map__chip')).toHaveCount(9);

    for (const code of ['VT', 'NH', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD', 'DC']) {
      await expect(page.locator(`.us-map__rail [data-state="${code}"]`)).toHaveCount(1);
    }
  });

  test('the chip and the state point at the same place', async ({ page }) => {
    const shape = await page.locator('.us-map__shapes a[data-state="RI"]').getAttribute('href');
    const chip = await page.locator('.us-map__rail a[data-state="RI"]').getAttribute('href');

    expect(chip).toBe(shape);
  });

  test('a tiny state is still a usable tap target via its chip', async ({ page }) => {
    const shape = await page.locator('.us-map__shapes [data-state="RI"] .us-map__shape').boundingBox();
    const chip = await page.locator('.us-map__rail [data-state="RI"] .us-map__chip-box').boundingBox();

    // Rhode Island on the map is far too small to hit reliably
    expect(shape.width).toBeLessThan(24);
    expect(chip.width).toBeGreaterThanOrEqual(40);
    expect(chip.height).toBeGreaterThanOrEqual(24);
  });

  test('hovering a state highlights it and its label', async ({ page }) => {
    const hit = page.locator('.us-map__shapes [data-state="TX"]');
    const label = page.locator('.us-map__labels [data-state="TX"]');

    await expect(hit).not.toHaveClass(/is-active/);
    await hit.hover();
    await expect(hit).toHaveClass(/is-active/);
    await expect(label).toHaveClass(/is-active/);
  });

  test('hovering a chip highlights the state on the map too', async ({ page }) => {
    await page.locator('.us-map__rail [data-state="RI"]').hover();

    await expect(page.locator('.us-map__shapes [data-state="RI"]')).toHaveClass(/is-active/);
  });

  test('a state can be reached and followed by keyboard', async ({ page }) => {
    await page.locator('a[data-state="AL"]').focus();

    const focused = await page.evaluate(() => document.activeElement.getAttribute('data-state'));
    expect(focused).toBe('AL');
  });

  test('the map still works with JavaScript switched off', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/');

    await expect(page.locator('a.us-map__hit')).toHaveCount(50);
    await expect(page.locator('a[data-state="TX"]')).toHaveAttribute(
      'href',
      registrationSites().Texas
    );

    await context.close();
  });

  test('the page is usable at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // the map scrolls sideways rather than shrinking states to nothing
    const svg = page.locator('.us-map__svg');
    expect((await svg.boundingBox()).width).toBeGreaterThanOrEqual(560);

    // and the page itself does not scroll sideways
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflows).toBe(false);
  });
});
