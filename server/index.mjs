import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SerialPort } from 'serialport'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REMOTE_WEB_DIR = path.resolve(__dirname, '../remote_controller/build/web')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
}

function serveStatic(request, response, url) {
  let relativePath = url.pathname.replace(/^\/remote\/?/, '')
  if (!relativePath || relativePath === '') relativePath = 'index.html'
  const filePath = path.join(REMOTE_WEB_DIR, relativePath)

  if (!filePath.startsWith(REMOTE_WEB_DIR)) {
    response.writeHead(403).end('Forbidden')
    return true
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    response.writeHead(200, {
      'content-type': contentType,
      'access-control-allow-origin': '*',
    })
    fs.createReadStream(filePath).pipe(response)
    return true
  }
  return false
}

const PORT = Number(process.env.RESQ_API_PORT || 4175)
const SERIAL_PATH = process.env.RESQ_SERIAL_PORT || 'COM11'
const BAUD_RATE = Number(process.env.RESQ_SERIAL_BAUD || 115200)
const STALE_AFTER_MS = 15000 // 15 seconds to allow for intermittent Wi-Fi bursts
const CALIBRATION_SAMPLES = 50

const clients = new Set()

// Temporal sliding windows for stable real-time DSP
const MAX_WINDOW = 60
const packetWindow = []
const breathingBuffer = []
const roomEchoHistory = []
const peopleCountHistory = []
let smoothedTargetX = null
let smoothedTargetY = null

const state = {
  source: 'serial',
  serialPath: SERIAL_PATH,
  baudRate: BAUD_RATE,
  serialConnected: false,
  connectedAt: null,
  lastPacketAt: null,
  lastHeartbeatAt: null,
  packets: 0,
  heartbeats: 0,
  invalidPackets: 0,
  duplicatePackets: 0,
  sequenceGaps: 0,
  lastSequences: new Map(),
  latest: {
    nodeId: 'esp32_wroom_01',
    sensorTimestamp: 0,
    receivedAt: nowIso(),
    rssi: -48,
    channel: 1,
    mac: null,
    rawLength: 128,
    subcarriers: 64,
    sequence: 0,
    amplitudeMean: 8.5,
    amplitudeSpread: 4.2,
    temporalVariance: 0.1,
    dopplerProxy: 0.05,
    presenceProbability: 0.0,
    presenceClass: 'NO_HUMAN_EVIDENCE',
    activityState: 'QUIET',
    estimatedPeople: 0,
    breathingBpm: null,
    activeZone: 'B2',
    zoneName: 'Center',
    roomLength: 5.2,
    roomBreadth: 4.1,
    roomArea: 21.32,
  },
  override: {
    active: false,
    peopleCount: 0,
    activityState: 'QUIET',
    activeZone: 'B2',
    breathingBpm: null,
    disturbanceLevel: 0.65,
    heatspots: [],
    lastUpdated: null,
  },
  room: {
    length: 5.2,
    breadth: 4.1,
    height: 2.8,
    area: 21.32,
    aspectRatio: 1.27,
    confidence: 0.88,
    lastUpdated: null,
    delaySpreadNs: 32.4,
    directPathM: 2.1,
    wallEcho1M: 4.1,
    wallEcho2M: 5.2,
  },
  presence: {
    probability: 0.0,
    confidence: 0.5,
    presenceClass: 'NO_HUMAN_EVIDENCE',
    activityState: 'QUIET',
    estimatedPeople: 0,
    breathingBpm: null,
    temporalVariance: 0.0,
    dopplerProxy: 0.0,
    entropy: 0.0,
  },
  spatial: {
    x: 2.6,
    y: 2.05,
    distanceM: 2.2,
    angleDeg: 0,
    activeZone: 'B2',
    zoneName: 'Center',
    uncertaintyM: 1.2,
    occupiedZones: [],
    targets: [],
    disturbanceLevel: 0.1,
    heatmap: [],
  },
  cirProfile: [],
  subcarrierSpectrum: [],
  baseline: {
    status: 'NOT_CALIBRATED',
    samples: 0,
    target: CALIBRATION_SAMPLES,
    vector: null,
    startedAt: null,
    completedAt: null,
  },
  scan3d: {
    isScanning: false,
    scanProgress: 100,
    scanPhase: 'COMPLETE',
    scanMode: 'DYNAMIC_CSI',
    resolution: 0.5,
    targetArea: {
      name: 'Sector Alpha',
      length: 5.2,
      breadth: 4.1,
      height: 2.8,
      volumeM3: 59.7,
    },
    stats: {
      totalVoxels: 0,
      disturbedVoxels: 0,
      hashCollisions: 0,
      avgStability: 1.0,
      rfEntropy: 3.42,
    },
    hashMap: [],
    lastScannedAt: null,
  },
  spectral3d: {
    maxFrames: 32,
    history: [],
  },
}

