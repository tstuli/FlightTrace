import { expect, test } from '@playwright/test'

test('loads the flight library on desktop and mobile', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Your flights/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Download or restore a backup' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download backup' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restore backup', exact: true })).toBeVisible()
  await expect(page.getByText(/not saved on the server/)).toBeVisible()
  await expect(page.getByText(/Provided “as is,” without warranties/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'GNU GPLv3' })).toHaveAttribute('href', 'https://github.com/tstuli/FlightTrace/blob/main/LICENSE')
  await page.getByRole('link', { name: 'Storage' }).click()
  await expect(page.getByRole('heading', { name: 'Storage & backups' })).toBeVisible()
  expect(requests.every((url) => new URL(url).hostname === '127.0.0.1')).toBeTruthy()
})

test('reloads the production app while offline', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit crashes internally when its context is switched offline during navigation.')
  const browserErrors: string[] = []
  const failedRequests: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('requestfailed', (request) => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`))
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.evaluate(() => new Promise<void>((resolve) => {
    if (navigator.serviceWorker.controller) resolve()
    else navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
  }))
  const cachedUrls = await page.evaluate(async () => {
    const cache = await caches.open('flighttrace-shell-v5')
    return (await cache.keys()).map((request) => request.url)
  })
  expect(cachedUrls.some((url) => url.endsWith('/index.html'))).toBeTruthy()
  expect(cachedUrls.some((url) => url.includes('/assets/index-') && url.endsWith('.js'))).toBeTruthy()
  expect(cachedUrls.some((url) => url.includes('/assets/csv.worker-') && url.endsWith('.js'))).toBeTruthy()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: /Your flights/ }), {
    message: `Offline reload errors: ${JSON.stringify({ browserErrors, failedRequests })}`
  }).toBeVisible()
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles({
    name: 'OFFLINE-TEST-2026-06-01-12-00-00.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Date,Time,VFR(%)\n2026-06-01,12:00:00.000,100\n2026-06-01,12:00:01.000,90')
  })
  await expect(page.getByRole('heading', { name: 'Set up this plane' })).toBeVisible()
  await context.setOffline(false)
})

test('does not load analytics or third-party tracking resources', async ({ page }) => {
  const thirdPartyRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== 'http://127.0.0.1:4173') thirdPartyRequests.push(request.url())
  })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  expect(thirdPartyRequests).toEqual([])
})

test('imports a telemetry CSV through the adaptive plane wizard', async ({ page }) => {
  await page.goto('/')
  const csv = [
    'Date,Time,VFR(%),RX,RX,Throttle,Altitude(m),Unused,',
    '2026-06-01,12:00:00.000,100,0,1,-1024,10,,',
    '2026-06-01,12:00:00.250,80,0,1,-500,11,,',
    '2026-06-01,12:00:00.500,40,0,1,0,12,,',
    '2026-06-01,12:00:01.750,30,0,1,100,13,,',
    '2026-06-01,12:00:02.000,90,0,1,-1024,12,,'
  ].join('\n')
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles({
    name: 'TEST-PLANE-2026-06-01-12-00-00.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv)
  })
  await expect(page.getByRole('heading', { name: 'Set up this plane' })).toBeVisible()
  await expect(page.getByLabel('Plane name')).toHaveValue('TEST-PLANE')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByLabel('RF protocol')).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByLabel('Flight-active channel')).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Generated diagnostics')).toBeVisible()
  await page.getByRole('button', { name: 'Save plane and import' }).click()
  await expect(page.getByRole('heading', { name: 'TEST-PLANE' })).toBeVisible()
  await expect(page.getByText(/Imported TEST-PLANE/)).toBeVisible()

  await page.locator('input[type="file"][accept*="csv"]').setInputFiles({
    name: 'TEST-PLANE-2026-06-02-12-00-00 (1).csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`${csv}\n2026-06-01,12:00:03.000,94,0,1,-1024,12,,`)
  })
  await expect(page.getByText(/Imported TEST-PLANE-2026-06-02-12-00-00 \(1\)\.csv/)).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Set up this plane' })).not.toBeVisible()

  await page.locator('input[type="file"][accept*="csv"]').setInputFiles({
    name: 'DUPLICATE-NAME-2026-06-02-11-00-00.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)
  })
  await expect(page.getByText(/duplicates an imported log and was ignored/)).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Set up this plane' })).not.toBeVisible()

  await page.locator('input[type="file"][accept*="csv"]').setInputFiles([
    { name: 'RADIO-ALIAS-2026-06-02-12-00-00.csv', mimeType: 'text/csv', buffer: Buffer.from(`${csv}\n2026-06-01,12:00:03.000,95,0,1,-1024,12,,`) },
    { name: 'RADIO-ALIAS-2026-06-03-12-00-00.csv', mimeType: 'text/csv', buffer: Buffer.from(`${csv}\n2026-06-01,12:00:04.000,96,0,1,-1024,12,,`) }
  ])
  await expect(page.getByRole('heading', { name: 'Associate this log with an existing plane' })).toBeVisible()
  await expect(page.getByText('2 files in this upload share this aircraft name.')).toBeVisible()
  await expect(page.getByLabel('Existing plane').locator('option:checked')).toHaveText('TEST-PLANE')
  await page.getByRole('button', { name: 'Associate log with selected plane' }).click()
  await expect(page.getByText(/Imported RADIO-ALIAS-2026-06-03/)).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Set up this plane' })).not.toBeVisible()

  await page.locator('input[type="file"][accept*="csv"]').setInputFiles({
    name: 'RADIO-ALIAS-2026-06-04-12-00-00.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`${csv}\n2026-06-01,12:00:05.000,97,0,1,-1024,12,,`)
  })
  await expect(page.getByText(/Imported RADIO-ALIAS-2026-06-04/)).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Set up this plane' })).not.toBeVisible()
})

test('groups LiPo cells into pack voltage and cell-balance analysis', async ({ page }) => {
  await page.goto('/')
  const csv = [
    'Date,Time,Throttle,LiPo1(V),LiPo2(V),LiPo3(V),LiPo4(V)',
    '2026-06-01,12:00:00.000,-1024,4.20,4.10,4.15,4.05',
    '2026-06-01,12:00:01.000,-500,4.10,3.80,4.05,3.95',
    '2026-06-01,12:00:02.000,-400,4.00,3.90,3.95,3.85',
    '2026-06-01,12:00:03.000,-1024,3.95,3.90,3.90,3.85'
  ].join('\n')
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles({
    name: 'LIPO-GROUP-2026-06-01-12-00-00.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv)
  })

  await expect(page.getByLabel('Propulsion')).toHaveValue('electric')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText(/Auto-selected from this log/)).toBeVisible()
  const flightBattery = page.getByRole('group', { name: 'Flight battery' })
  await expect(flightBattery.getByLabel('Chemistry')).toHaveValue('lipo')
  await expect(flightBattery.getByLabel('Cells')).toHaveValue('4')
  await expect(flightBattery.getByLabel('Voltage telemetry channel').locator('option:checked')).toHaveText('LiPo pack voltage (V)')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByLabel('Flight-active channel').locator('option:checked')).toHaveText('Throttle')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('LiPo cell deviation high')).toBeVisible()
  await page.getByRole('button', { name: 'Save plane and import' }).click()

  await page.getByRole('link', { name: /LIPO-GROUP.*Open flight library/ }).click()
  await page.locator('.log-main').click()
  await expect(page.getByLabel('LiPo pack voltage', { exact: true })).toBeVisible()
  await expect(page.getByLabel('LiPo cell voltage deviation', { exact: true })).toBeVisible()
  const balance = page.locator('section.analysis-panel').filter({ has: page.getByRole('heading', { name: 'LiPo cell balance' }) })
  await expect(balance).toContainText('LiPo cell voltage deviation')
  await expect(balance).toContainText('0.300 V')
})

test('skips every matching plane in the current upload batch', async ({ page }) => {
  await page.goto('/')
  const csv = Buffer.from('Date,Time,VFR(%)\n2026-06-01,12:00:00.000,100\n2026-06-01,12:00:01.000,90')
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles([
    { name: 'SKIP-ME-2026-06-01-12-00-00.csv', mimeType: 'text/csv', buffer: csv },
    { name: 'SKIP-ME-2026-06-01-13-00-00.csv', mimeType: 'text/csv', buffer: csv },
    { name: 'KEEP-ME-2026-06-01-14-00-00.csv', mimeType: 'text/csv', buffer: csv }
  ])
  await expect(page.getByLabel('Plane name')).toHaveValue('SKIP-ME')
  await page.getByRole('button', { name: 'Skip this plane for this upload' }).click()
  await expect(page.getByLabel('Plane name')).toHaveValue('KEEP-ME')
  await page.getByRole('button', { name: 'Skip this file' }).click()
  await expect(page.getByRole('dialog', { name: 'Set up this plane' })).not.toBeVisible()
  await expect(page.getByText(/Skipped KEEP-ME/)).toBeVisible()
})

test('closing the plane wizard cancels the remaining import batch', async ({ page }) => {
  await page.goto('/')
  const csv = Buffer.from('Date,Time,VFR(%)\n2026-06-01,12:00:00.000,100\n2026-06-01,12:00:01.000,90')
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles([
    { name: 'CLOSE-ONE-2026-06-01-12-00-00.csv', mimeType: 'text/csv', buffer: csv },
    { name: 'CLOSE-TWO-2026-06-01-13-00-00.csv', mimeType: 'text/csv', buffer: Buffer.from(`${csv.toString()}\n2026-06-01,12:00:02.000,80`) }
  ])
  await expect(page.getByLabel('Plane name')).toHaveValue('CLOSE-ONE')
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog', { name: 'Set up this plane' })).not.toBeVisible()
  await expect(page.getByText('Import cancelled. Files still waiting in this batch were not processed.')).toBeVisible()
})

test('splits a detected flight at the chart cursor', async ({ page }) => {
  await page.goto('/')
  const rows = ['Date,Time,Throttle,VFR(%)']
  for (let second = 0; second <= 10; second += 1) rows.push(`2026-06-01,12:00:${String(second).padStart(2, '0')}.000,${second === 0 || second === 10 ? -1024 : -500},100`)
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles({ name: 'SPLIT-PLANE-2026-06-01-12-00-00.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) })
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Save plane and import' }).click()
  await page.getByRole('link', { name: /SPLIT-PLANE.*Open flight library/ }).click()
  await page.locator('.log-main').click()
  await expect(page.getByText('Flight 1', { exact: true })).toBeVisible()
  await page.getByLabel('Throttle', { exact: true }).check()
  await expect(page.getByText('Saved for this plane')).toBeVisible()
  await page.getByRole('link', { name: '← SPLIT-PLANE' }).click()
  await page.locator('.log-main').click()
  await expect(page.getByLabel('Throttle', { exact: true })).toBeChecked()
  await expect(page.getByText('2 / 24 selected')).toBeVisible()
  await page.getByRole('button', { name: 'Full screen' }).click()
  await expect(page.locator('.chart-panel.fullscreen')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exit full screen' })).toBeVisible()
  const fullscreenPanel = await page.locator('.chart-panel.fullscreen').boundingBox()
  const legend = page.locator('.chart-panel.fullscreen .u-legend')
  await expect(legend).toBeVisible()
  const legendBox = await legend.boundingBox()
  expect(fullscreenPanel && legendBox && legendBox.y + legendBox.height <= fullscreenPanel.y + fullscreenPanel.height).toBeTruthy()
  await page.keyboard.press('Escape')
  await expect(page.locator('.chart-panel.fullscreen')).toHaveCount(0)
  const splitButton = page.getByRole('button', { name: 'Split at cursor' })
  await expect(splitButton).toBeDisabled()
  const overlay = page.locator('.u-over')
  const box = await overlay.boundingBox()
  if (!box) throw new Error('Chart overlay was not available.')
  await overlay.hover({ position: { x: box.width / 2, y: box.height / 2 } })
  await expect(splitButton).toBeEnabled()
  await splitButton.click()
  await expect(page.getByText('Flight 2', { exact: true })).toBeVisible()
})
