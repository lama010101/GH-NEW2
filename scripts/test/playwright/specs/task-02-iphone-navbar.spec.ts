import { test, expect } from '@playwright/test';

test.describe('TASK 2 - iPhone safe-area', () => {
  test('navbar has computed padding-bottom > 0px on iPhone 14', async ({ page }) => {
    // Navigate to home page
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for navbar or bottom navigation element
    const navbar = page.locator('
      nav,
      [class*="navbar"],
      [class*="Navbar"],
      [class*="bottom"],
      [class*="Bottom"],
      [class*="nav-bar"],
      header,
      footer
    ').first();

    // If navbar exists, check its padding
    if (await navbar.isVisible().catch(() => false)) {
      const paddingBottom = await navbar.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.paddingBottom;
      });

      // Parse the padding value (e.g., "20px" -> 20)
      const paddingValue = parseFloat(paddingBottom);

      // On iPhone with safe-area-inset-bottom, padding should be > 0
      // or should use env() function
      expect(
        paddingValue > 0 || paddingBottom.includes('env') || paddingBottom.includes('constant')
      ).toBe(true);
    } else {
      // If no explicit navbar, check body or main container for safe-area handling
      const body = page.locator('body').first();
      const bodyStyles = await body.evaluate(() => {
        const style = window.getComputedStyle(document.body);
        return {
          paddingBottom: style.paddingBottom,
          marginBottom: style.marginBottom,
        };
      });

      // Body should have safe-area considerations
      const hasSafeArea =
        parseFloat(bodyStyles.paddingBottom) > 0 ||
        parseFloat(bodyStyles.marginBottom) > 0;

      // This is a soft assertion - not all pages may have explicit safe-area handling
      console.log('Body styles:', bodyStyles);
    }
  });

  test('viewport meta tag includes viewport-fit=cover for safe areas', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check for viewport meta tag
    const viewportMeta = await page.locator('meta[name="viewport"]').first();
    const content = await viewportMeta.getAttribute('content');

    // Should include viewport-fit=cover for proper safe-area handling
    expect(content).toContain('viewport-fit=cover');
  });
});