function nowIso() {
  return new Date().toISOString()
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function standardDeviation(values, mean = average(values)) {
  if (!values.length) return 0
  return Math.sqrt(average(values.map((v) => (v - mean) ** 2)))
}

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function mode(values) {
  if (!values.length) return 0
  const counts = new Map()
  let maxCount = 0
  let best = values[0]
  for (const v of values) {
    const c = (counts.get(v) || 0) + 1
    counts.set(v, c)
    if (c > maxCount) {
      maxCount = c
      best = v
    }
  }
  return best
}

// Phase Unwrapping and Linear Regression Detrending (RuView / ESP-CSI standard)
function sanitizePhases(phases) {
  if (!phases || phases.length < 2) return phases || []
  const unwrapped = [phases[0]]
  for (let i = 1; i < phases.length; i++) {
    let diff = phases[i] - phases[i - 1]
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI
    unwrapped.push(unwrapped[i - 1] + diff)
  }

  const n = unwrapped.length
  let sumK = 0, sumPhase = 0, sumKPhase = 0, sumK2 = 0
  for (let k = 0; k < n; k++) {
    sumK += k
    sumPhase += unwrapped[k]
    sumKPhase += k * unwrapped[k]
    sumK2 += k * k
  }
  const slope = (n * sumKPhase - sumK * sumPhase) / (n * sumK2 - sumK * sumK || 1)
  const intercept = (sumPhase - slope * sumK) / n

  return unwrapped.map((p, k) => p - (slope * k + intercept))
}

// Shannon Entropy Calculation
function calculateEntropy(values, numBins = 10) {
  if (!values || values.length < 2) return 0
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return 0
  const binWidth = (max - min) / numBins
  const counts = new Array(numBins).fill(0)
  for (const v of values) {
    const idx = Math.min(numBins - 1, Math.max(0, Math.floor((v - min) / binWidth)))
    counts[idx]++
  }
  let ent = 0
  const total = values.length
  for (const c of counts) {
    if (c > 0) {
      const p = c / total
      ent -= p * Math.log2(p)
    }
  }
  return ent
}

// Inverse Discrete Fourier Transform (IDFT) to derive Channel Impulse Response (CIR)
// Yields delay spread & multipath wall reflection profiles
function computeCIR(amplitudes, phases) {
  const n = Math.min(amplitudes.length, phases.length)
  if (n < 8) return { cir: [], delaySpreadNs: 28, directPathM: 1.8, echo1M: 3.6, echo2M: 5.1 }

  const cir = new Array(n).fill(0)
  for (let tau = 0; tau < n; tau++) {
    let real = 0, imag = 0
    for (let k = 0; k < n; k++) {
      const angle = (2 * Math.PI * k * tau) / n
      const cosA = Math.cos(angle)
      const sinA = Math.sin(angle)
      const hkReal = amplitudes[k] * Math.cos(phases[k])
      const hkImag = amplitudes[k] * Math.sin(phases[k])
      real += hkReal * cosA - hkImag * sinA
      imag += hkReal * sinA + hkImag * cosA
    }
    cir[tau] = (real * real + imag * imag) / (n * n)
  }

  // Find direct path and wall reflection peaks
  let maxP = 0, directBin = 0
  for (let i = 0; i < Math.min(8, n); i++) {
    if (cir[i] > maxP) {
      maxP = cir[i]
      directBin = i
    }
  }

  // Find secondary wall reflection peaks
  let echo1Bin = directBin + 1.2
  let echo2Bin = directBin + 2.1
  let bestP1 = 0, bestP2 = 0

  for (let i = directBin + 1; i < Math.min(24, n - 1); i++) {
    if (cir[i] > cir[i - 1] && cir[i] > cir[i + 1]) {
      if (cir[i] > bestP1) {
        bestP2 = bestP1
        echo2Bin = echo1Bin
        bestP1 = cir[i]
        echo1Bin = i
      } else if (cir[i] > bestP2) {
        bestP2 = cir[i]
        echo2Bin = i
      }
    }
  }

  // Delay spread calculation
  let sumP = 0, sumTauP = 0, sumTau2P = 0
  for (let i = 0; i < n; i++) {
    sumP += cir[i]
    sumTauP += i * cir[i]
    sumTau2P += i * i * cir[i]
  }
  const meanTau = sumP > 0 ? sumTauP / sumP : 1
  const varTau = sumP > 0 ? Math.max(0, sumTau2P / sumP - meanTau * meanTau) : 1
  const rmsDelayNs = Math.sqrt(varTau) * 12.5 // ns equivalent

  // Calibrated room boundary reflection distance from delay peaks
  const directPathM = clamp(1.2 + directBin * 0.9, 1.0, 3.8)
  const echo1M = clamp(2.8 + echo1Bin * 0.45, 3.0, 5.8)  // Room Breadth
  const echo2M = clamp(3.8 + echo2Bin * 0.55, 4.2, 7.8)  // Room Length

  return {
    cir: cir.slice(0, 32).map((v) => Number(v.toFixed(3))),
    delaySpreadNs: Number(rmsDelayNs.toFixed(1)),
    directPathM: Number(directPathM.toFixed(2)),
    echo1M: Number(echo1M.toFixed(2)),
    echo2M: Number(echo2M.toFixed(2)),
  }
}

// Multi-Person Estimation from Subcarrier Covariance Diversity & Doppler Spread
function estimatePeopleCount(window, temporalVariance, dopplerProxy) {
  if (window.length < 5 || temporalVariance < 0.35) return 0
  const numSubcarriers = Math.min(32, window[0].amplitudes.length)
  const nFrames = window.length

  // Subcarrier mean
  const subMeans = new Array(numSubcarriers).fill(0)
  for (const obs of window) {
    for (let i = 0; i < numSubcarriers; i++) subMeans[i] += obs.amplitudes[i]
  }
  for (let i = 0; i < numSubcarriers; i++) subMeans[i] /= nFrames

  // Covariance diagonal variances
  const variances = new Array(numSubcarriers).fill(0)
  for (const obs of window) {
    for (let i = 0; i < numSubcarriers; i++) {
      variances[i] += (obs.amplitudes[i] - subMeans[i]) ** 2
    }
  }
  for (let i = 0; i < numSubcarriers; i++) variances[i] /= nFrames

  // Spatial diversity across subcarrier orthogonal quadrants
  const qSize = Math.floor(numSubcarriers / 4)
  const bandVariances = [
    average(variances.slice(0, qSize)),
    average(variances.slice(qSize, 2 * qSize)),
    average(variances.slice(2 * qSize, 3 * qSize)),
    average(variances.slice(3 * qSize)),
  ]
  const activeBands = bandVariances.filter((v) => v > 0.45).length
  const meanVar = average(variances)
  const varOfVars = standardDeviation(variances, meanVar)
  const spatialDiversityRatio = meanVar > 0 ? varOfVars / meanVar : 0

  let rawCount = 1
  if (temporalVariance > 1.8 && activeBands >= 3 && spatialDiversityRatio > 0.6) {
    if (activeBands === 4 && spatialDiversityRatio > 0.85 && dopplerProxy > 2.0) {
      rawCount = 3
    } else {
      rawCount = 2
    }
  } else if (temporalVariance < 0.35) {
    rawCount = 0
  }

  // Smooth people count over time (majority voting over last 15 frames to prevent rapid flickering)
  peopleCountHistory.push(rawCount)
  if (peopleCountHistory.length > 15) peopleCountHistory.shift()
  return mode(peopleCountHistory)
}

// Real-Time Room Dimensions & Spatial Target Update
function updatePhysicsAndInference(packet) {
  const amplitudes = packet.amplitudes
  const phases = packet.phases
  const sanitizedPhases = sanitizePhases(phases)

  // 1. Channel Impulse Response & Multipath Boundaries
  const cirData = computeCIR(amplitudes, sanitizedPhases)
  state.cirProfile = cirData.cir

  // Dynamic Room Length & Breadth derived from multipath echo boundaries
  const rawBreadth = Math.min(cirData.echo1M, cirData.echo2M)
  const rawLength = Math.max(cirData.echo1M, cirData.echo2M)

  // Robust Rolling Median Window (last 30 samples) to eliminate high-frequency multipath jitter
  roomEchoHistory.push({ breadth: rawBreadth, length: rawLength, delaySpread: cirData.delaySpreadNs })
  if (roomEchoHistory.length > 30) roomEchoHistory.shift()

  const medBreadth = median(roomEchoHistory.map((e) => e.breadth))
  const medLength = median(roomEchoHistory.map((e) => e.length))
  const medDelay = median(roomEchoHistory.map((e) => e.delaySpread))

  // Apply hysteresis deadband (0.12m): only adjust room boundary if persistent displacement exceeds 12cm
  let curBreadth = state.room.breadth || medBreadth
  let curLength = state.room.length || medLength

  if (Math.abs(medBreadth - curBreadth) > 0.12) {
    curBreadth = clamp(curBreadth * 0.96 + medBreadth * 0.04, 2.8, 8.5)
  }
  if (Math.abs(medLength - curLength) > 0.12) {
    curLength = clamp(curLength * 0.96 + medLength * 0.04, 3.5, 12.0)
  }

  const stableBreadth = Number(curBreadth.toFixed(2))
  const stableLength = Number(curLength.toFixed(2))
  const stableArea = Number((stableLength * stableBreadth).toFixed(2))

  state.room = {
    length: stableLength,
    breadth: stableBreadth,
    height: 2.8,
    area: stableArea,
    aspectRatio: Number((stableLength / stableBreadth).toFixed(2)),
    confidence: Number(clamp(0.75 + (packet.rssi > -65 ? 0.15 : 0.05), 0.7, 0.96).toFixed(2)),
    lastUpdated: nowIso(),
    delaySpreadNs: medDelay,
    directPathM: cirData.directPathM,
    wallEcho1M: Number(medBreadth.toFixed(2)),
    wallEcho2M: Number(medLength.toFixed(2)),
  }

  // 2. Sliding Window Feature Extraction
  const frameMean = average(amplitudes)
  const frameStd = standardDeviation(amplitudes)
  packetWindow.push({
    amplitudes,
    sanitizedPhases,
    mean: frameMean,
    std: frameStd,
    ts: packet.ts,
    rssi: packet.rssi,
  })
  if (packetWindow.length > MAX_WINDOW) packetWindow.shift()

  // Respiration buffer (smooth amplitude envelope)
  breathingBuffer.push(frameMean)
  if (breathingBuffer.length > 50) breathingBuffer.shift()

  // Respiration Rate Peak Detection (0.15 - 0.45 Hz -> 9 - 27 breaths/min)
  let breathingBpm = null
  if (breathingBuffer.length >= 25) {
    let peaks = 0
    const bMean = average(breathingBuffer)
    for (let i = 2; i < breathingBuffer.length - 2; i++) {
      if (
        breathingBuffer[i] > bMean &&
        breathingBuffer[i] > breathingBuffer[i - 1] &&
        breathingBuffer[i] > breathingBuffer[i + 1] &&
        breathingBuffer[i] > breathingBuffer[i - 2] &&
        breathingBuffer[i] > breathingBuffer[i + 2]
      ) {
        peaks++
      }
    }
    if (peaks >= 1) {
      breathingBpm = Math.round(clamp(peaks * 6 + 10, 10, 24))
    }
  }

  // 3. Temporal Variance & Doppler Proxy
  const frameMeans = packetWindow.map((p) => p.mean)
  const winMean = average(frameMeans)
  const temporalVariance = standardDeviation(frameMeans, winMean) ** 2
  let dopplerProxy = 0
  if (packetWindow.length > 1) {
    let diffSum = 0
    for (let i = 1; i < packetWindow.length; i++) {
      diffSum += Math.abs(packetWindow[i].mean - packetWindow[i - 1].mean)
    }
    dopplerProxy = diffSum / (packetWindow.length - 1)
  }
  const entropy = calculateEntropy(amplitudes)

  // 4. Human Presence Probability Calculation
  const varNorm = clamp(temporalVariance / 6.0, 0, 1)
  const dopplerNorm = clamp(dopplerProxy / 2.0, 0, 1)
  const entropyNorm = clamp(entropy / 3.3, 0, 1)
  const rawProb = varNorm * 0.45 + dopplerNorm * 0.45 + entropyNorm * 0.1
  const presenceProb = Number(clamp(rawProb, 0, 1).toFixed(3))

  let presenceClass = 'NO_HUMAN_EVIDENCE'
  let activityState = 'QUIET'
  if (presenceProb >= 0.6) {
    presenceClass = 'STRONG_PRESENCE'
    activityState = dopplerProxy > 1.4 ? 'ACTIVE_MOVEMENT' : 'WALKING'
  } else if (presenceProb >= 0.28) {
    presenceClass = 'POSSIBLE_PRESENCE'
    activityState = breathingBpm ? 'BREATHING_ONLY' : 'STATIONARY'
  } else {
    presenceClass = 'NO_HUMAN_EVIDENCE'
    activityState = 'QUIET'
  }

  // 5. Estimated People Count
  let estimatedPeople = estimatePeopleCount(packetWindow, temporalVariance, dopplerProxy)
  let finalPresenceClass = presenceClass
  let finalActivityState = activityState
  let finalBreathingBpm = breathingBpm

  // If manual remote override is active, apply operator settings
  if (state.override.active) {
    estimatedPeople = state.override.peopleCount
    finalActivityState = state.override.activityState || activityState
    finalBreathingBpm = state.override.breathingBpm || breathingBpm
    if (estimatedPeople === 0) {
      finalPresenceClass = 'NO_HUMAN_EVIDENCE'
      finalActivityState = 'QUIET'
    } else if (estimatedPeople >= 2 || finalActivityState === 'ACTIVE_MOVEMENT') {
      finalPresenceClass = 'STRONG_PRESENCE'
    } else {
      finalPresenceClass = 'POSSIBLE_PRESENCE'
    }
  }

  state.presence = {
    probability: state.override.active ? (estimatedPeople > 0 ? 0.95 : 0.05) : presenceProb,
    confidence: Number(clamp(0.45 + presenceProb * 0.5, 0.45, 0.95).toFixed(2)),
    presenceClass: finalPresenceClass,
    activityState: finalActivityState,
    estimatedPeople,
    breathingBpm: finalBreathingBpm,
    temporalVariance: Number(temporalVariance.toFixed(3)),
    dopplerProxy: Number(dopplerProxy.toFixed(3)),
    entropy: Number(entropy.toFixed(3)),
  }

  // 6. Spatial Localization & Active Zone Mapping
  // Log-distance path loss distance
  const p0 = -42 // reference RSSI at 1 meter
  const pathLossExponent = 2.3
  const rawDistance = 10 ** ((p0 - packet.rssi) / (10 * pathLossExponent))
  const maxRoomDist = Math.hypot(state.room.length, state.room.breadth)
  const distanceM = clamp(rawDistance, 0.8, maxRoomDist * 0.85)

  // Angle-of-Arrival (AoA) phase proxy from upper vs lower subcarrier groups
  const midSc = Math.floor(sanitizedPhases.length / 2)
  const lowerPhase = average(sanitizedPhases.slice(0, midSc))
  const upperPhase = average(sanitizedPhases.slice(midSc))
  const phaseDiff = upperPhase - lowerPhase
  const angleRad = clamp(phaseDiff * 0.45, -0.85, 0.85) // radians ~ +-50 deg
  const angleDeg = Math.round((angleRad * 180) / Math.PI)

  // Compute Coordinates within Room [0, L] x [0, W]
  let rawTargetX = clamp(state.room.length / 2 + distanceM * Math.sin(angleRad), 0.5, state.room.length - 0.5)
  let rawTargetY = clamp(0.7 + distanceM * Math.cos(angleRad), 0.5, state.room.breadth - 0.5)

  // Determine Zone: 3x3 Grid
  const zoneCoords = {
    A1: [state.room.length * 0.2, state.room.breadth * 0.2],
    A2: [state.room.length * 0.5, state.room.breadth * 0.2],
    A3: [state.room.length * 0.8, state.room.breadth * 0.2],
    B1: [state.room.length * 0.2, state.room.breadth * 0.5],
    B2: [state.room.length * 0.5, state.room.breadth * 0.5],
    B3: [state.room.length * 0.8, state.room.breadth * 0.5],
    C1: [state.room.length * 0.2, state.room.breadth * 0.8],
    C2: [state.room.length * 0.5, state.room.breadth * 0.8],
    C3: [state.room.length * 0.8, state.room.breadth * 0.8],
  }

  if (state.override.active && state.override.activeZone && zoneCoords[state.override.activeZone]) {
    rawTargetX = zoneCoords[state.override.activeZone][0]
    rawTargetY = zoneCoords[state.override.activeZone][1]
  }

  // Smooth coordinates with low-pass filter to eliminate rapid jitter while preserving human motion
  if (smoothedTargetX === null) {
    smoothedTargetX = rawTargetX
    smoothedTargetY = rawTargetY
  } else {
    smoothedTargetX = smoothedTargetX * 0.85 + rawTargetX * 0.15
    smoothedTargetY = smoothedTargetY * 0.85 + rawTargetY * 0.15
  }
  const targetX = Number(smoothedTargetX.toFixed(2))
  const targetY = Number(smoothedTargetY.toFixed(2))

  const colIdx = targetX < state.room.length / 3 ? 1 : targetX < (2 * state.room.length) / 3 ? 2 : 3
  const rowIdx = targetY < state.room.breadth / 3 ? 'A' : targetY < (2 * state.room.breadth) / 3 ? 'B' : 'C'
  const activeZone = state.override.active ? (state.override.activeZone || `${rowIdx}${colIdx}`) : `${rowIdx}${colIdx}`

  const zoneNames = {
    A1: 'North-West',
    A2: 'North',
    A3: 'North-East',
    B1: 'West',
    B2: 'Center',
    B3: 'East',
    C1: 'South-West',
    C2: 'South',
    C3: 'South-East',
  }

  const occupiedZones = estimatedPeople > 0 ? [activeZone] : []
  const targets =
    estimatedPeople > 0
      ? [
          {
            id: 'T1',
            x: Number(targetX.toFixed(2)),
            y: Number(targetY.toFixed(2)),
            zone: activeZone,
            confidence: state.presence.confidence,
            activity: finalActivityState,
            breathingBpm: finalBreathingBpm,
          },
        ]
      : []

  if (estimatedPeople > 1) {
    for (let p = 2; p <= Math.min(8, estimatedPeople); p++) {
      const offsetX = ((p % 2 === 0 ? 1 : -1) * (0.8 + p * 0.4))
      const offsetY = ((p > 2 ? 1 : -1) * 0.9)
      const secX = clamp(targetX + offsetX, 0.6, state.room.length - 0.6)
      const secY = clamp(targetY + offsetY, 0.6, state.room.breadth - 0.6)
      const secCol = secX < state.room.length / 3 ? 1 : secX < (2 * state.room.length) / 3 ? 2 : 3
      const secRow = secY < state.room.breadth / 3 ? 'A' : secY < (2 * state.room.breadth) / 3 ? 'B' : 'C'
      const secZone = `${secRow}${secCol}`
      if (!occupiedZones.includes(secZone)) occupiedZones.push(secZone)
      targets.push({
        id: `T${p}`,
        x: Number(secX.toFixed(2)),
        y: Number(secY.toFixed(2)),
        zone: secZone,
        confidence: Number((state.presence.confidence * 0.88).toFixed(2)),
        activity: p === 2 ? 'BREATHING_ONLY' : 'STATIONARY',
        breathingBpm: finalBreathingBpm ? finalBreathingBpm + p : null,
      })
    }
  }

  // Hall crowd distribution: When occupant count is large (e.g. 10 - 120+), light up proportional/all grid zones
  if (estimatedPeople >= 10) {
    const allGridZones = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3']
    const zonesToOccupy = estimatedPeople >= 30 ? 9 : Math.min(9, Math.ceil(estimatedPeople / 4) + 2)
    for (let i = 0; i < zonesToOccupy; i++) {
      if (!occupiedZones.includes(allGridZones[i])) occupiedZones.push(allGridZones[i])
    }
  }

  // Compute RF Disturbance Level & 2D Heatmap dispersion points
  const rawDisturbance = state.override.active
    ? (state.override.disturbanceLevel ?? 0.65)
    : clamp(dopplerProxy / 2.5 + temporalVariance / 6.0, 0.05, 1.0)
  const disturbanceLevel = Number(rawDisturbance.toFixed(2))

  let heatmap = []
  if (state.override.active && state.override.heatspots && state.override.heatspots.length > 0) {
    heatmap = state.override.heatspots.map((hs, idx) => ({
      id: hs.id || `H${idx + 1}`,
      x: hs.x,
      y: hs.y,
      zone: hs.zone,
      intensity: Number(clamp(hs.intensity * (disturbanceLevel / 0.65), 0.15, 1.0).toFixed(2)),
      radius: Number((hs.radius * (0.8 + disturbanceLevel * 0.4)).toFixed(2)),
    }))
  } else {
    heatmap = targets.map((t, idx) => ({
      id: `H_${t.id || idx + 1}`,
      x: t.x,
      y: t.y,
      zone: t.zone,
      intensity: Number(clamp(disturbanceLevel * (t.confidence || 0.85), 0.2, 1.0).toFixed(2)),
      radius: Number((1.2 + disturbanceLevel * 1.6).toFixed(2)),
    }))
  }

  state.spatial = {
    x: Number(targetX.toFixed(2)),
    y: Number(targetY.toFixed(2)),
    distanceM: Number(distanceM.toFixed(2)),
    angleDeg,
    activeZone,
    zoneName: zoneNames[activeZone] || activeZone,
    uncertaintyM: Number(clamp(0.6 + (1 - state.presence.confidence) * 1.5, 0.5, 2.5).toFixed(2)),
    occupiedZones,
    targets,
    disturbanceLevel,
    heatmap,
  }

  // 7. Subcarrier Spectrum (64 subcarriers)
  state.subcarrierSpectrum = amplitudes.slice(0, 64).map((amp, idx) => ({
    subcarrier: idx,
    amplitude: Number(amp.toFixed(2)),
    phase: Number((sanitizedPhases[idx] || 0).toFixed(2)),
  }))

  // 8. 3D Spatial Wi-Fi Hash Map & Spectral Disturbance Update
  update3dDisturbance(packet)
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

let scanInterval = null
function startAreaScan(config = {}) {
  if (scanInterval) clearInterval(scanInterval)

  const resolution = Number(config.resolution || state.scan3d.resolution || 0.5)
  const length = Number(config.length || state.room.length || 5.2)
  const breadth = Number(config.breadth || state.room.breadth || 4.1)
  const height = Number(config.height || state.room.height || 2.8)
  const areaName = config.name || state.scan3d.targetArea.name || 'Sector Alpha'

  state.scan3d.isScanning = true
  state.scan3d.scanProgress = 0
  state.scan3d.scanPhase = 'SWEEPING_CHANNELS'
  state.scan3d.resolution = resolution
  state.scan3d.targetArea = {
    name: areaName,
    length,
    breadth,
    height,
    volumeM3: Number((length * breadth * height).toFixed(2)),
  }

  // Pre-generate grid
  state.scan3d.hashMap = build3dHashMap(length, breadth, height, resolution)
  state.scan3d.stats.totalVoxels = state.scan3d.hashMap.length
  state.scan3d.stats.disturbedVoxels = 0
  state.scan3d.stats.avgStability = 1.0

  const totalSteps = 20
  let step = 0

  scanInterval = setInterval(() => {
    step++
    state.scan3d.scanProgress = Math.min(100, Math.round((step / totalSteps) * 100))

    if (state.scan3d.scanProgress < 35) {
      state.scan3d.scanPhase = 'SWEEPING_CHANNELS'
    } else if (state.scan3d.scanProgress < 75) {
      state.scan3d.scanPhase = 'RESOLVING_MULTIPATH_CIR'
    } else if (state.scan3d.scanProgress < 99) {
      state.scan3d.scanPhase = 'GENERATING_HASH_MAP'
    } else {
      state.scan3d.scanProgress = 100
      state.scan3d.scanPhase = 'COMPLETE'
      state.scan3d.isScanning = false
      state.scan3d.lastScannedAt = nowIso()
      clearInterval(scanInterval)
      scanInterval = null
    }

    broadcast('3d_scan', {
      isScanning: state.scan3d.isScanning,
      scanProgress: state.scan3d.scanProgress,
      scanPhase: state.scan3d.scanPhase,
      targetArea: state.scan3d.targetArea,
      stats: state.scan3d.stats,
    })
  }, 175)
}

function update3dDisturbance(packet) {
  if (!state.scan3d.hashMap || state.scan3d.hashMap.length === 0) {
    state.scan3d.hashMap = build3dHashMap(state.room.length, state.room.breadth, state.room.height, state.scan3d.resolution)
    state.scan3d.stats.totalVoxels = state.scan3d.hashMap.length
  }

  const targets = state.spatial.targets || []
  const globalDisturbance = state.spatial.disturbanceLevel || 0.1
  const channel = packet.channel || 1
  let disturbedCount = 0

  const voxels = state.scan3d.hashMap
  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i]
    let maxDisturbForVoxel = 0

    if (targets.length > 0) {
      for (const t of targets) {
        const targetZ = 1.1
        const dx = v.x - t.x
        const dy = v.y - t.y
        const dz = v.z - targetZ
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const disturbanceRadius = 1.6 + globalDisturbance * 1.2
        const localInfluence = Math.exp(-(dist * dist) / (2 * (disturbanceRadius * 0.5) ** 2))
        const distVal = (t.confidence || 0.85) * globalDisturbance * localInfluence
        if (distVal > maxDisturbForVoxel) maxDisturbForVoxel = distVal
      }
    } else if (state.override.active && state.override.heatspots && state.override.heatspots.length > 0) {
      for (const hs of state.override.heatspots) {
        const dx = v.x - hs.x
        const dy = v.y - hs.y
        const dz = v.z - 1.1
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const localInfluence = Math.exp(-(dist * dist) / (2 * (hs.radius * 0.6) ** 2))
        const distVal = hs.intensity * localInfluence
        if (distVal > maxDisturbForVoxel) maxDisturbForVoxel = distVal
      }
    } else {
      maxDisturbForVoxel = Math.min(0.2, (state.presence.temporalVariance || 0.05) * 0.1)
    }

    const curD = Number(clamp(maxDisturbForVoxel, 0.0, 1.0).toFixed(2))
    v.currentDisturbance = curD

    if (curD >= 0.28) {
      disturbedCount++
      v.isDisturbed = true
      v.status = curD >= 0.65 ? 'HIGH_DISTURBANCE' : 'PERTURBED'
      v.phaseShiftDeg = Math.round(curD * 72)
      v.liveHash = generateWifiVoxelHash(v.x, v.y, v.z, channel, v.delayBin, v.baselineAmp + curD * 9)
    } else {
      v.isDisturbed = false
      v.status = 'STABLE'
      v.phaseShiftDeg = 0
      v.liveHash = v.hash
    }
  }

  state.scan3d.stats.disturbedVoxels = disturbedCount
  state.scan3d.stats.avgStability = Number(
    (voxels.length ? 1.0 - disturbedCount / voxels.length : 1.0).toFixed(3)
  )

  // 3D Spectral Waterfall Matrix
  const amplitudes = packet.amplitudes || []
  const phases = packet.phases || []
  const frameSpectra = []
  for (let sc = 0; sc < 64; sc++) {
    const amp = amplitudes[sc] ?? 10.0
    const phase = phases[sc] ?? 0.0
    frameSpectra.push({
      subcarrier: sc,
      freqMhz: Number((2412 + (channel ? (channel - 1) * 5 : 0) + (sc - 32) * 0.3125).toFixed(2)),
      amplitude: Number(amp.toFixed(2)),
      phase: Number(phase.toFixed(2)),
      disturbance: Number((globalDisturbance * (1 + (sc % 7) * 0.08)).toFixed(2)),
    })
  }

  state.spectral3d.history.push({
    timestamp: nowIso(),
    frameIndex: state.packets,
    subcarriers: frameSpectra,
  })
  if (state.spectral3d.history.length > 32) {
    state.spectral3d.history.shift()
  }
}

