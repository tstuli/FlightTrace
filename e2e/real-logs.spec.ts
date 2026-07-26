import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const realLogDirectory = process.env.REAL_LOG_DIR

test('locally validates supplied FrSky logs without uploading them', async ({ page }) => {
  test.skip(!realLogDirectory || !existsSync(realLogDirectory), 'REAL_LOG_DIR is only set for private local compatibility checks')
  const files = readdirSync(realLogDirectory!).filter((name) => name.endsWith('.csv')).sort()
  expect(files.length).toBeGreaterThanOrEqual(15)
  await page.goto('/')

  const configured = new Set<string>()
  for (const fileName of files) {
    await page.locator('input[type="file"][accept*="csv"]').setInputFiles(join(realLogDirectory!, fileName))
    const inferredModel = fileName.replace(/-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.csv$/, '')
    if (!configured.has(inferredModel)) {
      await expect(page.getByRole('heading', { name: 'Set up this plane' })).toBeVisible()
      for (let step = 0; step < 3; step += 1) await page.getByRole('button', { name: 'Continue' }).click()
      await page.getByRole('button', { name: 'Save plane and import' }).click()
      configured.add(inferredModel)
    }
    await expect(page.getByText(new RegExp(`Imported ${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))).toBeVisible()
  }
  await expect(page.locator('.model-card')).toHaveCount(configured.size)
})
