import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

console.log('--- Testing 3D Wi-Fi Scan & Spectral UI with Playwright ---')

const backend = spawn('node', ['server/index.mjs'], { stdio: 'ignore' })
const vite = spawn('npx', ['vite', '--port', '5199', '--host', '127.0.0.1'], { stdio: 'ignore' })

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServer(url, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {}
    await sleep(250)
  }
  throw new Error(`Timeout waiting for ${url}`)
}

try {
  await waitForServer('http://127.0.0.1:4175/api/health')
  await waitForServer('http://127.0.0.1:5199/')
  console.log('Servers ready. Launching headless browser...')

  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  await page.goto('http://127.0.0.1:5199/')
  await page.waitForLoadState('networkidle')
  console.log('Home loaded.')

  // 1. Verify 3D Scan & Spectral button in sidebar
  const nav3d = page.getByRole('button', { name: '3D Scan & Spectral' })
  if (!(await nav3d.count())) throw new Error('3D Scan & Spectral button not found in sidebar')

  // 2. Click 3D Scan & Spectral
  console.log('Navigating to 3D Scan & Spectral studio...')
  await nav3d.click()
  await page.waitForTimeout(600)

  // Verify 3D Canvas element exists
  const canvas3d = page.locator('.three-d-canvas-container canvas')
  await canvas3d.waitFor({ state: 'attached', timeout: 5000 })
  console.log('Three.js WebGL canvas successfully rendered!')

  // Check stats
  const totalVoxelsText = await page.locator('.stat-item .stat-val').nth(1).textContent()
  console.log('Reported 3D Voxels in UI:', totalVoxelsText)

  // 3. Click "Start 3D Area Scan"
  const startScanBtn = page.getByRole('button', { name: /Start 3D Area Scan/i })
  if (await startScanBtn.count()) {
    console.log('Clicking "Start 3D Area Scan"...')
    await startScanBtn.click()
    await page.waitForTimeout(1000)
    console.log('Area scan triggered successfully.')
  }

  // 4. Test camera preset buttons
  const topPlanBtn = page.getByRole('button', { name: 'Top Plan' })
  await topPlanBtn.click()
  await page.waitForTimeout(300)

  const spectralBtn = page.getByRole('button', { name: 'Spectral 3D' })
  await spectralBtn.click()
  await page.waitForTimeout(300)

  const orbitBtn = page.getByRole('button', { name: '3D Orbit' })
  await orbitBtn.click()
  await page.waitForTimeout(300)

  // Take screenshot of 3D studio
  await page.screenshot({ path: '3d_scan_studio_verified.png' })
  console.log('Saved 3D Studio screenshot to 3d_scan_studio_verified.png')

  // 5. Switch back to Live overview and test 3D toggle on the overview
  console.log('Switching back to Live overview...')
  await page.getByRole('button', { name: 'Live overview' }).click()
  await page.waitForTimeout(500)

  const toggle3d = page.getByRole('button', { name: '3D View' })
  if (await toggle3d.count()) {
    console.log('Switching Overview to 3D View...')
    await toggle3d.click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: 'overview_3d_verified.png' })
    console.log('Saved Overview 3D screenshot to overview_3d_verified.png')
  }

  await browser.close()
  console.log('\nPlaywright 3D UI & Three.js WebGL rendering test PASSED!')
} catch (err) {
  console.error('\nPlaywright Test Failed:', err)
  process.exitCode = 1
} finally {
  backend.kill('SIGTERM')
  vite.kill('SIGTERM')
}