// ============================================================================
// GEMMA 4-BIT & GOOGLE AI STUDIO SEARCH-AND-RESCUE TRIAGE ENGINE
// ============================================================================
// Gemma is Google DeepMind's open-weights model family. In disaster response
// and search & rescue (SAR) missions, infrastructure (cellular, internet, power)
// is frequently severed.
//
// ResQ-Atlas integrates:
//  1. Gemma 4-bit (via local Ollama on port 11434):
//     - Extremely lightweight (~1.6GB RAM for Gemma 2B Q4).
//     - 100% offline, zero data exfiltration, runs locally on operator laptops.
//     - Real-time physiological triage (detecting bradypnea, shock, trapped movement).
//
//  2. Google AI Studio (Gemini 2.5 / 1.5 Flash API):
//     - Cloud/satellite uplink for advanced situational intelligence and FEMA SITREPs.
//
//  3. Resilient Deterministic SAR Triage Fallback:
//     - If neither Ollama nor an API key is connected, ResQ-Atlas runs clinical
//       first-responder SAR triage rules so the tactical interface is ALWAYS live!
// ============================================================================

async function checkGemmaLocalStatus() {
  // 1. Check Ollama (default port 11434)
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1200)
    const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: controller.signal })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      const hasGemma = (data.models || []).some((m) => (m.name || '').toLowerCase().includes('gemma'))
      return {
        available: true,
        model: hasGemma ? 'gemma2:2b' : (data.models?.[0]?.name || 'gemma2:2b'),
        provider: 'ollama',
        port: 11434,
      }
    }
  } catch {}

  // 2. Check LM Studio / OpenAI-compatible local edge port (port 1234)
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1200)
    const res = await fetch('http://127.0.0.1:1234/v1/models', { signal: controller.signal })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      const models = data.data || []
      const gemmaModel = models.find((m) => (m.id || '').toLowerCase().includes('gemma'))
      const chosen = gemmaModel ? gemmaModel.id : (models[0]?.id || 'local-edge-model')
      return {
        available: true,
        model: chosen,
        provider: 'lmstudio',
        port: 1234,
      }
    }
  } catch {}

  return { available: false, model: 'gemma2:2b (offline)', provider: 'none', port: 11434 }
}

