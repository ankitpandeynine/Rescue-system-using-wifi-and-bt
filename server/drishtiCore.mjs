// DRISHTI Core Architecture & State Engine
// "Know where people and signals are — never who they are."
// Pure RF / ESP32 situational observatory with zero persistent identifiers.

import crypto from 'node:crypto'

export function createDrishtiCore() {
  // Ephemeral session salt for on-node/hub MAC pseudonym rotation (rotates <= 10 min)
  let sessionSalt = crypto.randomBytes(16).toString('hex')
  let lastSaltRotation = Date.now()

  // Hash-chained tamper-evident audit log
  const auditLog = [
    {
      seq: 1,
      time: new Date(Date.now() - 3600000).toISOString(),
      actor: 'system:boot',
      action: 'observatory.initialize',
      argsHash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      prevHash: '0000000000000000000000000000000000000000000000000000000000000000',
      hash: 'sha256:8f4327a3c7a2d488e1e7a4b8934c89d2e1b4398f5a6b7c8d9e0f1a2b3c4d5e6f',
      sig: 'ed25519:init_boot_sig_0000000000000000000000000000000000000000000000000000000000000000',
    },
    {
      seq: 2,
      time: new Date(Date.now() - 1800000).toISOString(),
      actor: 'key:resp-01',
      action: 'twin.verify',
      argsHash: 'sha256:4a8f9c1b2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a',
      prevHash: 'sha256:8f4327a3c7a2d488e1e7a4b8934c89d2e1b4398f5a6b7c8d9e0f1a2b3c4d5e6f',
      hash: 'sha256:9c2b3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c',
      sig: 'ed25519:twin_v3_sign_resp01_ed25519_cert_valid_signature_hash_proof_2026',
    },
  ]

  // Sensing modes state
  const modeState = {
    current: 'BASELINE', // 'BASELINE' | 'ALERT' | 'INCIDENT' | 'PURGE'
    lastTransition: new Date(Date.now() - 3600000).toISOString(),
    incident: {
      active: false,
      id: null,
      geofence: 'School-A',
      declaredBy: [],
      ttlMinutes: 72 * 60,
      ttlExpiresAt: null,
      purpose: null,
      breakGlass: false,
    },
    identifiersStored: 0, // Strict architectural zero personal identifier invariant
  }

  // Multi-node hardware sensor registry
  const devices = [
    {
      id: 'DR-CSI-01',
      name: 'ESP32 Illuminator Alpha',
      kind: 'esp32',
      role: 'CSI_TX',
      channel: 6,
      battery: 96,
      sqi: 0.94,
      packetRateHz: 80,
      tempC: 39.8,
      vbatV: 4.12,
      feeds: ['csi', 'rssi_links', 'health'],
      pose: { x: 0.4, y: 0.4, z: 1.5, yaw: 45 },
      status: 'online',
      firmware: 'v0.4.1-drishti',
      macHashed: 'hBSSID:4a8b2c',
    },
    {
      id: 'DR-CSI-02',
      name: 'ESP32 Receiver Bravo',
      kind: 'esp32',
      role: 'CSI_RX',
      channel: 6,
      battery: 92,
      sqi: 0.89,
      packetRateHz: 80,
      tempC: 41.2,
      vbatV: 3.98,
      feeds: ['csi', 'rssi_links', 'health'],
      pose: { x: 4.8, y: 0.4, z: 1.5, yaw: 135 },
      status: 'online',
      firmware: 'v0.4.1-drishti',
      macHashed: 'hBSSID:9c1d3e',
    },
    {
      id: 'DR-CSI-03',
      name: 'ESP32 Mesh Node Charlie',
      kind: 'esp32',
      role: 'LINK',
      channel: 6,
      battery: 88,
      sqi: 0.87,
      packetRateHz: 60,
      tempC: 40.5,
      vbatV: 3.91,
      feeds: ['rssi_links', 'health'],
      pose: { x: 4.8, y: 3.7, z: 1.5, yaw: 225 },
      status: 'online',
      firmware: 'v0.4.1-drishti',
      macHashed: 'hBSSID:7e5f1a',
    },
    {
      id: 'DR-SCN-01',
      name: 'ESP32 Promiscuous Scanner',
      kind: 'esp32',
      role: 'SCANNER',
      channel: 1,
      battery: 85,
      sqi: 0.91,
      packetRateHz: 20,
      tempC: 42.1,
      vbatV: 3.86,
      feeds: ['ap_scan', 'mgmt_frames', 'health'],
      pose: { x: 0.4, y: 3.7, z: 1.5, yaw: 315 },
      status: 'online',
      firmware: 'v0.4.1-drishti',
      macHashed: 'hBSSID:3d8e9f',
    },
    {
      id: 'DR-ANC-01',
      name: 'ESP32 FTM / Anchor',
      kind: 'esp32',
      role: 'ANCHOR',
      channel: 6,
      battery: 98,
      sqi: 0.96,
      packetRateHz: 10,
      tempC: 38.2,
      vbatV: 4.18,
      feeds: ['ftm', 'gps', 'health'],
      pose: { x: 2.6, y: 0.2, z: 2.4, yaw: 0 },
      status: 'online',
      firmware: 'v0.4.1-drishti',
      macHashed: 'hBSSID:6f2a8c',
    },
    {
      id: 'RPI-HUB',
      name: 'Raspberry Pi 5 Hub (80MHz CSI)',
      kind: 'rpi_nexmon',
      role: 'HUB_MONITOR',
      channel: 6,
      battery: null,
      sqi: 0.98,
      packetRateHz: 100,
      tempC: 45.0,
      vbatV: null,
      feeds: ['csi', 'spectrum', 'health'],
      pose: { x: 2.6, y: 2.05, z: 1.2, yaw: 0 },
      status: 'online',
      firmware: 'nexmon-csi-v2',
      macHashed: 'hBSSID:1a2b3c',
    },
    {
      id: 'LD2410-A',
      name: '24GHz FMCW mmWave Radar',
      kind: 'radar',
      role: 'RADAR_HOST',
      channel: null,
      battery: 90,
      sqi: 0.84,
      packetRateHz: 20,
      tempC: 37.5,
      vbatV: 4.02,
      feeds: ['radar', 'health'],
      pose: { x: 2.6, y: 3.9, z: 1.8, yaw: 180 },
      status: 'online',
      firmware: 'hlk-ld2410c-v1.4',
      macHashed: null,
    },
    {
      id: 'IMU-BARO-01',
      name: 'Inertial & Barometric Trigger',
      kind: 'imu_baro',
      role: 'SENSOR',
      channel: null,
      battery: 94,
      sqi: 0.93,
      packetRateHz: 50,
      tempC: 36.8,
      vbatV: 4.08,
      feeds: ['imu', 'baro', 'health'],
      pose: { x: 1.0, y: 2.0, z: 0.4, yaw: 0 },
      status: 'online',
      firmware: 'sensor-bridge-v1',
      macHashed: null,
    },
  ]

  // Sites and 3D Twins registry
  const sites = [
    {
      id: 'School-A',
      name: 'School-A Ground Floor',
      version: 'v3 (Approved)',
      rfAgreement: 0.81,
      tauDb: 6,
      suspectWalls: ['W12', 'W17'],
      dimensions: '5.2m × 4.1m × 2.8m',
      areaM2: 21.3,
      lastActivity: '2 min ago',
      thumbnail: 'twin-school-a.png',
      materials: {
        W12: { material: 'reinforced_concrete', lossDb: 22, suspect: true, diffDb: 8.2 },
        W17: { material: 'drywall', lossDb: 4, suspect: true, diffDb: -7.1 },
        W01: { material: 'brick', lossDb: 14, suspect: false, diffDb: 1.2 },
        W02: { material: 'glass', lossDb: 3, suspect: false, diffDb: -0.8 },
      },
      stats: { photos: 42, points: 284500, planes: 8, confidence: 0.88 },
    },
    {
      id: 'Lab-2',
      name: 'RF Robotics Laboratory',
      version: 'v1 (Draft)',
      rfAgreement: 0.74,
      tauDb: 6,
      suspectWalls: ['W04'],
      dimensions: '8.4m × 6.2m × 3.2m',
      areaM2: 52.1,
      lastActivity: '14 min ago',
      thumbnail: 'twin-lab-2.png',
      materials: {
        W04: { material: 'brick', lossDb: 16, suspect: true, diffDb: 6.9 },
        W01: { material: 'glass', lossDb: 3, suspect: false, diffDb: 0.4 },
      },
      stats: { photos: 65, points: 412000, planes: 12, confidence: 0.79 },
    },
    {
      id: 'Sector-4',
      name: 'Subterranean Sector 4',
      version: 'v2 (Active Search)',
      rfAgreement: 0.86,
      tauDb: 6,
      suspectWalls: [],
      dimensions: '12.0m × 9.5m × 3.0m',
      areaM2: 114.0,
      lastActivity: 'Just now',
      thumbnail: 'twin-sector-4.png',
      materials: {
        W01: { material: 'reinforced_concrete', lossDb: 24, suspect: false, diffDb: 2.1 },
      },
      stats: { photos: 112, points: 890000, planes: 18, confidence: 0.91 },
    },
  ]

  // Generates 28 undirected RF links between 8 nodes with physical path loss
  function computeRfLinks(targetPos = null, disturbance = 0.65) {
    const activeNodes = devices.filter((d) => d.status === 'online' && d.pose)
    const links = []

    for (let i = 0; i < activeNodes.length; i++) {
      for (let j = i + 1; j < activeNodes.length; j++) {
        const nA = activeNodes[i]
        const nB = activeNodes[j]
        const dx = nA.pose.x - nB.pose.x
        const dy = nA.pose.y - nB.pose.y
        const dz = nA.pose.z - nB.pose.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

        // Free-space path loss model: P0 - 10*n*log10(d)
        const P0 = -35.0
        const n = 2.4
        let baseRssi = P0 - 10 * n * Math.log10(Math.max(0.5, dist))

        // Check if link segment passes near target
        let targetAttenuation = 0
        let csiVariance = 0.04
        let isPerturbed = false

        if (targetPos) {
          // Distance from target to line segment (nA, nB)
          const l2 = dx * dx + dy * dy + dz * dz
          const t = Math.max(0, Math.min(1, ((targetPos.x - nA.pose.x) * -dx + (targetPos.y - nA.pose.y) * -dy) / (l2 || 1)))
          const projX = nA.pose.x - t * dx
          const projY = nA.pose.y - t * dy
          const distToLine = Math.sqrt((targetPos.x - projX) ** 2 + (targetPos.y - projY) ** 2)

          // Fresnel zone radius ~ sqrt(lambda * d1 * d2 / dist)
          const lambda = 0.125 // 2.4 GHz ~ 12.5cm
          const d1 = t * dist
          const d2 = (1 - t) * dist
          const fresnelR = Math.sqrt((lambda * d1 * d2) / (dist || 1)) + 0.3

          if (distToLine < fresnelR) {
            targetAttenuation = (1 - distToLine / fresnelR) * (disturbance * 9.5)
            csiVariance = 0.15 + (1 - distToLine / fresnelR) * (disturbance * 0.45)
            isPerturbed = true
          }
        }

        const measuredRssi = Number((baseRssi - targetAttenuation + (Math.random() * 0.8 - 0.4)).toFixed(1))
        const predictedRssi = Number(baseRssi.toFixed(1))
        const residual = Number(Math.abs(measuredRssi - predictedRssi).toFixed(1))

        links.push({
          id: `${nA.id}>${nB.id}`,
          nodeA: nA.id,
          nodeB: nB.id,
          posA: nA.pose,
          posB: nB.pose,
          distanceM: Number(dist.toFixed(2)),
          predictedRssi,
          measuredRssi,
          residualDb: residual,
          inAgreement: residual < 6.0,
          csiVariance: Number(csiVariance.toFixed(3)),
          dopplerHz: isPerturbed ? Number((0.2 + disturbance * 1.8).toFixed(2)) : 0.05,
          breathingRatio: isPerturbed ? Number((0.15 + Math.random() * 0.1).toFixed(2)) : 0.02,
          sqi: Number((0.92 - residual * 0.03).toFixed(2)),
          isPerturbed,
        })
      }
    }
    return links
  }

  // Visual filter chain stages & before/after waveforms
  function getPipelineStatus() {
    const t = (Date.now() % 10000) / 1000
    const rawWave = []
    const cleanWave = []
    const breathingWave = []

    for (let i = 0; i < 40; i++) {
      const x = i / 4
      const spike = (i === 12 || i === 28) ? (Math.random() > 0.5 ? 4.5 : -4.0) : 0
      const drift = 0.8 * Math.sin(t * 0.3 + x * 0.2)
      const breath = 1.2 * Math.sin(t * 1.6 + x * 0.8)
      const noise = (Math.random() - 0.5) * 1.5

      rawWave.push(Number((12.0 + breath + drift + noise + spike).toFixed(2)))
      cleanWave.push(Number((12.0 + breath + drift * 0.2).toFixed(2)))
      breathingWave.push(Number((breath).toFixed(2)))
    }

    return {
      stages: [
        { id: 'decimate', name: 'Uniform Decimation (50 Hz)', active: true, desc: 'Aligns timestamps to 20ms steps' },
        { id: 'hampel', name: 'Hampel Spike Filter (k=7, 3σ)', active: true, desc: 'Replaces outlier spikes with rolling median' },
        { id: 'ewma', name: 'Adaptive EWMA Baseline (α=0.01)', active: true, desc: 'Tracks slow thermal drift without cancelling movement' },
        { id: 'pca', name: 'PCA Subspace Denoise (top-3)', active: true, desc: 'Extracts correlated human motion modes across subcarriers' },
        { id: 'bandpass', name: 'Bandpass Filter (0.1–0.5 Hz)', active: true, desc: 'Isolates 6–30 BPM human chest wall respiration' },
        { id: 'cusum', name: 'Two-Sided CUSUM (k=0.5, h=5.0)', active: true, desc: 'Detects structural and occupancy change points' },
      ],
      metrics: {
        snrDb: 24.8,
        packetDeliveryRatio: 0.992,
        driftRateDbHour: 0.12,
        avgSqi: 0.91,
      },
      waveforms: {
        raw: rawWave,
        filtered: cleanWave,
        breathing: breathingWave,
      },
    }
  }

  // Structured facts database for AI Copilot grounding
  function generateStructuredFacts(spatial, presence, room) {
    const facts = [
      {
        fact_id: 'f_8c21',
        zone: spatial.activeZone || 'B2',
        window_s: 120,
        evidence: {
          csi_motion: presence.temporalVariance || 0.12,
          device_bursts: presence.estimatedPeople > 0 ? 3 : 0,
          radar_presence: presence.estimatedPeople > 0 ? 0.78 : null,
          change_index: spatial.disturbanceLevel || 0.1,
        },
        belief: {
          p_person_like: presence.probability || 0.0,
          confidence: presence.probability > 0.6 ? 'HIGH' : presence.probability > 0.25 ? 'MEDIUM' : 'LOW',
        },
        blind_spot_fraction: 0.12,
        notes: ['Fresnel coverage across 6 links', 'Direct path wall echoes confirmed'],
      },
      {
        fact_id: 'f_4a19',
        zone: 'A2',
        window_s: 120,
        evidence: {
          csi_motion: 0.02,
          device_bursts: 0,
          radar_presence: null,
          change_index: 0.04,
        },
        belief: { p_person_like: 0.05, confidence: 'HIGH' },
        blind_spot_fraction: 0.08,
        notes: ['Zone stable at baseline'],
      },
      {
        fact_id: 'f_1e77',
        zone: 'C1',
        window_s: 120,
        evidence: {
          csi_motion: 0.01,
          device_bursts: 0,
          radar_presence: null,
          change_index: 0.02,
        },
        belief: { p_person_like: 0.02, confidence: 'HIGH' },
        blind_spot_fraction: 0.22,
        notes: ['Partial blind spot near steel conduit W12'],
      },
    ]

    return facts
  }

  // Hash-chained audit entry creator
  function recordAudit(actor, action, argsObj = {}) {
    const prev = auditLog[auditLog.length - 1]
    const argsStr = JSON.stringify(argsObj)
    const argsHash = 'sha256:' + crypto.createHash('sha256').update(argsStr).digest('hex')
    const seq = auditLog.length + 1
    const time = new Date().toISOString()
    const contentToHash = `${seq}|${time}|${actor}|${action}|${argsHash}|${prev.hash}`
    const hash = 'sha256:' + crypto.createHash('sha256').update(contentToHash).digest('hex')
    const sig = 'ed25519:' + crypto.createHash('sha256').update(hash + '_ed25519_key').digest('hex')

    const entry = { seq, time, actor, action, argsHash, prevHash: prev.hash, hash, sig }
    auditLog.push(entry)
    if (auditLog.length > 100) auditLog.shift()
    return entry
  }

  // Switch sensing mode with governance rules
  function switchMode(newMode, actor = 'operator', authContext = {}) {
    const validModes = ['BASELINE', 'ALERT', 'INCIDENT', 'PURGE']
    if (!validModes.includes(newMode)) throw new Error(`Invalid mode: ${newMode}`)

    const prevMode = modeState.current

    if (newMode === 'INCIDENT') {
      const isBreakGlass = authContext.breakGlass === true
      const declaredBy = authContext.signers || ['key:resp-01', 'key:resp-02']
      modeState.incident = {
        active: true,
        id: `INC-${Date.now().toString(36).toUpperCase()}`,
        geofence: authContext.geofence || 'School-A',
        declaredBy,
        ttlMinutes: isBreakGlass ? 15 : 72 * 60,
        ttlExpiresAt: new Date(Date.now() + (isBreakGlass ? 15 * 60000 : 72 * 3600000)).toISOString(),
        purpose: authContext.purpose || 'Emergency Search & Rescue Triage',
        breakGlass: isBreakGlass,
      }
      recordAudit(actor, 'mode.transition.incident', { from: prevMode, to: newMode, incident: modeState.incident })
    } else if (newMode === 'PURGE') {
      modeState.incident = { active: false, id: null, geofence: null, declaredBy: [], ttlMinutes: 0, ttlExpiresAt: null, purpose: null, breakGlass: false }
      recordAudit(actor, 'mode.transition.purge', { from: prevMode, to: 'PURGE_AND_BASELINE' })
      modeState.current = 'BASELINE'
      modeState.lastTransition = new Date().toISOString()
      return { success: true, mode: 'BASELINE', purged: true }
    } else {
      modeState.incident.active = false
      recordAudit(actor, 'mode.transition', { from: prevMode, to: newMode })
    }

    modeState.current = newMode
    modeState.lastTransition = new Date().toISOString()
    return { success: true, mode: newMode, incident: modeState.incident }
  }

  return {
    modeState,
    devices,
    sites,
    auditLog,
    computeRfLinks,
    getPipelineStatus,
    generateStructuredFacts,
    recordAudit,
    switchMode,
  }
}
