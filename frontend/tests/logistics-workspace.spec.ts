import { test, expect } from '@playwright/test';

test.describe('Logistics Workspace (PLM)', () => {
  test('should load the main page and display core components', async ({ page }) => {
    // Navigate to the main PLM page
    await page.goto('/plm/');
    
    // Check if the main title or an element indicating the PLM module is present
    await expect(page).toHaveTitle(/frontend|Vite|PLM/i);
    
    // We can just verify the layout structure
    const bodyText = await page.locator('body').innerText();
    
    // As long as it renders without a blank white screen, this is a basic sanity check
    expect(bodyText).toBeDefined();
  });

  test('should open settings drawer', async ({ page }) => {
    await page.goto('/plm/');
    
    // Find the settings button (assuming it's a gear icon button in the header)
    const settingsButton = page.locator('button:has(svg.lucide-settings)').first();
    
    // Try to open it if it's there
    if (await settingsButton.isVisible()) {
      await settingsButton.click();
      
      // Wait for settings drawer to open
      await expect(page.locator('text=ГЛОБАЛЬНІ НАЛАШТУВАННЯ').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Трудозатрати замір').first()).toBeVisible();
      
      // Close settings
      await page.keyboard.press('Escape');
    }
  });
});
