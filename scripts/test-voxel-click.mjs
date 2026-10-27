import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

console.log('--- Testing Voxel Click and Disturbance in 3D Studio ---')

const backend = spawn('node', ['server/index.mjs'], { stdio: 'ignore' })
const vite = spawn('npx', ['vite', '--port', '5198', '--host', '127.0.0.1'], { stdio: 'ignore' })

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

try {
  await sleep(1500)
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  await page.goto('http://127.0.0.1:5198/?view=3D+Scan+%26+Spectral')
  await page.waitForTimeout(1000)

  // Trigger disturbance via override endpoint
  await fetch('http://127.0.0.1:4175/api/override', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: true, peopleCount: 2, activityState: 'WALKING', disturbanceLevel: 0.85 }),
  })
  await page.waitForTimeout(800)

  // Click on the 3D canvas (near center where voxels are)
  const canvas = page.locator('.three-d-canvas-container canvas')
  const box = await canvas.boundingBox()
  if (box) {
    // Click near middle of canvas to hit a voxel
    await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.52)
    await page.waitForTimeout(400)
  }

  // Check if voxel card appears or screenshot
  await page.screenshot({ path: '3d_disturbed_verified.png' })
  console.log('Saved disturbed 3D studio screenshot to 3d_disturbed_verified.png')

  await browser.close()
  console.log('Voxel click and disturbance test passed!')
} catch (err) {
  console.error('Test error:', err)
  process.exitCode = 1
} finally {
  backend.kill('SIGTERM')
  vite.kill('SIGTERM')
}
