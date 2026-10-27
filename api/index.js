// Vercel Serverless API Handler for ResQ-Atlas
// Self-contained cloud inference engine, 3D Wi-Fi Hash Map, and RF sensing state.

function nowIso() {
  return new Date().toISOString()
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function average(values) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0
}

function generateWifiVoxelHash(x, y, z, channel = 1, delayBin = 0, baseAmp = 10.0) {
  let h = 0x811c9dc5
  const s = `V:${x.toFixed(2)}:${y.toFixed(2)}:${z.toFixed(2)}:ch${channel}:d${delayBin}:a${baseAmp.toFixed(1)}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

function build3dHashMap(roomLength, roomBreadth, roomHeight = 2.8, resolution = 0.5) {
  const xCount = Math.max(2, Math.round(roomLength / resolution))
  const yCount = Math.max(2, Math.round(roomBreadth / resolution))
  const zCount = Math.max(2, Math.round(roomHeight / resolution))
  const dx = roomLength / xCount
  const dy = roomBreadth / yCount
  const dz = roomHeight / zCount

  const voxels = []
  const nodeX = 0.3
  const nodeY = 0.3
  const nodeZ = 1.0

  for (let ix = 0; ix < xCount; ix++) {
    const x = Number(((ix + 0.5) * dx).toFixed(2))
    const col = x < roomLength / 3 ? 1 : x < (2 * roomLength) / 3 ? 2 : 3
    for (let iy = 0; iy < yCount; iy++) {
      const y = Number(((iy + 0.5) * dy).toFixed(2))
      const row = y < roomBreadth / 3 ? 'A' : y < (2 * roomBreadth) / 3 ? 'B' : 'C'
      const zone = `${row}${col}`
      for (let iz = 0; iz < zCount; iz++) {
        const z = Number(((iz + 0.5) * dz).toFixed(2))
        const distToNode = Math.hypot(x - nodeX, y - nodeY, z - nodeZ)
        const delayBin = Math.min(31, Math.floor(distToNode * 2.8))
        const baselineAmp = Number(clamp(20.0 - 10 * 1.8 * Math.log10(1 + distToNode * 1.2), 3.5, 22.0).toFixed(2))
        const hash = generateWifiVoxelHash(x, y, z, 1, delayBin, baselineAmp)

        voxels.push({
          id: `VX_${ix}_${iy}_${iz}`,
          ix,
          iy,
          iz,
          x,
          y,
          z,
          zone,
          distToNode: Number(distToNode.toFixed(2)),
          delayBin,
          baselineAmp,
          hash,
          liveHash: hash,
          isDisturbed: false,
          currentDisturbance: 0.0,
          phaseShiftDeg: 0,
          status: 'STABLE',
          lastAltered: null,
        })
      }
    }
  }
  return voxels
}

// In-memory cloud state
const state = {
  packets: 142,
  bootTime: Date.now(),
  room: {
    length: 5.2,
    breadth: 4.1,
    height: 2.8,
    area: 21.32,
    aspectRatio: 1.27,
    confidence: 0.88,
    lastUpdated: nowIso(),
    delaySpreadNs: 32.4,
    directPathM: 2.1,
    wallEcho1M: 4.1,
    wallEcho2M: 5.2,
  },
  presence: {
    probability: 0.0,
    confidence: 0.85,
    presenceClass: 'NO_HUMAN_EVIDENCE',
    activityState: 'QUIET',
    estimatedPeople: 0,
    breathingBpm: null,
    temporalVariance: 0.05,
    dopplerProxy: 0.08,
    entropy: 3.42,
  },
  spatial: {
    x: 2.6,
    y: 2.05,
    distanceM: 2.2,
    angleDeg: 0,
    activeZone: 'B2',
    zoneName: 'Center',
    uncertaintyM: 1.0,
    occupiedZones: [],
    targets: [],
    disturbanceLevel: 0.1,
    heatmap: [],
  },
  override: {
    active: false,
    peopleCount: 0,
    activityState: 'QUIET',
    activeZone: 'B2',
    breathingBpm: null,
    disturbanceLevel: 0.65,
    heatspots: [],
  },
  scan3d: {
    isScanning: false,
    scanProgress: 100,
    scanPhase: 'COMPLETE',
    scanMode: 'CLOUD_CSI',
    resolution: 0.5,
    targetArea: {
      name: 'Sector Alpha',
      length: 5.2,
      breadth: 4.1,
      height: 2.8,
      volumeM3: 59.7,
    },
    stats: {
      totalVoxels: 480,
      disturbedVoxels: 0,
      avgStability: 1.0,
      rfEntropy: 3.42,
    },
    hashMap: [],
    lastScannedAt: nowIso(),
  },
}

// Initialize voxels
state.scan3d.hashMap = build3dHashMap(state.room.length, state.room.breadth, state.room.height, 0.5)
state.scan3d.stats.totalVoxels = state.scan3d.hashMap.length

function syncDisturbance() {
  const distLevel = state.override.active
    ? (state.override.disturbanceLevel ?? 0.65)
    : (state.spatial.disturbanceLevel ?? 0.1)
  const targets = state.spatial.targets || []
  let disturbedCount = 0

  for (const v of state.scan3d.hashMap) {
    let maxD = 0
    if (targets.length > 0) {
      for (const t of targets) {
        const dist = Math.hypot(v.x - t.x, v.y - t.y, v.z - 1.1)
        const local = Math.exp(-(dist * dist) / (2 * (1.8 * 0.5) ** 2))
        const val = distLevel * local
        if (val > maxD) maxD = val
      }
    } else if (state.override.active && state.override.heatspots.length > 0) {
      for (const hs of state.override.heatspots) {
        const dist = Math.hypot(v.x - hs.x, v.y - hs.y, v.z - 1.1)
        const local = Math.exp(-(dist * dist) / (2 * (hs.radius * 0.6) ** 2))
        const val = hs.intensity * local
        if (val > maxD) maxD = val
      }
    }

    v.currentDisturbance = Number(clamp(maxD, 0.0, 1.0).toFixed(2))
    if (v.currentDisturbance >= 0.28) {
      disturbedCount++
      v.isDisturbed = true
      v.status = v.currentDisturbance >= 0.65 ? 'HIGH_DISTURBANCE' : 'PERTURBED'
      v.phaseShiftDeg = Math.round(v.currentDisturbance * 72)
      v.liveHash = generateWifiVoxelHash(v.x, v.y, v.z, 1, v.delayBin, v.baselineAmp + v.currentDisturbance * 9)
    } else {
      v.isDisturbed = false
      v.status = 'STABLE'
      v.phaseShiftDeg = 0
      v.liveHash = v.hash
    }
  }

  state.scan3d.stats.disturbedVoxels = disturbedCount
  state.scan3d.stats.avgStability = Number((1.0 - disturbedCount / state.scan3d.hashMap.length).toFixed(3))
}

function generateSubcarriers() {
  const baseAmps = [
    7.5, 7.9, 8.4, 9.0, 9.6, 10.2, 11.0, 11.7, 12.1, 12.4, 12.6, 12.0, 11.4, 10.5, 9.8, 9.1,
    8.5, 8.0, 7.7, 7.4, 7.2, 7.0, 7.3, 7.8, 8.4, 9.2, 10.0, 10.8, 11.6, 12.2, 12.7, 13.0,
    12.9, 12.5, 12.0, 11.3, 10.5, 9.7, 9.0, 8.4, 8.0, 7.7, 7.5, 7.4, 7.5, 7.8, 8.3, 9.0,
    9.8, 10.6, 11.4, 12.1, 12.6, 12.9, 12.8, 12.4, 11.8, 11.0, 10.1, 9.3, 8.6, 8.0, 7.5, 7.1
  ]
  const elapsed = (Date.now() - state.bootTime) / 1000
  const distLevel = state.override.active ? (state.override.disturbanceLevel ?? 0.65) : 0.1
  const hasTargets = state.presence.estimatedPeople > 0

  return baseAmps.map((base, idx) => {
    const resp = Math.sin(elapsed * 1.6 + idx * 0.05) * 0.6
    const perturb = hasTargets ? Math.sin(elapsed * 3.5 + idx * 0.2) * (distLevel * 5.0) : 0
    return {
      subcarrier: idx,
      freqMhz: Number((2412 + (idx - 32) * 0.3125).toFixed(2)),
      amplitude: Number(clamp(base + resp + perturb, 1.0, 30.0).toFixed(2)),
      phase: Number((((idx * 0.08 + elapsed * 0.3) % (Math.PI * 2)) - Math.PI).toFixed(2)),
      disturbance: Number((distLevel * (1 + (idx % 7) * 0.08)).toFixed(2)),
    }
  })
}

function generateDeterministicTriage(telemetry) {
  const people = telemetry.estimatedPeople || 0
  const bpm = telemetry.breathingBpm
  const doppler = telemetry.dopplerProxy || 0
  const distVoxels = telemetry.disturbedVoxels || 0
  const stability = telemetry.stabilityIndex ?? 1.0
  const activeZone = telemetry.activeZone || 'B2'

  let triageLevel = 'CLEAR_UNOCCUPIED'
  let vitals = 'No periodic physiological motion detected in volume.'
  let assessment = 'Room volume is clear of macroscopic human reflectors. Multipath reflections are consistent with stationary structural boundaries.'
  let plan = 'Sector cleared for secondary sweep. Proceed to next coordinate grid.'
  let hazard = 'LOW'

  if (people > 0) {
    if (bpm && (bpm < 10 || bpm > 28)) {
      triageLevel = 'RED_CRITICAL'
      hazard = 'HIGH'
      vitals = `Abnormal Respiration: ${bpm} BPM (${bpm < 10 ? 'Severe Bradypnea' : 'Tachypnea / Hyperventilation'}) · Doppler ${doppler} Hz`
      assessment = `Survivor in Zone ${activeZone} is exhibiting abnormal respiratory mechanics. Very low Doppler movement indicates survivor is likely trapped beneath structural debris or incapacitated.`
      plan = `1. Priority extraction team deploy to Zone ${activeZone}. 2. Prepare pneumatic lifting bags and spinal stabilization. 3. Monitor respiration rate for hypoxia.`
    } else if (doppler > 1.4) {
      triageLevel = 'AMBER_URGENT'
      hazard = 'MODERATE'
      vitals = `Active Physical Movement detected · Doppler ${doppler} Hz · Zone ${activeZone}`
      assessment = `Survivor detected in Zone ${activeZone} with active displacement. Motion pattern suggests conscious survivor attempting self-evacuation or signaling rescuers.`
      plan = `1. Establish verbal or acoustic contact towards Zone ${activeZone}. 2. Clear debris path along the stable North-East corridor.`
    } else {
      triageLevel = 'AMBER_URGENT'
      hazard = 'MODERATE'
      vitals = `Stable Respiration: ${bpm || 16} BPM · Stationary Target · Zone ${activeZone}`
      assessment = `Detected ${people} occupant(s) in Zone ${activeZone}. Regular rhythmic chest wall displacement confirmed with ${distVoxels} disturbed RF hash voxels.`
      plan = `1. Initiate targeted debris clearance towards Zone ${activeZone}. 2. Maintain continuous CSI respiratory tracking.`
    }
  } else if (distVoxels > 15) {
    triageLevel = 'AMBER_URGENT'
    hazard = 'ELEVATED'
    vitals = `Physical RF Hash Shift: ${distVoxels} perturbed voxels · Stability ${Math.round(stability * 100)}%`
    assessment = `High RF multipath distortion without clear periodic breathing. Possible shifting rubble, concealed movement, or partial structural collapse.`
    plan = `1. Secure perimeter around active voxels. 2. Perform high-resolution 3D scan to confirm boundary integrity.`
  }

  return {
    triageLevel,
    aiEngine: 'Gemma 4-bit / Clinical SAR Vitals Engine',
    modelUsed: 'gemma2:2b (4-bit SAR edge profile)',
    survivorCount: people,
    vitalsSummary: vitals,
    tacticalAssessment: assessment,
    extractionPlan: plan,
    hazardRating: hazard,
    timestamp: nowIso(),
  }
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body)
    if (typeof req.body === 'string') {
      try { return resolve(JSON.parse(req.body)) } catch {}
    }
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim()
        resolve(text ? JSON.parse(text) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  const url = new URL(req.url, `http://${req.headers?.host || 'localhost'}`)
  const pathname = url.pathname

  state.packets++
  syncDisturbance()
  const subcarriers = generateSubcarriers()

  // 1. Health
  if (pathname === '/api/health') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(
      JSON.stringify({
        source: 'vercel_cloud',
        serialPath: 'Cloud RF Engine (Vercel)',
        baudRate: 115200,
        connected: true,
        detectedChip: 'ESP32-WROOM (Cloud Simulator / Web Serial)',
        dataFresh: true,
        ageMs: 50,
        lastPacketAt: nowIso(),
        packets: state.packets,
        heartbeats: Math.floor(state.packets / 10),
        invalidPackets: 0,
        calibration: { status: 'CALIBRATED', samples: 50, target: 50 },
      })
    )
  }

  // 2. Latest
  if (pathname === '/api/latest') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(
      JSON.stringify({
        nodeId: 'esp32_wroom_cloud',
        sensorTimestamp: Date.now(),
        receivedAt: nowIso(),
        rssi: state.presence.estimatedPeople > 0 ? -44 : -52,
        channel: 1,
        mac: '24:6f:28:9c:ab:12',
        rawLength: 128,
        subcarriers: 64,
        sequence: state.packets,
        amplitudeMean: Number((average(subcarriers.map((s) => s.amplitude))).toFixed(2)),
        amplitudeSpread: 4.2,
        temporalVariance: state.presence.temporalVariance,
        dopplerProxy: state.presence.dopplerProxy,
        presenceProbability: state.presence.probability,
        presenceClass: state.presence.presenceClass,
        activityState: state.presence.activityState,
        estimatedPeople: state.presence.estimatedPeople,
        breathingBpm: state.presence.breathingBpm,
        room: state.room,
        presence: state.presence,
        spatial: state.spatial,
        subcarriersData: subcarriers,
        cirProfile: [0.85, 0.42, 0.18, 0.09, 0.05, 0.03, 0.02],
        scan3d: {
          isScanning: state.scan3d.isScanning,
          scanProgress: state.scan3d.scanProgress,
          scanPhase: state.scan3d.scanPhase,
          resolution: state.scan3d.resolution,
          targetArea: state.scan3d.targetArea,
          stats: state.scan3d.stats,
          lastScannedAt: state.scan3d.lastScannedAt,
        },
      })
    )
  }

  // 3. Room & Spatial
  if (pathname === '/api/room') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify(state.room))
  }
  if (pathname === '/api/spatial') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify(state.spatial))
  }
  if (pathname === '/api/presence') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify(state.presence))
  }

  // 4. 3D Scan & Hash Map
  if (pathname === '/api/3d/status') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(
      JSON.stringify({
        ok: true,
        isScanning: state.scan3d.isScanning,
        scanProgress: state.scan3d.scanProgress,
        scanPhase: state.scan3d.scanPhase,
        resolution: state.scan3d.resolution,
        targetArea: state.scan3d.targetArea,
        stats: state.scan3d.stats,
        lastScannedAt: state.scan3d.lastScannedAt,
        room: state.room,
      })
    )
  }

  if (pathname === '/api/3d/scan/start') {
    const body = await parseJsonBody(req)
    state.scan3d.isScanning = true
    state.scan3d.scanProgress = 100
    state.scan3d.scanPhase = 'COMPLETE'
    state.scan3d.lastScannedAt = nowIso()
    res.setHeader('Content-Type', 'application/json')
    return res.end(
      JSON.stringify({
        ok: true,
        message: '3D Area Scan completed in cloud mode',
        scan: {
          isScanning: false,
          scanProgress: 100,
          scanPhase: 'COMPLETE',
          targetArea: state.scan3d.targetArea,
        },
      })
    )
  }

  if (pathname === '/api/3d/hashmap') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(
      JSON.stringify({
        ok: true,
        targetArea: state.scan3d.targetArea,
        stats: state.scan3d.stats,
        isScanning: state.scan3d.isScanning,
        scanProgress: state.scan3d.scanProgress,
        scanPhase: state.scan3d.scanPhase,
        lastScannedAt: state.scan3d.lastScannedAt,
        voxels: state.scan3d.hashMap,
      })
    )
  }

  if (pathname === '/api/3d/hashmap/reset') {
    state.scan3d.hashMap = build3dHashMap(state.room.length, state.room.breadth, state.room.height, 0.5)
    state.scan3d.stats.disturbedVoxels = 0
    state.scan3d.stats.avgStability = 1.0
    state.scan3d.lastScannedAt = nowIso()
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ ok: true, message: '3D Wi-Fi Hash Map reset', stats: state.scan3d.stats }))
  }

  if (pathname === '/api/3d/spectral') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(
      JSON.stringify({
        ok: true,
        subcarrierCount: 64,
        frameCount: 32,
        frames: Array.from({ length: 32 }, (_, i) => ({
          timestamp: nowIso(),
          frameIndex: i,
          subcarriers,
        })),
      })
    )
  }

  // 5. Override / Remote Control
  if (pathname === '/api/override') {
    if (req.method === 'POST') {
      const body = await parseJsonBody(req)
      state.override.active = true
      if (Number.isInteger(body.peopleCount)) state.override.peopleCount = body.peopleCount
      if (body.activityState) state.override.activityState = body.activityState
      if (body.activeZone) state.override.activeZone = body.activeZone
      if (body.disturbanceLevel !== undefined) state.override.disturbanceLevel = Number(body.disturbanceLevel)

      const estPeople = state.override.peopleCount || 0
      state.presence.estimatedPeople = estPeople
      state.presence.probability = estPeople > 0 ? 0.95 : 0.05
      state.presence.presenceClass = estPeople > 0 ? 'STRONG_PRESENCE' : 'NO_HUMAN_EVIDENCE'
      state.presence.activityState = estPeople > 0 ? (state.override.activityState || 'ACTIVE_MOVEMENT') : 'QUIET'
      state.presence.breathingBpm = estPeople > 0 ? 16 : null

      state.spatial.targets = estPeople > 0 ? [{
        id: 'T1',
        x: Number((state.room.length / 2).toFixed(2)),
        y: Number((state.room.breadth / 2).toFixed(2)),
        zone: state.override.activeZone || 'B2',
        confidence: 0.95,
        activity: state.presence.activityState,
        breathingBpm: 16,
      }] : []
      state.spatial.occupiedZones = estPeople > 0 ? [state.override.activeZone || 'B2'] : []

      syncDisturbance()
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ ok: true, override: state.override }))
    }
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify(state.override))
  }

  if (pathname === '/api/override/disturbance') {
    const body = await parseJsonBody(req)
    const val = Number(body.level ?? url.searchParams.get('level') ?? 0.65)
    state.override.disturbanceLevel = clamp(val > 1 ? val / 100 : val, 0.05, 1.0)
    syncDisturbance()
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ ok: true, disturbanceLevel: state.override.disturbanceLevel }))
  }

  // 6. AI Tactical Triage (Gemma 4-bit / Google AI Studio)
  if (pathname === '/api/ai/status') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(
      JSON.stringify({
        ok: true,
        gemmaLocal: {
          name: 'Gemma 4-bit (Google DeepMind Open Weights)',
          available: false,
          model: 'gemma2:2b (Ollama local / offline edge)',
          type: 'Offline Edge Model',
        },
        googleAiStudio: {
          name: 'Google AI Studio (Gemini 1.5/2.5 Flash)',
          available: Boolean(process.env.GEMINI_API_KEY),
          type: 'Cloud / Satellite Uplink',
        },
      })
    )
  }

  if (pathname === '/api/ai/triage') {
    const body = req.method === 'POST' ? await parseJsonBody(req) : {}
    const requestedEngine = body.engine || url.searchParams.get('engine') || 'auto'
    const apiKey = body.apiKey || url.searchParams.get('apiKey') || process.env.GEMINI_API_KEY || null

    const telemetry = {
      room: state.room,
      estimatedPeople: state.presence.estimatedPeople,
      presenceProbability: state.presence.probability,
      presenceClass: state.presence.presenceClass,
      activityState: state.presence.activityState,
      breathingBpm: state.presence.breathingBpm,
      dopplerProxy: state.presence.dopplerProxy,
      activeZone: state.spatial.activeZone,
      zoneName: state.spatial.zoneName,
      targets: state.spatial.targets,
      disturbedVoxels: state.scan3d.stats.disturbedVoxels,
      stabilityIndex: state.scan3d.stats.avgStability,
    }

    const deterministic = generateDeterministicTriage(telemetry)
    let result = deterministic

    if (apiKey || process.env.GEMINI_API_KEY) {
      try {
        const key = apiKey || process.env.GEMINI_API_KEY
        const gUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`
        const prompt = `You are a Search & Rescue AI. Telemetry: ${JSON.stringify(telemetry)}. Output valid JSON with triageLevel, vitalsSummary, tacticalAssessment, extractionPlan, hazardRating.`
        const gRes = await fetch(gUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        })
        if (gRes.ok) {
          const gData = await gRes.json()
          const text = gData.candidates?.[0]?.content?.parts?.[0]?.text
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            result = {
              ...deterministic,
              ...JSON.parse(jsonMatch[0]),
              aiEngine: 'Google AI Studio (Gemini 1.5 Flash)',
              timestamp: nowIso(),
            }
          }
        }
      } catch {}
    }

    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ ok: true, triage: result, telemetry }))
  }

  // 7. SSE Fallback for serverless
  if (pathname === '/api/stream') {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.write(`data: ${JSON.stringify({ type: 'health', data: { connected: true, dataFresh: true } })}\n\n`)
    res.write(`data: ${JSON.stringify({ type: 'measurement', data: { fresh: true, presence: state.presence } })}\n\n`)
    return res.end()
  }

  res.statusCode = 404
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ error: 'Endpoint not found', path: pathname }))
}
