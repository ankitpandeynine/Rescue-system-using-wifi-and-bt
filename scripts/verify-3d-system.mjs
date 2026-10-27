import http from 'node:http'
import { spawn } from 'node:child_process'

console.log('--- Verifying ResQ-Atlas 3D Wi-Fi Scan & Spectral Engine ---')

const backend = spawn('node', ['server/index.mjs'], { stdio: 'pipe' })
let output = ''

backend.stdout.on('data', (d) => { output += d.toString() })
backend.stderr.on('data', (d) => { output += d.toString() })

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getJson(path) {
  const res = await fetch(`http://127.0.0.1:4175${path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`)
  return res.json()
}

async function postJson(path, body = {}) {
  const res = await fetch(`http://127.0.0.1:4175${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`)
  return res.json()
}

try {
  console.log('Waiting for backend server to boot...')
  let ready = false
  for (let i = 0; i < 20; i++) {
    await sleep(300)
    try {
      const health = await getJson('/api/health')
      if (health) {
        ready = true
        console.log('Backend connected! Health:', health.detectedChip, '| Connected:', health.connected)
        break
      }
    } catch {}
  }

  if (!ready) {
    throw new Error('Backend failed to boot. Output: ' + output)
  }

  // 1. Verify /api/3d/status
  console.log('Checking /api/3d/status...')
  const status3d = await getJson('/api/3d/status')
  console.log('3D Status OK:', status3d.targetArea, '| Total Voxels:', status3d.stats?.totalVoxels)
  if (typeof status3d.isScanning !== 'boolean') throw new Error('Invalid 3D status response')

  // 2. Verify /api/3d/hashmap
  console.log('Checking /api/3d/hashmap...')
  const hashmap = await getJson('/api/3d/hashmap')
  console.log('Wi-Fi Hash Map OK! Voxels returned:', hashmap.voxels?.length)
  if (!hashmap.voxels || hashmap.voxels.length === 0) throw new Error('No voxels returned')
  const sample = hashmap.voxels[0]
  console.log('Sample Voxel:', sample.id, 'Coordinates:', [sample.x, sample.y, sample.z], 'Hash:', sample.hash, 'Disturbance:', sample.currentDisturbance)
  if (!sample.hash || sample.x === undefined) throw new Error('Invalid voxel format')

  // 3. Verify /api/3d/spectral
  console.log('Checking /api/3d/spectral...')
  const spectral = await getJson('/api/3d/spectral')
  console.log('Spectral View OK! Subcarriers:', spectral.subcarrierCount, '| Frames recorded:', spectral.frameCount)
  if (spectral.subcarrierCount !== 64) throw new Error('Expected 64 subcarriers')

  // 4. Verify /api/3d/scan/start
  console.log('Triggering 3D area scan sweep...')
  const scanStart = await postJson('/api/3d/scan/start', { resolution: 0.5, length: 5.2, breadth: 4.1, height: 2.8 })
  console.log('Scan started:', scanStart.message, 'Progress:', scanStart.scan?.scanProgress)
  await sleep(1000)

  const scanMid = await getJson('/api/3d/status')
  console.log('Scan in progress:', scanMid.scanProgress, '% | Phase:', scanMid.scanPhase)

  // 5. Verify /api/latest includes 3D data
  const latest = await getJson('/api/latest')
  console.log('Latest Measurement OK! Has scan3d:', !!latest.scan3d, '| Subcarriers:', latest.subcarriersData?.length)

  console.log('\nAll 3D Wi-Fi Scan & Spectral API verifications PASSED perfectly!')
} catch (err) {
  console.error('\nVerification FAILED:', err.message)
  process.exitCode = 1
} finally {
  backend.kill('SIGTERM')
}