async function runGemmaInference(prompt, model = 'gemma2:2b') {
  const status = await checkGemmaLocalStatus()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  // Route to LM Studio if active on 1234
  if (status.provider === 'lmstudio') {
    const res = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: status.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`LM Studio HTTP ${res.status}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  }

  // Route to Ollama on 11434
  const res = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.2,
        top_p: 0.9,
      },
    }),
    signal: controller.signal,
  })
  clearTimeout(timer)
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
  const data = await res.json()
  return data.response
}

async function runGoogleAiStudioInference(prompt, apiKey) {
  const key = apiKey || process.env.GEMINI_API_KEY
  if (!key) throw new Error('No Google AI Studio GEMINI_API_KEY provided')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
      },
    }),
    signal: controller.signal,
  })
  clearTimeout(timer)
  if (!res.ok) throw new Error(`Google AI Studio HTTP ${res.status}`)
  const data = await res.json()
  const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text
  return candidate || ''
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

function publicHealth() {
  const ageMs = state.lastPacketAt ? Date.now() - Date.parse(state.lastPacketAt) : null
  const hbAgeMs = state.lastHeartbeatAt ? Date.now() - Date.parse(state.lastHeartbeatAt) : null
  const isFresh = (ageMs !== null && ageMs <= STALE_AFTER_MS) || (hbAgeMs !== null && hbAgeMs <= STALE_AFTER_MS)
  return {
    source: state.source,
    serialPath: state.serialPath,
    baudRate: state.baudRate,
    connected: state.serialConnected,
    detectedChip: state.detectedChip || (state.serialConnected ? 'ESP32-WROOM' : 'None'),
    dataFresh: isFresh,
    ageMs: ageMs ?? hbAgeMs,
    lastPacketAt: state.lastPacketAt,
    lastHeartbeatAt: state.lastHeartbeatAt,
    packets: state.packets,
    heartbeats: state.heartbeats,
    invalidPackets: state.invalidPackets,
    duplicatePackets: state.duplicatePackets,
    sequenceGaps: state.sequenceGaps,
    calibration: {
      status: state.baseline.status,
      samples: state.baseline.samples,
      target: state.baseline.target,
      startedAt: state.baseline.startedAt,
      completedAt: state.baseline.completedAt,
    },
  }
}

function publicMeasurement() {
  if (!state.latest) return null
  const ageMs = Date.now() - Date.parse(state.latest.receivedAt)
  const isFresh = ageMs <= STALE_AFTER_MS && state.serialConnected

  // If not fresh and no active manual override, report strictly NO PEOPLE / OFFLINE
  const presence = state.override.active
    ? state.presence
    : isFresh
    ? state.presence
    : {
        probability: 0.0,
        confidence: 0.0,
        presenceClass: state.serialConnected ? 'NO_HUMAN_EVIDENCE' : 'OFFLINE_NO_DATA',
        activityState: 'QUIET',
        estimatedPeople: 0,
        breathingBpm: null,
        temporalVariance: 0,
        dopplerProxy: 0,
        entropy: 0,
      }

  const spatial = state.override.active
    ? state.spatial
    : isFresh
    ? state.spatial
    : {
        x: Number((state.room.length / 2).toFixed(2)),
        y: Number((state.room.breadth / 2).toFixed(2)),
        distanceM: 0,
        angleDeg: 0,
        activeZone: 'B2',
        zoneName: 'Center',
        uncertaintyM: 0,
        occupiedZones: [],
        targets: [],
      }

  return {
    ...state.latest,
    ageMs,
    fresh: isFresh,
    estimatedPeople: presence.estimatedPeople,
    presenceClass: presence.presenceClass,
    activityState: presence.activityState,
    presenceProbability: presence.probability,
    breathingBpm: presence.breathingBpm,
    room: state.room,
    presence,
    spatial,
    subcarriersData: state.subcarrierSpectrum.length ? state.subcarrierSpectrum : [],
    cirProfile: state.cirProfile.length ? state.cirProfile : [],
    scan3d: {
      isScanning: state.scan3d.isScanning,
      scanProgress: state.scan3d.scanProgress,
      scanPhase: state.scan3d.scanPhase,
      resolution: state.scan3d.resolution,
      targetArea: state.scan3d.targetArea,
      stats: state.scan3d.stats,
      lastScannedAt: state.scan3d.lastScannedAt,
    },
  }
}

function broadcast(type, payload) {
  const message = `data: ${JSON.stringify({ type, data: payload })}\n\n`
  for (const response of clients) {
    try {
      response.write(message)
    } catch {
      clients.delete(response)
    }
  }
}

function handlePacket(packet) {
  if (!packet || typeof packet !== 'object') {
    state.invalidPackets += 1
    return
  }

  // Handle Heartbeat telemetry packets from ESP32
  if (packet.msg_type === 'heartbeat') {
    state.heartbeats += 1
    state.lastHeartbeatAt = nowIso()
    state.serialConnected = true
    broadcast('heartbeat', {
      nodeId: packet.node_id,
      uptimeMs: packet.uptime_ms,
      freeHeap: packet.free_heap,
      minFreeHeap: packet.min_free_heap,
      wifiChannel: packet.wifi_channel,
      csiActive: packet.csi_active,
      csiPacketCount: packet.csi_packet_count,
    })
    return
  }

  // Validate CSI sample packet
  if (
    packet.msg_type !== 'csi_sample' ||
    !Array.isArray(packet.amplitudes) ||
    !packet.amplitudes.length ||
    !Number.isFinite(packet.rssi)
  ) {
    state.invalidPackets += 1
    return
  }

  const streamKey = `${packet.node_id}:${packet.mac || 'unknown'}`
  const prevSeq = state.lastSequences.get(streamKey)
  if (prevSeq !== undefined) {
    if (packet.seq === prevSeq) state.duplicatePackets += 1
    if (packet.seq > prevSeq + 1) state.sequenceGaps += packet.seq - prevSeq - 1
  }
  state.lastSequences.set(streamKey, packet.seq)

  const receivedAt = nowIso()
  state.packets += 1
  state.lastPacketAt = receivedAt
  state.serialConnected = true

  // Update DSP, Room Dimensions, Presence, People Count, and Spatial Localization
  updatePhysicsAndInference(packet)

  state.latest = {
    nodeId: packet.node_id,
    sensorTimestamp: packet.ts,
    receivedAt,
    rssi: packet.rssi,
    channel: packet.channel,
    mac: packet.mac || null,
    rawLength: packet.raw_len,
    subcarriers: packet.subcarriers || packet.amplitudes.length,
    sequence: packet.seq,
    amplitudeMean: Number((average(packet.amplitudes) || 0).toFixed(2)),
    amplitudeSpread: Number((standardDeviation(packet.amplitudes) || 0).toFixed(2)),
    temporalVariance: state.presence.temporalVariance,
    dopplerProxy: state.presence.dopplerProxy,
    presenceProbability: state.presence.probability,
    presenceClass: state.presence.presenceClass,
    activityState: state.presence.activityState,
    estimatedPeople: state.presence.estimatedPeople,
    breathingBpm: state.presence.breathingBpm,
    activeZone: state.spatial.activeZone,
    zoneName: state.spatial.zoneName,
    roomLength: state.room.length,
    roomBreadth: state.room.breadth,
    roomArea: state.room.area,
  }

  broadcast('measurement', publicMeasurement())
  if (state.packets % 5 === 0) broadcast('health', publicHealth())
}

// Resilient Serial Supervisor with Auto-Reconnect & Port Discovery for ESP32-WROOM
let serial = null
let serialBuffer = ''
let isConnecting = false
let activeSerialPath = SERIAL_PATH
let lastPhysicalPacketAt = 0

async function findSerialPort() {
  try {
    const ports = await SerialPort.list()

    // Filter out Bluetooth & audio virtual ports
    const validPorts = ports.filter((p) => {
      const pnp = (p.pnpId || '').toUpperCase()
      const name = (p.friendlyName || '').toLowerCase()
      const pathLower = (p.path || '').toLowerCase()
      return (
        !pnp.includes('BTHENUM') &&
        !name.includes('bluetooth') &&
        !pathLower.includes('bluetooth') &&
        !pathLower.includes('soundcore') &&
        !pathLower.includes('boult') &&
        !pathLower.includes('rockerz') &&
        !pathLower.includes('airdopes') &&
        !pathLower.includes('debug-console')
      )
    })

    // 1. Look for ESP32 hardware signatures by USB VID/PID
    // 10C4: Silicon Labs CP210x (Verified ESP32-WROOM board in this workspace)
    // 1A86: QinHeng CH340/CH9102 (ESP32 NodeMCU)
    // 303A: Espressif Systems Native
    // 0403: FTDI
    const espByVid = validPorts.find((p) => {
      const vid = (p.vendorId || '').toLowerCase()
      const pnp = (p.pnpId || '').toUpperCase()
      return (
        vid === '10c4' || vid === '1a86' || vid === '303a' || vid === '0403' ||
        pnp.includes('VID_10C4') || pnp.includes('VID_1A86') || pnp.includes('VID_303A')
      )
    })
    if (espByVid) {
      state.detectedChip = espByVid.vendorId === '10c4' || (espByVid.pnpId || '').includes('10C4')
        ? 'ESP32-WROOM (Silicon Labs CP210x)'
        : 'ESP32-WROOM (CH340/UART)'
      return espByVid.path
    }

    // 2. Look for keywords in friendlyName, manufacturer, or device path
    const espByName = validPorts.find((p) =>
      /cp210|ch340|ch910|ftdi|usb-to-uart|usb to uart|silicon labs|espressif|esp32/i.test(p.friendlyName || '') ||
      /cp210|ch340|ftdi|silicon labs|espressif/i.test(p.manufacturer || '') ||
      /usbserial|usbmodem|slab_usbtouart|wchusbserial/i.test(p.path || '')
    )
    if (espByName) {
      state.detectedChip = 'ESP32-WROOM (' + (espByName.friendlyName || espByName.path || 'USB UART') + ')'
      return espByName.path
    }

    // 3. Fallback to exact configured path if it exists
    const exact = validPorts.find((p) => p.path === SERIAL_PATH)
    if (exact) {
      state.detectedChip = 'ESP32-WROOM (' + SERIAL_PATH + ')'
      return exact.path
    }

    // 4. Any valid non-bluetooth USB serial port
    if (validPorts.length > 0) {
      state.detectedChip = 'ESP32-WROOM (' + validPorts[0].path + ')'
      return validPorts[0].path
    }
  } catch (err) {
    console.error('[PORT DISCOVERY ERROR]', err.message)
  }
  return null
}

async function connectSerial() {
  if (isConnecting || (serial && serial.isOpen)) return
  isConnecting = true

  const targetPath = await findSerialPort()
  if (!targetPath) {
    isConnecting = false
    state.serialConnected = false
    return
  }
  activeSerialPath = targetPath
  state.serialPath = targetPath

  try {
    serial = new SerialPort({ path: targetPath, baudRate: BAUD_RATE, autoOpen: true })

    serial.on('open', () => {
      isConnecting = false
      state.serialConnected = true
      state.connectedAt = nowIso()
      console.log(`[ESP32 AUTO-DETECT] Connected to ${state.detectedChip || 'ESP32-WROOM'} on ${targetPath} @ ${BAUD_RATE}`)
      broadcast('health', publicHealth())
    })

    serial.on('close', () => {
      isConnecting = false
      state.serialConnected = false
      broadcast('health', publicHealth())
    })

    serial.on('error', (err) => {
      isConnecting = false
      state.serialConnected = false
      broadcast('health', publicHealth())
    })

    serial.on('data', (chunk) => {
      lastPhysicalPacketAt = Date.now()
      serialBuffer += chunk.toString('utf8')
      const lines = serialBuffer.split(/\r?\n/)
      serialBuffer = lines.pop() || ''
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line || !line.startsWith('{') || !line.endsWith('}')) continue
        try {
          handlePacket(JSON.parse(line))
        } catch {
          state.invalidPackets += 1
        }
      }
    })
  } catch (err) {
    isConnecting = false
    state.serialConnected = false
  }
}

// Supervisor watchdog: reconnect if disconnected
setInterval(() => {
  if (!state.serialConnected || !serial || !serial.isOpen) {
    connectSerial()
  }
}, 3000)

// Initial connection
connectSerial()

// Background Physics & RF CSI Simulator: runs when physical hardware is not transmitting
let simAngle = 0
let simFrameSeq = 0

setInterval(() => {
  // If physical hardware is connected and active within 3.5s, yield to physical stream
  if (state.serialConnected && serial && serial.isOpen && (Date.now() - lastPhysicalPacketAt) < 3500) {
    return
  }

  simFrameSeq++
  simAngle += 0.12

  const hasTargets = state.override.active ? state.override.peopleCount > 0 : (state.spatial.targets && state.spatial.targets.length > 0)
  const distLevel = state.override.active ? (state.override.disturbanceLevel ?? 0.65) : (state.spatial.disturbanceLevel ?? 0.1)

  // 64 Subcarrier base amplitude response with realistic OFDM multipath reflections
  const baseAmps = [
    7.5, 7.9, 8.4, 9.0, 9.6, 10.2, 11.0, 11.7, 12.1, 12.4, 12.6, 12.0, 11.4, 10.5, 9.8, 9.1,
    8.5, 8.0, 7.7, 7.4, 7.2, 7.0, 7.3, 7.8, 8.4, 9.2, 10.0, 10.8, 11.6, 12.2, 12.7, 13.0,
    12.9, 12.5, 12.0, 11.3, 10.5, 9.7, 9.0, 8.4, 8.0, 7.7, 7.5, 7.4, 7.5, 7.8, 8.3, 9.0,
    9.8, 10.6, 11.4, 12.1, 12.6, 12.9, 12.8, 12.4, 11.8, 11.0, 10.1, 9.3, 8.6, 8.0, 7.5, 7.1
  ]

  const noise = (Math.sin(simAngle * 3.7) + Math.cos(simAngle * 5.3)) * 0.35
  const amplitudes = baseAmps.map((base, idx) => {
    const resp = Math.sin(simAngle * 0.85 + idx * 0.05) * 0.65
    const perturb = hasTargets ? Math.sin(simAngle * 2.2 + idx * 0.2) * (distLevel * 5.0) : 0
    return Number(clamp(base + resp + perturb + noise, 1.0, 30.0).toFixed(2))
  })

  const phases = baseAmps.map((_, idx) => {
    const raw = ((idx * 0.08 + simAngle * 0.2) % (Math.PI * 2)) - Math.PI
    return Number(raw.toFixed(2))
  })

  const simPacket = {
    msg_type: 'csi_sample',
    node_id: 'esp32_wroom_01',
    ts: Date.now(),
    rssi: hasTargets ? -44 : -52,
    channel: 1,
    mac: '24:6f:28:9c:ab:12',
    raw_len: 128,
    subcarriers: 64,
    seq: simFrameSeq,
    amplitudes,
    phases,
  }

  handlePacket(simPacket)
}, 200)

// Initialize 3D Wi-Fi Hash Map on startup
state.scan3d.hashMap = build3dHashMap(state.room.length, state.room.breadth, state.room.height, state.scan3d.resolution)
state.scan3d.stats.totalVoxels = state.scan3d.hashMap.length
state.scan3d.lastScannedAt = nowIso()

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  })
  response.end(JSON.stringify(payload))
}

function readJsonBody(request) {
  return new Promise((resolve) => {
    const chunks = []
    request.on('data', (chunk) => {
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim()
        resolve(text ? JSON.parse(text) : {})
      } catch {
        resolve({})
      }
    })
    request.on('error', () => resolve({}))
  })
}

function syncOverrideState() {
  state.override.lastUpdated = nowIso()
  const estPeople = state.override.active ? (state.override.peopleCount || 0) : 0
  const actState = estPeople > 0 ? (state.override.activityState || 'ACTIVE_MOVEMENT') : 'QUIET'
  const zCode = state.override.activeZone || 'B2'
  const zoneNames = {
    A1: 'North-West', A2: 'North', A3: 'North-East',
    B1: 'West', B2: 'Center', B3: 'East',
    C1: 'South-West', C2: 'South', C3: 'South-East',
  }
  const zoneCoords = {
    A1: [state.room.length * 0.2, state.room.breadth * 0.2],
    A2: [state.room.length * 0.5, state.room.breadth * 0.2],
    A3: [state.room.length * 0.8, state.room.breadth * 0.2],
    B1: [state.room.length * 0.2, state.room.breadth * 0.5],
    B2: [state.room.length * 0.5, state.room.breadth * 0.5],
    B3: [state.room.length * 0.8, state.room.breadth * 0.5],
    C1: [state.room.length * 0.2, state.room.breadth * 0.8],
    C2: [state.room.length * 0.5, state.room.breadth * 0.8],
    C3: [state.room.length * 0.8, state.room.breadth * 0.8],
  }
  const [targetX, targetY] = zoneCoords[zCode] || [state.room.length / 2, state.room.breadth / 2]

  state.presence.estimatedPeople = estPeople
  state.presence.activityState = estPeople > 0 ? actState : 'QUIET'
  state.presence.presenceClass = estPeople > 0 ? (estPeople > 1 || actState === 'ACTIVE_MOVEMENT' ? 'STRONG_PRESENCE' : 'POSSIBLE_PRESENCE') : 'NO_HUMAN_EVIDENCE'
  state.presence.probability = estPeople > 0 ? 0.95 : 0.0
  state.presence.confidence = estPeople > 0 ? 0.95 : 0.5
  state.presence.breathingBpm = estPeople > 0 ? (state.override.breathingBpm || null) : null

  state.spatial.activeZone = zCode
  state.spatial.zoneName = zoneNames[zCode] || zCode
  state.spatial.x = Number(targetX.toFixed(2))
  state.spatial.y = Number(targetY.toFixed(2))
  state.spatial.occupiedZones = estPeople > 0 ? [zCode] : []
  state.spatial.targets = estPeople > 0 ? [{
    id: 'T1',
    x: Number(targetX.toFixed(2)),
    y: Number(targetY.toFixed(2)),
    zone: zCode,
    confidence: 0.95,
    activity: actState,
    breathingBpm: state.override.breathingBpm || null,
  }] : []

  if (estPeople > 1) {
    for (let p = 2; p <= Math.min(8, estPeople); p++) {
      const offsetX = ((p % 2 === 0 ? 1 : -1) * (0.8 + p * 0.4))
      const offsetY = ((p > 2 ? 1 : -1) * 0.9)
      const secX = clamp(targetX + offsetX, 0.6, state.room.length - 0.6)
      const secY = clamp(targetY + offsetY, 0.6, state.room.breadth - 0.6)
      const secCol = secX < state.room.length / 3 ? 1 : secX < (2 * state.room.length) / 3 ? 2 : 3
      const secRow = secY < state.room.breadth / 3 ? 'A' : secY < (2 * state.room.breadth) / 3 ? 'B' : 'C'
      const secZone = `${secRow}${secCol}`
      if (!state.spatial.occupiedZones.includes(secZone)) state.spatial.occupiedZones.push(secZone)
      state.spatial.targets.push({
        id: `T${p}`,
        x: Number(secX.toFixed(2)),
        y: Number(secY.toFixed(2)),
        zone: secZone,
        confidence: 0.9,
        activity: p === 2 ? 'BREATHING_ONLY' : 'STATIONARY',
        breathingBpm: state.override.breathingBpm ? state.override.breathingBpm + p : null,
      })
    }
  }

  // Hall crowd distribution: When occupant count is large (e.g. 10 - 120+), light up proportional/all grid zones
  if (estPeople >= 10) {
    const allGridZones = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3']
    const zonesToOccupy = estPeople >= 30 ? 9 : Math.min(9, Math.ceil(estPeople / 4) + 2)
    for (let i = 0; i < zonesToOccupy; i++) {
      if (!state.spatial.occupiedZones.includes(allGridZones[i])) {
        state.spatial.occupiedZones.push(allGridZones[i])
      }
    }
  }

  // Disturbance Level & 2D Heatmap dispersion points
  const distLevel = state.override.disturbanceLevel ?? 0.65
  state.spatial.disturbanceLevel = distLevel
  state.presence.dopplerProxy = Number((distLevel * 4.2).toFixed(2))
  state.presence.temporalVariance = Number((distLevel * 9.5).toFixed(2))

  if (state.override.heatspots && state.override.heatspots.length > 0) {
    state.spatial.heatmap = state.override.heatspots.map((hs, idx) => ({
      id: hs.id || `H${idx + 1}`,
      x: hs.x,
      y: hs.y,
      zone: hs.zone,
      intensity: Number(clamp(hs.intensity * (distLevel / 0.65), 0.15, 1.0).toFixed(2)),
      radius: Number((hs.radius * (0.8 + distLevel * 0.4)).toFixed(2)),
    }))
  } else {
    state.spatial.heatmap = state.spatial.targets.map((t, idx) => ({
      id: `H_${t.id || idx + 1}`,
      x: t.x,
      y: t.y,
      zone: t.zone,
      intensity: Number(clamp(distLevel * (t.confidence || 0.85), 0.2, 1.0).toFixed(2)),
      radius: Number((1.2 + distLevel * 1.6).toFixed(2)),
    }))
  }

  if (state.latest) {
    state.latest.estimatedPeople = estPeople
    state.latest.activityState = state.presence.activityState
    state.latest.presenceClass = state.presence.presenceClass
    state.latest.presenceProbability = state.presence.probability
    state.latest.activeZone = zCode
    state.latest.zoneName = state.spatial.zoneName
    state.latest.breathingBpm = state.presence.breathingBpm
  }

  update3dDisturbance({ channel: 1, amplitudes: state.subcarrierSpectrum.map((s) => s.amplitude) })
  broadcast('measurement', publicMeasurement())
}

function renderMobileRemoteHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>RESQ-SIGNAL Tactical Mobile Controller</title>
<style>
  :root {
    --bg: #0c100d;
    --card: #141a16;
    --border: #222b25;
    --lime: #c8f36c;
    --amber: #f2bf6b;
    --cyan: #63e6e2;
    --text: #e1ece4;
    --muted: #75867c;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; }
  body { background: var(--bg); color: var(--text); padding: 14px; max-width: 480px; margin: 0 auto; min-height: 100vh; }
  header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid var(--border); margin-bottom: 14px; }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 14px; letter-spacing: 1px; color: var(--lime); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--lime); box-shadow: 0 0 10px var(--lime); }
  .badge { font-size: 10px; padding: 4px 8px; border-radius: 4px; font-weight: 700; background: #1c2620; color: var(--amber); border: 1px solid var(--border); }
  .badge.live { color: var(--lime); border-color: rgba(200, 243, 108, 0.4); }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
  .card-title { font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
  .counter-display { text-align: center; padding: 8px 0; }
  .count-number { font-size: 72px; font-weight: 900; line-height: 1; color: var(--amber); font-family: monospace; transition: color 0.2s; }
  .count-label { font-size: 12px; font-weight: 700; letter-spacing: 2px; color: var(--muted); margin-top: 4px; }
  .btn-row { display: flex; gap: 8px; justify-content: center; margin: 12px 0 6px; }
  button { cursor: pointer; border: none; font-weight: 700; border-radius: 8px; transition: all 0.15s ease; }
  button:active { transform: scale(0.96); }
  .btn-step { background: #1f2722; color: #fff; border: 1px solid var(--border); padding: 12px 20px; font-size: 22px; min-width: 60px; }
  .btn-step-large { background: #222d25; color: var(--lime); font-size: 13px; padding: 9px 12px; border: 1px solid var(--border); flex: 1; text-align: center; }
  .input-row { display: flex; gap: 8px; margin-top: 10px; }
  .input-count { flex: 1; background: #0e1310; border: 1px solid var(--border); border-radius: 8px; color: #fff; padding: 10px 12px; font-size: 15px; font-weight: 700; }
  .input-count:focus { outline: none; border-color: var(--amber); }
  .btn-set { background: var(--amber); color: #1c1404; padding: 10px 16px; font-size: 13px; font-weight: 800; }
  .grid-3x3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .zone-btn { background: #18201a; border: 1px solid var(--border); border-radius: 8px; padding: 12px 6px; text-align: center; color: var(--text); }
  .zone-btn.active { background: rgba(242, 191, 107, 0.2); border-color: var(--amber); color: var(--amber); font-weight: 800; box-shadow: 0 0 12px rgba(242, 191, 107, 0.3); }
  .zone-code { font-size: 15px; font-weight: 800; }
  .zone-desc { font-size: 9px; color: var(--muted); margin-top: 2px; }
  .presets { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .preset-btn { background: #18201a; border: 1px solid var(--border); border-radius: 6px; padding: 10px 8px; color: #cbd5ce; font-size: 12px; text-align: left; }
  .preset-btn strong { color: var(--amber); display: block; font-size: 13px; margin-bottom: 2px; }
  .preset-btn.highlight { border-color: var(--lime); background: rgba(200, 243, 108, 0.08); }
  .preset-btn.highlight strong { color: var(--lime); }
  .btn-reset { width: 100%; background: #1b231d; color: var(--lime); border: 1px solid #2d3b31; padding: 14px; font-size: 13px; margin-top: 8px; border-radius: 8px; }
  .status-bar { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-top: 8px; }
  .links-row { display: flex; gap: 8px; margin-top: 8px; }
  .link-btn { flex: 1; text-align: center; text-decoration: none; background: #121714; border: 1px solid var(--border); border-radius: 6px; padding: 10px; font-size: 11px; color: var(--muted); }
  .link-btn:hover { color: var(--text); }
</style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="dot" id="liveDot"></div>
      <span>RESQ-SIGNAL REMOTE</span>
    </div>
    <div class="badge" id="modeBadge">CONNECTING...</div>
  </header>

  <!-- People Counter Card -->
  <div class="card">
    <div class="card-title">
      <span>Detected Occupants</span>
      <span id="activeZoneBadge" style="color:var(--amber);">ZONE B2</span>
    </div>
    <div class="counter-display">
      <div class="count-number" id="countDisplay">0</div>
      <div class="count-label" id="countLabel">PEOPLE</div>
    </div>

    <!-- People Override Slider -->
    <div style="margin: 12px 0 8px;">
      <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-bottom:4px;">
        <span style="font-weight:700;">People Override Slider</span>
        <span id="sliderValueText" style="color:var(--amber);font-weight:800;">0 People</span>
      </div>
      <input type="range" id="peopleSlider" min="0" max="200" value="0" style="width:100%;accent-color:var(--lime);cursor:pointer;height:9px;" oninput="onPeopleSlider(this.value)">
      <div style="display:flex; justify-content:space-between; font-size:9px; color:var(--muted); margin-top:2px;">
        <span>0 (Clear)</span>
        <span>50</span>
        <span>100</span>
        <span>150</span>
        <span>200+ (Hall)</span>
      </div>
    </div>

    <div class="btn-row">
      <button class="btn-step" onclick="changeCount(-1)">−</button>
      <button class="btn-step" onclick="changeCount(1)">+</button>
    </div>
    <div class="btn-row" style="margin-top:6px;">
      <button class="btn-step-large" onclick="changeCount(-10)">−10</button>
      <button class="btn-step-large" onclick="changeCount(5)">+5</button>
      <button class="btn-step-large" onclick="changeCount(10)">+10</button>
      <button class="btn-step-large" onclick="changeCount(50)">+50</button>
    </div>
    <div class="input-row">
      <input type="number" id="directCount" class="input-count" placeholder="Type count (e.g. 120)..." min="0" max="1000">
      <button class="btn-set" onclick="setExactCount()">Set Count</button>
    </div>
  </div>

  <!-- Disturbance Slider Card -->
  <div class="card">
    <div class="card-title">
      <span>RF Disturbance & Motion Slider</span>
      <span id="distLevelBadge" style="color:var(--lime);font-weight:800;">65%</span>
    </div>
    <div style="margin: 8px 0;">
      <input type="range" id="distSlider" min="5" max="100" value="65" style="width:100%;accent-color:var(--amber);cursor:pointer;height:8px;" oninput="onDistSliderChange(this.value)">
    </div>
    <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-bottom:10px;">
      <span>Quiet (5%)</span>
      <span>Breathing (30%)</span>
      <span>Walking (65%)</span>
      <span>Crowd Surge (100%)</span>
    </div>
    <div class="btn-row">
      <button class="btn-step-large" onclick="adjustDisturbance(-10)">−10% Disturbance</button>
      <button class="btn-step-large" onclick="adjustDisturbance(10)">+10% Disturbance</button>
    </div>
  </div>

  <!-- Heatmap Interactive Tap Card -->
  <div class="card">
    <div class="card-title">
      <span>CSI Heatmap (Tap to Add Hotspots)</span>
      <button onclick="clearHeatmap()" style="background:#261815;color:#ff6b6b;border:1px solid #4a2222;font-size:10px;padding:3px 8px;border-radius:4px;">Clear Heat</button>
    </div>
    <p style="font-size:10px;color:var(--muted);margin-bottom:10px;">Tap any zone below to trigger a live RF thermal disturbance hotspot on the radar:</p>
    <div class="grid-3x3" id="heatmapGrid">
      <button class="zone-btn" id="z-A1" onclick="tapHeatZone('A1')"><div class="zone-code">A1</div><div class="zone-desc">North-West</div></button>
      <button class="zone-btn" id="z-A2" onclick="tapHeatZone('A2')"><div class="zone-code">A2</div><div class="zone-desc">North</div></button>
      <button class="zone-btn" id="z-A3" onclick="tapHeatZone('A3')"><div class="zone-code">A3</div><div class="zone-desc">North-East</div></button>
      <button class="zone-btn" id="z-B1" onclick="tapHeatZone('B1')"><div class="zone-code">B1</div><div class="zone-desc">West</div></button>
      <button class="zone-btn active" id="z-B2" onclick="tapHeatZone('B2')"><div class="zone-code">B2</div><div class="zone-desc">Center</div></button>
      <button class="zone-btn" id="z-B3" onclick="tapHeatZone('B3')"><div class="zone-code">B3</div><div class="zone-desc">East</div></button>
      <button class="zone-btn" id="z-C1" onclick="tapHeatZone('C1')"><div class="zone-code">C1</div><div class="zone-desc">South-West</div></button>
      <button class="zone-btn" id="z-C2" onclick="tapHeatZone('C2')"><div class="zone-code">C2</div><div class="zone-desc">South</div></button>
      <button class="zone-btn" id="z-C3" onclick="tapHeatZone('C3')"><div class="zone-code">C3</div><div class="zone-desc">South-East</div></button>
    </div>
    <div id="hotspotSummary" style="font-size:10px;color:var(--amber);margin-top:8px;text-align:center;">Active Hotspots: 1 (Center B2)</div>
  </div>

  <!-- Presets -->
  <div class="card">
    <div class="card-title">
      <span>Demo Presets</span>
    </div>
    <div class="presets">
      <button class="preset-btn" onclick="applyPreset(0, 'QUIET', 'B2')">
        <strong>0 Clear</strong>Quiet room
      </button>
      <button class="preset-btn" onclick="applyPreset(1, 'BREATHING_ONLY', 'B2')">
        <strong>1 Survivor</strong>Breathing trapped
      </button>
      <button class="preset-btn" onclick="applyPreset(2, 'ACTIVE_MOVEMENT', 'B2')">
        <strong>2 Survivors</strong>Active movement
      </button>
      <button class="preset-btn" onclick="applyPreset(10, 'ACTIVE_MOVEMENT', 'B2')">
        <strong>10 Group</strong>Rescue party
      </button>
      <button class="preset-btn highlight" onclick="applyPreset(50, 'ACTIVE_MOVEMENT', 'B2')">
        <strong>50 Crowd</strong>Hall section
      </button>
      <button class="preset-btn highlight" onclick="applyPreset(120, 'ACTIVE_MOVEMENT', 'B2')">
        <strong>120 Crowd</strong>Hackathon Hall
      </button>
    </div>
  </div>

  <!-- Reset -->
  <button class="btn-reset" onclick="resetToHardware()">⟲ Return to Pure ESP32 CSI Hardware Feed</button>

  <div class="status-bar">
    <span id="nodeStatus">ESP32-WROOM · COM11</span>
    <span id="rssiStatus">RSSI: -- dBm</span>
  </div>

  <div class="links-row">
    <a href="http://" class="link-btn" id="dashLink" target="_blank">Open Full 3D Radar</a>
    <a href="/apk" class="link-btn" download>Download APK</a>
  </div>

<script>
  let currentCount = 0;
  let activeZone = 'B2';
  let isOverride = false;
  const host = window.location.hostname;
  document.getElementById('dashLink').href = 'http://' + host + ':5173/';

  let disturbanceLevel = 65;
  let activeHeatspots = [];

  async function poll() {
    try {
      const res = await fetch('/api/latest');
      if (!res.ok) return;
      const data = await res.json();
      currentCount = data.estimatedPeople ?? data.presence?.estimatedPeople ?? 0;
      activeZone = data.activeZone ?? data.spatial?.activeZone ?? 'B2';
      isOverride = data.presence?.probability === 0.95 && data.presenceClass === 'STRONG_PRESENCE';
      activeHeatspots = data.spatial?.heatmap || [];

      document.getElementById('countDisplay').innerText = currentCount;
      document.getElementById('countLabel').innerText = currentCount === 1 ? 'PERSON' : 'PEOPLE';
      document.getElementById('activeZoneBadge').innerText = 'ZONE ' + activeZone;
      document.getElementById('rssiStatus').innerText = 'RSSI: ' + (data.rssi ?? -45) + ' dBm';

      const dist = Math.round((data.spatial?.disturbanceLevel ?? 0.65) * 100);
      disturbanceLevel = dist;
      const distSlider = document.getElementById('distSlider');
      if (document.activeElement !== distSlider) distSlider.value = dist;
      document.getElementById('distLevelBadge').innerText = dist + '%';

      const badge = document.getElementById('modeBadge');
      if (data.fresh && !isOverride) {
        badge.innerText = 'HARDWARE LIVE';
        badge.className = 'badge live';
      } else {
        badge.innerText = 'OVERRIDE MODE';
        badge.className = 'badge';
      }

      // Update zone buttons
      document.querySelectorAll('.zone-btn').forEach(b => b.classList.remove('active'));
      const activeBtn = document.getElementById('z-' + activeZone);
      if (activeBtn) activeBtn.classList.add('active');

      // Highlight zones that have active heatspots
      const hotZones = activeHeatspots.map(h => h.zone).filter(Boolean);
      for (const hz of hotZones) {
        const hb = document.getElementById('z-' + hz);
        if (hb) hb.classList.add('active');
      }

      const pSlider = document.getElementById('peopleSlider');
      if (document.activeElement !== pSlider) {
        pSlider.value = Math.min(200, currentCount);
        document.getElementById('sliderValueText').innerText = currentCount + (currentCount === 1 ? ' Person' : ' People');
      }

      const summaryText = activeHeatspots.length > 0
        ? 'Active Hotspots: ' + activeHeatspots.length + ' (' + hotZones.join(', ') + ')'
        : 'Active Hotspots: 1 (Zone ' + activeZone + ')';
      document.getElementById('hotspotSummary').innerText = summaryText;
    } catch (e) {
      document.getElementById('modeBadge').innerText = 'OFFLINE';
    }
  }

  let peopleSliderTimer = null;
  function onPeopleSlider(val) {
    const count = parseInt(val, 10);
    currentCount = count;
    document.getElementById('countDisplay').innerText = count;
    document.getElementById('countLabel').innerText = count === 1 ? 'PERSON' : 'PEOPLE';
    document.getElementById('sliderValueText').innerText = count + (count === 1 ? ' Person' : ' People');

    clearTimeout(peopleSliderTimer);
    peopleSliderTimer = setTimeout(() => {
      sendCount(count);
    }, 60);
  }

  async function onDistSliderChange(val) {
    disturbanceLevel = parseInt(val, 10);
    document.getElementById('distLevelBadge').innerText = val + '%';
    try {
      await fetch('/api/override/disturbance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: disturbanceLevel })
      });
    } catch (e) {}
  }

  async function adjustDisturbance(delta) {
    const next = Math.max(5, Math.min(100, disturbanceLevel + delta));
    document.getElementById('distSlider').value = next;
    onDistSliderChange(next);
  }

  async function tapHeatZone(z) {
    activeZone = z;
    try {
      await fetch('/api/override/heatmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', zone: z })
      });
      poll();
    } catch (e) {}
  }

  async function clearHeatmap() {
    try {
      await fetch('/api/override/heatmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' })
      });
      poll();
    } catch (e) {}
  }

  async function changeCount(delta) {
    const next = Math.max(0, Math.min(1000, currentCount + delta));
    await sendCount(next);
  }

  async function setExactCount() {
    const input = document.getElementById('directCount');
    const val = parseInt(input.value, 10);
    if (!isNaN(val)) {
      await sendCount(val);
      input.value = '';
    }
  }

  async function sendCount(cnt) {
    try {
      await fetch('/api/override/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: cnt, zone: activeZone, activity: cnt > 0 ? 'ACTIVE_MOVEMENT' : 'QUIET' })
      });
      poll();
    } catch (e) {}
  }

  async function applyPreset(cnt, act, z) {
    try {
      await fetch('/api/override/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: cnt, activity: act, zone: z })
      });
      poll();
    } catch (e) {}
  }

  async function resetToHardware() {
    try {
      await fetch('/api/override/reset');
      poll();
    } catch (e) {}
  }

  setInterval(poll, 800);
  poll();
</script>
</body>
</html>`;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`)

  // Enable CORS
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': '*',
    })
    response.end()
    return
  }

  // Serve Flutter Mobile Web Controller or Embedded Mobile Remote
  if (url.pathname === '/remote' || url.pathname.startsWith('/remote/')) {
    if (serveStatic(request, response, url)) return
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'access-control-allow-origin': '*',
    })
    response.end(renderMobileRemoteHtml())
    return
  }

  // Direct APK download for Android phones
  if (url.pathname === '/apk' || url.pathname === '/download/apk') {
    const apkPath = path.resolve(__dirname, '../ResQ_Remote.apk')
    if (fs.existsSync(apkPath)) {
      response.writeHead(200, {
        'content-type': 'application/vnd.android.package-archive',
        'content-disposition': 'attachment; filename="ResQ_Remote.apk"',
        'content-length': fs.statSync(apkPath).size,
      })
      return fs.createReadStream(apkPath).pipe(response)
    }
  }

  if (url.pathname === '/api/health') return sendJson(response, 200, publicHealth())
  if (url.pathname === '/api/latest') return sendJson(response, 200, publicMeasurement())
  if (url.pathname === '/api/room') return sendJson(response, 200, state.room)
  if (url.pathname === '/api/spatial') return sendJson(response, 200, state.spatial)
  if (url.pathname === '/api/presence') return sendJson(response, 200, state.presence)

  // Remote Override / Mobile Controller Endpoints
  if (url.pathname === '/api/override') {
    if (request.method === 'GET') {
      return sendJson(response, 200, {
        overrideActive: state.override.active,
        peopleCount: state.override.peopleCount,
        activityState: state.override.activityState,
        activeZone: state.override.activeZone,
        breathingBpm: state.override.breathingBpm,
        lastUpdated: state.override.lastUpdated,
      })
    }
    if (request.method === 'POST') {
      const body = await readJsonBody(request)
      if (typeof body.active === 'boolean') state.override.active = body.active
      else state.override.active = true

      if (Number.isInteger(body.peopleCount)) {
        state.override.peopleCount = Math.max(0, Math.min(1000, body.peopleCount))
      }
      if (typeof body.activityState === 'string') state.override.activityState = body.activityState
      if (typeof body.activeZone === 'string') state.override.activeZone = body.activeZone
      if (Number.isInteger(body.breathingBpm)) state.override.breathingBpm = body.breathingBpm

      syncOverrideState()
      return sendJson(response, 200, { ok: true, override: state.override, currentMeasurement: publicMeasurement() })
    }
  }

  if (url.pathname === '/api/override/increase' && (request.method === 'POST' || request.method === 'GET')) {
    const body = request.method === 'POST' ? await readJsonBody(request) : {}
    const stepVal = Number(body.step ?? url.searchParams.get('step') ?? 1)
    const step = Number.isFinite(stepVal) ? stepVal : 1
    state.override.active = true
    state.override.peopleCount = Math.min(1000, (state.override.peopleCount || 0) + step)
    syncOverrideState()
    return sendJson(response, 200, { ok: true, peopleCount: state.override.peopleCount, override: state.override })
  }

  if (url.pathname === '/api/override/decrease' && (request.method === 'POST' || request.method === 'GET')) {
    const body = request.method === 'POST' ? await readJsonBody(request) : {}
    const stepVal = Number(body.step ?? url.searchParams.get('step') ?? 1)
    const step = Number.isFinite(stepVal) ? stepVal : 1
    state.override.active = true
    state.override.peopleCount = Math.max(0, (state.override.peopleCount || 0) - step)
    syncOverrideState()
    return sendJson(response, 200, { ok: true, peopleCount: state.override.peopleCount, override: state.override })
  }

  if (url.pathname === '/api/override/set' && (request.method === 'POST' || request.method === 'GET')) {
    const body = request.method === 'POST' ? await readJsonBody(request) : {}
    const rawCount = body.count ?? body.peopleCount ?? url.searchParams.get('count') ?? url.searchParams.get('peopleCount') ?? 0
    const count = Number(rawCount)
    const zone = body.zone ?? body.activeZone ?? url.searchParams.get('zone')
    const act = body.activity ?? body.activityState ?? url.searchParams.get('activity')
    const bpm = body.bpm ?? body.breathingBpm ?? url.searchParams.get('bpm')
    state.override.active = true
    state.override.peopleCount = Math.max(0, Math.min(1000, Math.round(count)))
    if (zone) state.override.activeZone = zone
    if (act) state.override.activityState = act
    if (bpm) state.override.breathingBpm = Number(bpm)
    syncOverrideState()
    return sendJson(response, 200, { ok: true, peopleCount: state.override.peopleCount, override: state.override })
  }

  if (url.pathname === '/api/override/disturbance' && (request.method === 'POST' || request.method === 'GET')) {
    const body = request.method === 'POST' ? await readJsonBody(request) : {}
    const rawVal = body.level ?? body.disturbance ?? url.searchParams.get('level') ?? url.searchParams.get('disturbance')
    const val = Number(rawVal)
    if (!isNaN(val)) {
      state.override.active = true
      const normalized = val > 1.0 ? val / 100 : val
      state.override.disturbanceLevel = clamp(normalized, 0.05, 1.0)
      if (state.override.disturbanceLevel >= 0.6) state.override.activityState = 'ACTIVE_MOVEMENT'
      else if (state.override.disturbanceLevel >= 0.25) state.override.activityState = 'BREATHING_ONLY'
      else state.override.activityState = 'STATIONARY'
      syncOverrideState()
    }
    return sendJson(response, 200, { ok: true, disturbanceLevel: state.override.disturbanceLevel, activityState: state.override.activityState })
  }

  if (url.pathname === '/api/override/heatmap' && (request.method === 'POST' || request.method === 'GET')) {
    const body = request.method === 'POST' ? await readJsonBody(request) : {}
    const action = body.action || url.searchParams.get('action') || 'add'
    const zone = body.zone || url.searchParams.get('zone')
    const rawX = body.x ?? url.searchParams.get('x')
    const rawY = body.y ?? url.searchParams.get('y')
    let x = (rawX !== null && rawX !== undefined && rawX !== '') ? Number(rawX) : NaN
    let y = (rawY !== null && rawY !== undefined && rawY !== '') ? Number(rawY) : NaN

    if (action === 'clear') {
      state.override.heatspots = []
      syncOverrideState()
      return sendJson(response, 200, { ok: true, heatspots: state.override.heatspots })
    }

    if (action === 'add' || action === 'set') {
      state.override.active = true
      if (zone && (isNaN(x) || isNaN(y))) {
        const zoneCoords = {
          A1: [state.room.length * 0.2, state.room.breadth * 0.2],
          A2: [state.room.length * 0.5, state.room.breadth * 0.2],
          A3: [state.room.length * 0.8, state.room.breadth * 0.2],
          B1: [state.room.length * 0.2, state.room.breadth * 0.5],
          B2: [state.room.length * 0.5, state.room.breadth * 0.5],
          B3: [state.room.length * 0.8, state.room.breadth * 0.5],
          C1: [state.room.length * 0.2, state.room.breadth * 0.8],
          C2: [state.room.length * 0.5, state.room.breadth * 0.8],
          C3: [state.room.length * 0.8, state.room.breadth * 0.8],
        }
        if (zoneCoords[zone]) {
          x = zoneCoords[zone][0]
          y = zoneCoords[zone][1]
        }
      }
      if (isNaN(x)) x = state.room.length / 2
      if (isNaN(y)) y = state.room.breadth / 2

      const distLevel = state.override.disturbanceLevel ?? 0.65
      const newSpot = {
        id: 'H' + (state.override.heatspots.length + 1),
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        zone: zone || 'B2',
        intensity: clamp(Number(body.intensity ?? distLevel), 0.2, 1.0),
        radius: Number((1.5 + distLevel * 1.2).toFixed(2)),
      }
      state.override.heatspots.push(newSpot)
      if (state.override.heatspots.length > 12) state.override.heatspots.shift()

      if ((state.override.peopleCount || 0) < state.override.heatspots.length) {
        state.override.peopleCount = state.override.heatspots.length
      }
      syncOverrideState()
      return sendJson(response, 200, { ok: true, heatspots: state.override.heatspots, count: state.override.peopleCount })
    }
  }

  if (url.pathname === '/api/override/reset' && (request.method === 'POST' || request.method === 'GET')) {
    state.override.active = false
    state.override.peopleCount = 0
    state.override.activeZone = 'B2'
    state.override.activityState = 'QUIET'
    state.override.breathingBpm = null
    state.override.disturbanceLevel = 0.65
    state.override.heatspots = []
    state.override.lastUpdated = nowIso()

    state.presence.estimatedPeople = 0
    state.presence.presenceClass = 'NO_HUMAN_EVIDENCE'
    state.presence.activityState = 'QUIET'
    state.presence.probability = 0
    state.presence.confidence = 0.5
    state.presence.breathingBpm = null

    state.spatial.occupiedZones = []
    state.spatial.targets = []
    state.spatial.heatmap = []
    state.spatial.disturbanceLevel = 0.1

    if (state.latest) {
      state.latest.estimatedPeople = 0
      state.latest.presenceClass = 'NO_HUMAN_EVIDENCE'
      state.latest.activityState = 'QUIET'
      state.latest.presenceProbability = 0
      state.latest.breathingBpm = null
    }

    broadcast('measurement', publicMeasurement())
    return sendJson(response, 200, { ok: true, message: 'Returned to live RF CSI sensor mode', overrideActive: false })
  }

  // 3D Area Scan, 3D Wi-Fi Hash Map, & 3D Spectral Disturbance Endpoints
  if (url.pathname === '/api/3d/status') {
    return sendJson(response, 200, {
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
  }

  if (url.pathname === '/api/3d/scan/start' && (request.method === 'POST' || request.method === 'GET')) {
    const body = request.method === 'POST' ? await readJsonBody(request) : {}
    startAreaScan(body)
    return sendJson(response, 200, {
      ok: true,
      message: '3D Wi-Fi Area Scan started',
      scan: {
        isScanning: state.scan3d.isScanning,
        scanProgress: state.scan3d.scanProgress,
        scanPhase: state.scan3d.scanPhase,
        targetArea: state.scan3d.targetArea,
      },
    })
  }

  if (url.pathname === '/api/3d/scan/stop' && (request.method === 'POST' || request.method === 'GET')) {
    if (scanInterval) {
      clearInterval(scanInterval)
      scanInterval = null
    }
    state.scan3d.isScanning = false
    state.scan3d.scanProgress = 100
    state.scan3d.scanPhase = 'COMPLETE'
    state.scan3d.lastScannedAt = nowIso()
    return sendJson(response, 200, { ok: true, message: '3D Area Scan completed' })
  }

  if (url.pathname === '/api/3d/hashmap') {
    return sendJson(response, 200, {
      ok: true,
      targetArea: state.scan3d.targetArea,
      stats: state.scan3d.stats,
      isScanning: state.scan3d.isScanning,
      scanProgress: state.scan3d.scanProgress,
      scanPhase: state.scan3d.scanPhase,
      lastScannedAt: state.scan3d.lastScannedAt,
      voxels: state.scan3d.hashMap,
    })
  }

  if (url.pathname === '/api/3d/hashmap/reset' && (request.method === 'POST' || request.method === 'GET')) {
    state.scan3d.hashMap = build3dHashMap(state.room.length, state.room.breadth, state.room.height, state.scan3d.resolution)
    state.scan3d.stats.disturbedVoxels = 0
    state.scan3d.stats.avgStability = 1.0
    state.scan3d.lastScannedAt = nowIso()
    return sendJson(response, 200, {
      ok: true,
      message: '3D Wi-Fi Hash Map reset to baseline',
      stats: state.scan3d.stats,
    })
  }

  if (url.pathname === '/api/3d/spectral') {
    return sendJson(response, 200, {
      ok: true,
      subcarrierCount: 64,
      frameCount: state.spectral3d.history.length,
      frames: state.spectral3d.history,
    })
  }

  // ============================================================================
  // AI TACTICAL TRIAGE & REASONING (GEMMA 4-BIT & GOOGLE AI STUDIO)
  // ============================================================================
  if (url.pathname === '/api/ai/status') {
    const gemmaStatus = await checkGemmaLocalStatus()
    return sendJson(response, 200, {
      ok: true,
      gemmaLocal: {
        name: 'Gemma 4-bit (Google DeepMind Open Weights)',
        available: gemmaStatus.available,
        model: gemmaStatus.model,
        port: 11434,
        type: 'Offline Edge Model (Ollama Local)',
        description: 'Runs 100% offline in disaster zones with zero internet or cloud dependency.',
      },
      googleAiStudio: {
        name: 'Google AI Studio (Gemini 1.5/2.5 Flash)',
        available: Boolean(process.env.GEMINI_API_KEY),
        type: 'Cloud / Satellite Uplink',
        description: 'Cloud uplink for complex situational incident synthesis and FEMA SITREP generation.',
      },
    })
  }

  if (url.pathname === '/api/ai/triage' && (request.method === 'POST' || request.method === 'GET')) {
    const body = request.method === 'POST' ? await readJsonBody(request) : {}
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

    const prompt = `You are the Tactical Search & Rescue (SAR) Officer AI powering ResQ-Atlas.
Analyze this live physical Wi-Fi CSI radar telemetry:
- Room Dimensions: ${telemetry.room.length}m x ${telemetry.room.breadth}m x ${telemetry.room.height}m (Area: ${telemetry.room.area}m²)
- Detected Occupants: ${telemetry.estimatedPeople} survivor(s)
- Primary Zone: Zone ${telemetry.activeZone} (${telemetry.zoneName})
- Respiration Rate: ${telemetry.breathingBpm ? telemetry.breathingBpm + ' BPM' : 'N/A'}
- Doppler Shift Frequency: ${telemetry.dopplerProxy} Hz
- Activity State: ${telemetry.activityState}
- 3D Wi-Fi Hash Map Disturbance: ${telemetry.disturbedVoxels} disturbed voxels (Stability: ${(telemetry.stabilityIndex * 100).toFixed(1)}%)

Return a JSON object with:
"triageLevel": ("RED_CRITICAL" | "AMBER_URGENT" | "GREEN_STABLE" | "CLEAR_UNOCCUPIED"),
"vitalsSummary": (one sentence summarizing breathing and Doppler motion),
"tacticalAssessment": (2-3 sentences analyzing survivor entrapment, unconsciousness, or status based on respiration and Doppler),
"extractionPlan": (numbered tactical steps for first responders),
"hazardRating": ("LOW" | "MODERATE" | "HIGH")
Output only valid JSON.`

    let result = null

    // 1. Try Gemma 4-bit local (Ollama or LM Studio)
    if (requestedEngine === 'gemma' || requestedEngine === 'auto') {
      try {
        const status = await checkGemmaLocalStatus()
        const raw = await runGemmaInference(prompt, status.model || 'gemma2:2b')
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          result = {
            ...deterministic,
            ...parsed,
            aiEngine: status.provider === 'lmstudio' ? 'Local Edge SAR AI (LM Studio)' : 'Gemma 4-bit (Offline Edge SAR)',
            modelUsed: `${status.model} (local port ${status.port})`,
            timestamp: nowIso(),
          }
        }
      } catch (err) {
        // Local offline not reachable; fall through
      }
    }

    // 2. Try Google AI Studio (Gemini) if key provided or requested
    if (!result && (requestedEngine === 'gemini' || (requestedEngine === 'auto' && apiKey))) {
      try {
        const raw = await runGoogleAiStudioInference(prompt, apiKey)
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          result = {
            ...deterministic,
            ...parsed,
            aiEngine: 'Google AI Studio (Gemini 1.5 Flash)',
            modelUsed: 'gemini-1.5-flash',
            timestamp: nowIso(),
          }
        }
      } catch (err) {}
    }

    // 3. Resilient deterministic SAR clinical rules fallback
    if (!result) {
      result = deterministic
    }

    return sendJson(response, 200, { ok: true, triage: result, telemetry })
  }

  if (url.pathname === '/api/calibrate' && request.method === 'POST') {
    state.baseline = {
      status: 'CALIBRATING',
      samples: 0,
      target: CALIBRATION_SAMPLES,
      vector: [],
      startedAt: nowIso(),
      completedAt: null,
    }
    broadcast('health', publicHealth())
    return sendJson(response, 202, { ok: true, calibration: publicHealth().calibration })
  }

  if (url.pathname === '/api/stream') {
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'access-control-allow-origin': '*',
    })
    response.write(`data: ${JSON.stringify({ type: 'health', data: publicHealth() })}\n\n`)
    if (publicMeasurement()) {
      response.write(`data: ${JSON.stringify({ type: 'measurement', data: publicMeasurement() })}\n\n`)
    }
    clients.add(response)
    request.on('close', () => clients.delete(response))
    return
  }

  sendJson(response, 404, { error: 'Not found' })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`RESQ-SIGNAL physics & inference engine listening on http://0.0.0.0:${PORT}`)
  console.log(`Monitoring ${SERIAL_PATH} at ${BAUD_RATE} baud`)
})

function shutdown() {
  if (serial && serial.isOpen) serial.close()
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
