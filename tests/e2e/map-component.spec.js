const { test, expect } = require('@playwright/test');

/* /map-examples renders a second map on the same geometry, configured very
   differently from the home page: multi-select, sample values on every state,
   and real links on just four of them. It exercises the parts of the
   component the voter-registration map never touches. */
test.describe('map component', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/map-examples');
    await page.waitForFunction(() => window.USMap && window.USMap.get('examples'));
  });

  test('initialises itself and reads its config from the server', async ({ page }) => {
    const info = await page.evaluate(() => {
      const map = USMap.get('examples');
      return {
        id: map.id,
        selection: map.selectionMode,
        states: Object.keys(map.states).length,
        texas: map.states.TX
      };
    });

    expect(info.id).toBe('examples');
    expect(info.selection).toBe('multi');
    expect(info.states).toBe(51);
    expect(info.texas.name).toBe('Texas');
    expect(typeof info.texas.value).toBe('number');
    expect(info.texas.href).toContain('votetexas.gov');
  });

  test('a state with no href is a keyboard-operable button', async ({ page }) => {
    const co = page.locator('.us-map__shapes [data-state="CO"]');

    expect(await co.evaluate((n) => n.tagName.toLowerCase())).toBe('g');
    await expect(co).toHaveAttribute('role', 'button');
    await expect(co).toHaveAttribute('tabindex', '0');
    await expect(co).toHaveAttribute('aria-pressed', 'false');
  });

  test('clicking selects, and the payload reaches the listener', async ({ page }) => {
    const detail = await page.evaluate(async () => {
      const map = USMap.get('examples');
      return new Promise((resolve) => {
        map.root.addEventListener('us-map:select', (e) => resolve({
          code: e.detail.code,
          name: e.detail.name,
          value: e.detail.value,
          hasElement: !!(e.detail.element && e.detail.element.getBoundingClientRect)
        }), { once: true });
        document.querySelector('[data-state="CO"] .us-map__shape')
          .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });
    });

    expect(detail.code).toBe('CO');
    expect(detail.name).toBe('Colorado');
    expect(typeof detail.value).toBe('number');
    expect(detail.hasElement).toBe(true);
    await expect(page.locator('.us-map__shapes [data-state="CO"]')).toHaveClass(/is-selected/);
  });

  test('multi-select keeps every pick, and aria-pressed follows', async ({ page }) => {
    await page.locator('.us-map__shapes [data-state="CO"]').click();
    await page.locator('.us-map__shapes [data-state="NV"]').click();

    expect(await page.evaluate(() => USMap.get('examples').selection())).toEqual(['CO', 'NV']);
    await expect(page.locator('.us-map__shapes [data-state="CO"]')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('.us-map__shapes [data-state="CO"]').click();
    expect(await page.evaluate(() => USMap.get('examples').selection())).toEqual(['NV']);
    await expect(page.locator('.us-map__shapes [data-state="CO"]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('Enter and Space activate a non-link state', async ({ page }) => {
    await page.locator('.us-map__shapes [data-state="CO"]').focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => USMap.get('examples').isSelected('CO'))).toBe(true);

    await page.keyboard.press(' ');
    expect(await page.evaluate(() => USMap.get('examples').isSelected('CO'))).toBe(false);
  });

  test('preventDefault on us-map:select cancels navigation and selection', async ({ page }) => {
    const result = await page.evaluate(() => {
      const map = USMap.get('examples');
      const block = (e) => e.preventDefault();
      map.root.addEventListener('us-map:select', block);

      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      document.querySelector('[data-state="TX"] .us-map__shape').dispatchEvent(event);

      map.root.removeEventListener('us-map:select', block);
      return { prevented: event.defaultPrevented, selected: map.isSelected('TX') };
    });

    expect(result.prevented).toBe(true);
    expect(result.selected).toBe(false);
  });

  test('hover and focus emit enter and leave exactly once per state', async ({ page }) => {
    const log = await page.evaluate(async () => {
      const map = USMap.get('examples');
      const events = [];
      map.on('us-map:enter', (e) => events.push('enter:' + e.detail.code));
      map.on('us-map:leave', (e) => events.push('leave:' + e.detail.code));

      const fire = (code, type) => document.querySelector(`[data-state="${code}"] .us-map__shape`)
        .dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));

      fire('CO', 'mouseover');
      fire('CO', 'mouseover');   // still the same state
      fire('NV', 'mouseover');   // moving straight to a neighbour
      fire('NV', 'mouseout');

      return events;
    });

    expect(log).toEqual(['enter:CO', 'leave:CO', 'enter:NV', 'leave:NV']);
  });

  test('a named action runs, and can cancel navigation by returning false', async ({ page }) => {
    const result = await page.evaluate(() => {
      const map = USMap.get('examples');
      const seen = [];

      USMap.register('probe', (state) => { seen.push(state.code); return false; });
      map.states.CO.action = 'probe';

      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      document.querySelector('[data-state="CO"] .us-map__shape').dispatchEvent(event);

      delete map.states.CO.action;
      return { seen, prevented: event.defaultPrevented };
    });

    expect(result.seen).toEqual(['CO']);
    expect(result.prevented).toBe(true);
  });

  test('the programmatic API drives the same state as clicking', async ({ page }) => {
    const changes = await page.evaluate(() => {
      const map = USMap.get('examples');
      const seen = [];
      map.on('us-map:change', (e) => seen.push(e.detail.selection.join(',')));

      map.select('FL');
      map.select('GA');
      map.deselect('FL');
      map.clear();

      return seen;
    });

    expect(changes).toEqual(['FL', 'FL,GA', 'GA', '']);
    await expect(page.locator('.us-map__shapes [data-state="GA"]')).not.toHaveClass(/is-selected/);
  });

  test('a state and its rail chip select together', async ({ page }) => {
    await page.evaluate(() => USMap.get('examples').select('RI'));

    await expect(page.locator('.us-map__shapes [data-state="RI"]')).toHaveClass(/is-selected/);
    await expect(page.locator('.us-map__rail [data-state="RI"]')).toHaveClass(/is-selected/);
  });

  /* What a state actually paints is covered in map-paint.spec.js, which reads
     pixels -- Chrome reports a stale getComputedStyle(path).fill here. */
});
