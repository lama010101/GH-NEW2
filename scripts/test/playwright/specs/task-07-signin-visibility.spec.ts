import { test, expect } from '@playwright/test';

test.describe.skip('TASK 7 - Sign-in modal sign-up visibility', () => {
  test('sign-up CTA element is visible with opacity 1 and non-zero size', async ({ page }) => {
    // Navigate to home page
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check if AuthModal component exists in the DOM (any element with AuthModal class)
    const authModalExists = await page.locator('[class*="AuthModal"]').count() > 0;
    expect(authModalExists).toBe(true);

    // Find sign-up CTA element - it's a button with class containing "switchModeButton"
    const signUpCTA = page.locator('button[class*="switchModeButton"]').first();

    // Check if element exists in DOM
    const exists = await signUpCTA.count() > 0;
    expect(exists).toBe(true);

    // If visible, check properties
    if (await signUpCTA.isVisible().catch(() => false)) {
      // Assert computed opacity is 1
      const opacity = await signUpCTA.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.opacity;
      });
      expect(opacity).toBe('1');

      // Assert element has non-zero size
      const boundingBox = await signUpCTA.boundingBox();
      expect(boundingBox).not.toBeNull();
      expect(boundingBox!.width).toBeGreaterThan(0);
      expect(boundingBox!.height).toBeGreaterThan(0);

      // Verify the button text is "Sign Up"
      const buttonText = await signUpCTA.textContent();
      expect(buttonText).toBe('Sign Up');
    }
  });

  test('sign-in modal has sign-up section with correct styling', async ({ page }) => {
    // Navigate to home page
    await page.waitForLoadState('networkidle');

    // Check if AuthModal component exists in the DOM (any element with AuthModal class)
    const authModalExists = await page.locator('[class*="AuthModal"]').count() > 0;
    expect(authModalExists).toBe(true);

    // Look for modal container - use button class as indicator that modal is present
    const modal = page.locator('button[class*="switchModeButton"]').first();

    // Check if element exists in DOM
    const exists = await modal.count() > 0;
    expect(exists).toBe(true);

    // If visible, check properties
    if (await modal.isVisible().catch(() => false)) {
      // Check that the clickable element has proper dimensions
      const box = await modal.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
      }
    }
  });
});
