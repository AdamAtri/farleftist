const { test, expect } = require('@playwright/test');

/* Exercises public/javascripts/us-map-examples.js through the demo page at
   /map-examples, which turns each example on with a toolbar button. */

const CO = '.us-map__shapes [data-state="CO"]';
const TX = '.us-map__shapes [data-state="TX"]'; // one of the four linked states

test.describe('map interaction examples', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/map-examples');
    await page.waitForFunction(() => window.USMap && window.USMap.get('examples'));
  });

  async function only(page, wanted) {
    // Leave exactly the named examples switched on.
    const buttons = page.locator('.demo-toggle[data-demo]');

    for (const button of await buttons.all()) {
      const name = await button.getAttribute('data-demo');
      const on = (await button.getAttribute('aria-pressed')) === 'true';
      if (on !== wanted.includes(name)) await button.click();
    }
  }

  test.describe('popover', () => {
    test('appears on hover with the state name and value, and leaves again', async ({ page }) => {
      await only(page, ['popover']);

      const popover = page.locator('.us-map-popover');
      await expect(popover).not.toHaveClass(/is-visible/);

      await page.locator(CO).hover();
      await expect(popover).toHaveClass(/is-visible/);
      await expect(popover).toHaveText(/^Colorado — \d+$/);

      await page.mouse.move(5, 5);
      await expect(popover).not.toHaveClass(/is-visible/);
    });

    test('sits over the state it describes', async ({ page }) => {
      await only(page, ['popover']);
      await page.locator(CO).hover();

      const state = await page.locator(CO).boundingBox();
      const popover = await page.locator('.us-map-popover').boundingBox();
      const centre = popover.x + popover.width / 2;

      expect(centre).toBeGreaterThan(state.x - 40);
      expect(centre).toBeLessThan(state.x + state.width + 40);
      expect(popover.y).toBeLessThan(state.y); // above, not covering
    });

    test('never swallows a click meant for the map', async ({ page }) => {
      await only(page, ['popover']);
      await page.locator(CO).hover();

      await page.locator(CO).click();
      expect(await page.evaluate(() => USMap.get('examples').isSelected('CO'))).toBe(true);
    });
  });

  test.describe('detail panel', () => {
    test('opens on click, shows a loading state, then the loaded fields', async ({ page }) => {
      await only(page, ['panel']);
      await page.locator(CO).click();

      const panel = page.locator('.us-map-panel');
      await expect(panel).toHaveClass(/is-open/);
      await expect(panel.locator('.us-map-panel__title')).toHaveText('Colorado');
      await expect(panel.locator('.us-map-panel__loading')).toBeVisible();

      await expect(panel.locator('dt')).toHaveText(['Postal code', 'Sample value']);
      await expect(panel.locator('dd').first()).toHaveText('CO');
      await expect(panel.locator('.us-map-panel__loading')).toHaveCount(0);
    });

    test('closes on the close button', async ({ page }) => {
      await only(page, ['panel']);
      await page.locator(CO).click();
      await page.locator('.us-map-panel__close').click();

      await expect(page.locator('.us-map-panel')).not.toHaveClass(/is-open/);
    });

    test('a slow response for one state cannot overwrite a newer one', async ({ page }) => {
      await only(page, []);

      // First click resolves after the second one, the classic panel race.
      await page.evaluate(() => {
        const map = USMap.get('examples');
        window.USMapExamples.detailPanel(map, {
          container: document.body,
          load: (state) => new Promise((resolve) => {
            setTimeout(() => resolve({ Who: state.name }), state.code === 'CO' ? 300 : 20);
          })
        });
      });

      await page.locator(CO).click();
      await page.locator('.us-map__shapes [data-state="NV"]').click();
      await page.waitForTimeout(500);

      await expect(page.locator('.us-map-panel__title')).toHaveText('Nevada');
      await expect(page.locator('.us-map-panel dd')).toHaveText('Nevada');
    });
  });

  test.describe('pulse', () => {
    test('adds a ripple shaped like the state, then cleans it up', async ({ page }) => {
      await only(page, ['pulse']);

      const shape = await page.locator(`${CO} .us-map__shape`).getAttribute('d');
      await page.locator(CO).click();

      const ripple = page.locator('.us-map-pulse');
      await expect(ripple).toHaveCount(1);
      await expect(ripple).toHaveAttribute('d', shape);

      // it removes itself when the animation finishes
      await expect(ripple).toHaveCount(0, { timeout: 3000 });
    });
  });

  test.describe('zoom', () => {
    test('frames the clicked state and returns home on Escape', async ({ page }) => {
      await only(page, ['zoom']);

      const svg = page.locator('.us-map__svg');
      const home = await svg.getAttribute('viewBox');

      await page.locator('.us-map__shapes [data-state="ME"]').click();
      await expect
        .poll(async () => (await svg.getAttribute('viewBox')) !== home, { timeout: 3000 })
        .toBe(true);

      const zoomed = (await svg.getAttribute('viewBox')).split(' ').map(Number);
      expect(zoomed[2]).toBeLessThan(1060);

      // keeps the map's proportions so nothing is squashed
      expect(Math.abs(zoomed[2] / zoomed[3] - 1060 / 610)).toBeLessThan(0.02);

      await page.keyboard.press('Escape');
      await expect.poll(async () => svg.getAttribute('viewBox'), { timeout: 3000 }).toBe(home);
    });

    test('a bigger state gets a bigger frame', async ({ page }) => {
      await only(page, ['zoom']);

      const widthAfterZoomTo = async (code) => {
        await page.evaluate((c) => window.__zoom.to(c), code);
        await page.waitForTimeout(700);
        return Number((await page.locator('.us-map__svg').getAttribute('viewBox')).split(' ')[2]);
      };

      await page.evaluate(() => {
        window.__zoom = window.USMapExamples.zoomTo(USMap.get('examples'), { duration: 0 });
      });

      expect(await widthAfterZoomTo('TX')).toBeGreaterThan(await widthAfterZoomTo('RI'));
      await page.evaluate(() => window.__zoom());
    });
  });

  test.describe('confirm before leaving', () => {
    test('asks first, and does not navigate or select', async ({ page }) => {
      await only(page, ['confirm']);

      await page.locator(TX).click();

      const dialog = page.locator('.us-map-confirm');
      await expect(dialog).toHaveClass(/is-visible/);
      await expect(dialog).toContainText('Open the official site for Texas?');

      expect(await page.evaluate(() => USMap.get('examples').isSelected('TX'))).toBe(false);
      expect(page.url()).toContain('/map-examples');
    });

    test('opens the real registration site when accepted', async ({ page }) => {
      await only(page, ['confirm']);

      // Record the call instead of letting it load. These are live government
      // sites and a test suite has no business hitting them on every run.
      await page.evaluate(() => {
        window.__opened = [];
        window.open = (url, target, features) => {
          window.__opened.push({ url, target, features });
          return null;
        };
      });

      await page.locator(TX).click();
      await page.locator('.us-map-confirm__go').click();

      const opened = await page.evaluate(() => window.__opened);
      expect(opened).toHaveLength(1);
      expect(opened[0].url).toContain('votetexas.gov');
      expect(opened[0].target).toBe('_blank');
      expect(opened[0].features).toContain('noopener');
      await expect(page.locator('.us-map-confirm')).not.toHaveClass(/is-visible/);
    });

    test('cancel dismisses it and goes nowhere', async ({ page }) => {
      await only(page, ['confirm']);
      await page.locator(TX).click();
      await page.locator('.us-map-confirm__cancel').click();

      await expect(page.locator('.us-map-confirm')).not.toHaveClass(/is-visible/);
      expect(await page.evaluate(() => USMap.get('examples').isSelected('TX'))).toBe(false);
    });

    test('an unlinked state is untouched by it', async ({ page }) => {
      await only(page, ['confirm']);
      await page.locator(CO).click();

      await expect(page.locator('.us-map-confirm')).not.toHaveClass(/is-visible/);
      expect(await page.evaluate(() => USMap.get('examples').isSelected('CO'))).toBe(true);
    });

    test('a vetoed click does not trigger the other examples either', async ({ page }) => {
      // confirmLinks calls preventDefault. Anything else listening for the
      // same event has to respect that, or a cancelled click still opens a
      // panel and fires a ripple.
      await only(page, ['confirm', 'panel', 'pulse']);

      await page.locator(TX).click();

      await expect(page.locator('.us-map-confirm')).toHaveClass(/is-visible/);
      await expect(page.locator('.us-map-panel')).not.toHaveClass(/is-open/);
      await expect(page.locator('.us-map-pulse')).toHaveCount(0);
    });
  });

  test.describe('selection summary', () => {
    test('mirrors the map and can remove from it', async ({ page }) => {
      await only(page, ['summary']);

      const summary = page.locator('#summary');
      await expect(summary).toContainText('No states selected');

      await page.locator(CO).click();
      await page.locator('.us-map__shapes [data-state="NV"]').click();

      await expect(summary.locator('.us-map-summary__item')).toHaveCount(2);
      await expect(summary).toContainText('Colorado');
      await expect(summary).toContainText('Nevada');
      await expect(summary.locator('.us-map-summary__clear')).toHaveText('Clear all 2');

      await summary.locator('.us-map-summary__remove').first().click();
      expect(await page.evaluate(() => USMap.get('examples').selection())).toEqual(['NV']);

      await summary.locator('.us-map-summary__clear').click();
      expect(await page.evaluate(() => USMap.get('examples').selection())).toEqual([]);
      await expect(page.locator(CO)).not.toHaveClass(/is-selected/);
    });
  });

  test.describe('tour', () => {
    test('walks the states in order and stops on its own', async ({ page }) => {
      await only(page, []);

      const visited = await page.evaluate(() => new Promise((resolve) => {
        const map = USMap.get('examples');
        const seen = [];

        map.on('us-map:change', (e) => seen.push(e.detail.selection.join(',')));
        window.USMapExamples.tour(map, ['CA', 'TX', 'FL'], {
          interval: 60,
          onStop: () => resolve(seen)
        });
      }));

      expect(visited).toEqual(['CA', 'TX', 'FL']);
      await expect(page.locator('.us-map__shapes [data-state="FL"]')).toHaveClass(/is-selected/);
    });

    test('the toolbar button starts and stops it', async ({ page }) => {
      await only(page, []);

      const button = page.getByRole('button', { name: 'Run tour' });
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');

      await expect
        .poll(async () => page.evaluate(() => USMap.get('examples').selection().length))
        .toBeGreaterThan(0);

      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'false');
    });
  });

  test('every example cleans up after itself when switched off', async ({ page }) => {
    await only(page, ['popover', 'panel', 'summary', 'confirm', 'choropleth']);
    await only(page, []);

    await expect(page.locator('.us-map-popover')).toHaveCount(0);
    await expect(page.locator('.us-map-panel')).toHaveCount(0);
    await expect(page.locator('.us-map-confirm')).toHaveCount(0);
    await expect(page.locator('#summary')).toBeEmpty();
    await expect(page.locator('#legend')).toBeEmpty();

    const hook = await page.locator(CO).evaluate((n) => n.style.getPropertyValue('--us-map-fill'));
    expect(hook).toBe('');
  });
});
