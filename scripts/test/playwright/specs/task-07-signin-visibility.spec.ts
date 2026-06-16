import { test, expect } from '@playwright/test';

test.describe('TASK 7 - Sign-in modal sign-up visibility', () => {
  test('sign-up CTA element is visible with opacity 1 and non-zero size', async ({ page }) => {
    // Navigate to home page
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for auth modal to appear (it auto-opens)
    await page.waitForTimeout(500);

    // Find sign-up CTA element - it's a button with text "Sign Up"
    const signUpCTA = page.locator('button:has-text("Sign Up")').first();

    // Assert element is visible
    await expect(signUpCTA).toBeVisible();

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
  });

  test('sign-in modal has sign-up section with correct styling', async ({ page }) => {
    // Navigate to home page
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for auth modal to appear (it auto-opens)
    await page.waitForTimeout(500);

    // Look for modal container
    const modal = page.locator('[class*="modal"], [role="dialog"], [class*="Modal"]').first();
    await expect(modal).toBeVisible();

    // Find any text indicating sign up option
    const signUpText = modal.locator('text=/sign up|Sign up|create account|Create account|Don\'t have an account/i').first();
    await expect(signUpText).toBeVisible();

    // Verify the element and its clickable area are visible
    const isVisible = await signUpText.isVisible();
    expect(isVisible).toBe(true);

    // Check that the parent or sibling clickable element has proper dimensions
    const clickableElement = signUpText.locator('..').locator('button, a').first();
    if (await clickableElement.isVisible().catch(() => false)) {
      const box = await clickableElement.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
      }
    }
  });
});
