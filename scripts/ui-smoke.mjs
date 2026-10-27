import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const port = 4174
const baseUrl = `http://127.0.0.1:${port}`
const server = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], { stdio: 'ignore', shell: process.platform === 'win32' })

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error('Vite did not start in time')
}

try {
  await waitForServer()
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  await page.goto(baseUrl)
  await page.getByRole('heading', { name: 'Search console' }).waitFor()
  if (!(await page.locator('.source-badge').textContent()).match(/LIVE|STALE|OFFLINE|SIMULATION/)) throw new Error('Source state is not visible')
  if (!(await page.getByText('UNKNOWN', { exact: true }).count())) throw new Error('Unknown inference state is not visible')

  for (const view of ['Spatial view', 'Sensor fleet', 'Recordings', 'Configuration', 'Field guide']) {
    await page.getByRole('button', { name: view, exact: true }).click()
    await page.getByRole('heading', { name: view, exact: true }).waitFor()
  }

  await page.getByRole('button', { name: 'Live overview', exact: true }).click()
  await page.getByRole('button', { name: 'Load labeled simulation', exact: true }).click()
  await page.getByText('SIMULATION', { exact: true }).first().waitFor()
  await page.getByText('POSSIBLE', { exact: true }).waitFor()
  await page.screenshot({ path: '.opencode/omnirush/resq-simulation.png', fullPage: true })
  await browser.close()
  console.log('UI smoke passed: overview, all pages, and labeled simulation')
} finally {
  server.kill()
}
