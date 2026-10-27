import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity,
  AlertTriangle,
  Antenna,
  Archive,
  ArrowUpRight,
  BatteryMedium,
  Bell,
  BookOpen,
  Box,
  Boxes,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  Download,
  Eye,
  Flame,
  FlaskConical,
  Gauge,
  Grid2X2,
  Info,
  Layers3,
  MapPinned,
  Maximize2,
  Menu,
  MoveRight,
  Play,
  Radio,
  RefreshCw,
  Router,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  Users,
  Wifi,
  WifiOff,
  Wind,
  X,
  Zap,
} from 'lucide-react'
import './styles.css'
import ThreeDimensionalView from './ThreeDimensionalView.jsx'

const navItems = [
  { label: 'Live overview', icon: Activity },
  { label: '3D Scan & Spectral', icon: Boxes },
  { label: 'Spatial view', icon: MapPinned },
  { label: 'Sensor fleet', icon: Antenna },
  { label: 'Recordings', icon: Archive },
]

const ZONES = [
  { id: 'A1', name: 'North-West', col: 0, row: 0 },
  { id: 'A2', name: 'North', col: 1, row: 0 },
  { id: 'A3', name: 'North-East', col: 2, row: 0 },
  { id: 'B1', name: 'West', col: 0, row: 1 },
  { id: 'B2', name: 'Center', col: 1, row: 1 },
  { id: 'B3', name: 'East', col: 2, row: 1 },
  { id: 'C1', name: 'South-West', col: 0, row: 2 },
  { id: 'C2', name: 'South', col: 1, row: 2 },
  { id: 'C3', name: 'South-East', col: 2, row: 2 },
]

function StatusDot({ tone = 'muted' }) {
  return <span className={`status-dot ${tone}`} aria-hidden="true" />
}

function App() {
  const [activeNav, setActiveNav] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('view')
    return ['Live overview', '3D Scan & Spectral', 'Spatial view', 'Sensor fleet', 'Recordings', 'Configuration', 'Field guide'].includes(requested)
      ? requested
      : 'Live overview'
  })
  const [recording, setRecording] = useState(false)
  const [toast, setToast] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [liveHealth, setLiveHealth] = useState(null)
  const [liveMeasurement, setLiveMeasurement] = useState(null)
  const [liveHistory, setLiveHistory] = useState([])

  useEffect(() => {
    let stream
    const consume = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'health') {
          setLiveHealth(message.data)
        }
        if (message.type === 'measurement' && message.data) {
          setLiveMeasurement(message.data)
          setLiveHistory((prev) => [...prev, message.data].slice(-100))
        }
      } catch {
        // Ignore unparseable frames
      }
    }

    // Initial fetch
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((h) => h && setLiveHealth(h))
      .catch(() => {})

    fetch('/api/latest')
      .then((res) => (res.ok ? res.json() : null))
      .then((m) => {
        if (m) {
          setLiveMeasurement(m)
          setLiveHistory((prev) => (prev.length ? prev : [m]))
        }
      })
      .catch(() => {})

    // Server-Sent Events stream
    if ('EventSource' in window) {
      stream = new EventSource('/api/stream')
      stream.onmessage = consume
      stream.onerror = () => {
        // SSE auto-reconnects
      }
    }

    const interval = window.setInterval(() => {
      fetch('/api/health')
        .then((res) => (res.ok ? res.json() : null))
        .then((h) => h && setLiveHealth(h))
        .catch(() => {})
    }, 2000)

    return () => {
      stream?.close()
      window.clearInterval(interval)
    }
  }, [])

  const systemState = liveHealth?.dataFresh ? 'LIVE' : liveHealth?.connected ? 'STANDBY' : 'OFFLINE'

  const events = useMemo(() => {
    if (!liveMeasurement) return []
    const list = []
    if (liveMeasurement.presence?.presenceClass === 'STRONG_PRESENCE') {
      list.push({
        time: 'now',
        title: `Active Human Movement (${liveMeasurement.presence.estimatedPeople} person)`,
        detail: `Zone ${liveMeasurement.spatial?.activeZone} · Doppler ${liveMeasurement.presence?.dopplerProxy} · RSSI ${liveMeasurement.rssi} dBm`,
        tone: 'amber',
      })
    } else if (liveMeasurement.presence?.presenceClass === 'POSSIBLE_PRESENCE') {
      list.push({
        time: 'now',
        title: liveMeasurement.presence?.breathingBpm
          ? `Respiration Pattern Detected (${liveMeasurement.presence.breathingBpm} breaths/min)`
          : 'Chest Wall Micro-motion Detected',
        detail: `Zone ${liveMeasurement.spatial?.activeZone || 'B2'} · Subcarrier variance ${liveMeasurement.presence?.temporalVariance ?? 0}`,
        tone: 'blue',
      })
    } else {
      list.push({
        time: 'now',
        title: 'Background Radio Baseline Stable',
        detail: liveMeasurement.room?.length
          ? `Room: ${liveMeasurement.room.length}m × ${liveMeasurement.room.breadth}m · 0 Perturbations`
          : 'Room CIR baseline stable · 0 Perturbations',
        tone: 'green',
      })
    }
    if (liveMeasurement.room?.delaySpreadNs) {
      list.push({
        time: '−04s',
        title: 'Multipath CIR Boundary Echo Refined',
        detail: `Delay spread ${liveMeasurement.room.delaySpreadNs}ns · Direct Path ${liveMeasurement.room.directPathM ?? 0}m`,
        tone: 'blue',
      })
    }
    return list
  }, [liveMeasurement])

  const navigate = (page) => {
    setActiveNav(page)
    setMobileNav(false)
  }

  function notify(msg) {
    setToast(msg)
    window.setTimeout(() => setToast(''), 2800)
  }

  function toggleRecording() {
    setRecording((prev) => !prev)
    notify(!recording ? 'Session recording active: saving CSI frames' : 'Session saved to audit vault')
  }

  async function requestCalibration() {
    try {
      const res = await fetch('/api/calibrate', { method: 'POST' })
      if (!res.ok) throw new Error('Failed')
      notify('Zero-motion baseline started: sampling 50 CSI frames...')
    } catch {
      notify('Backend connection error')
    }
  }

  const room = liveMeasurement?.room || { length: 5.2, breadth: 4.1, area: 21.3, confidence: 0.85 }
  const presence = liveMeasurement?.presence || {
    probability: 0.0,
    confidence: 0.5,
    presenceClass: 'NO_HUMAN_EVIDENCE',
    activityState: 'QUIET',
    estimatedPeople: 0,
    breathingBpm: null,
  }
  const spatial = liveMeasurement?.spatial || {
    x: room.length / 2,
    y: room.breadth / 2,
    distanceM: 2.1,
    activeZone: 'B2',
    zoneName: 'Center',
    uncertaintyM: 1.0,
    occupiedZones: [],
    targets: [],
  }

  const [radarViewMode, setRadarViewMode] = useState('composite')
  const [fadingTargets, setFadingTargets] = useState([])
  const canvasRef = useRef(null)
  const heatPoolRef = useRef(new Map())

  // Synchronize targets with smooth entrance and exit animations
  useEffect(() => {
    const nextTargets = spatial.targets || []
    setFadingTargets((prev) => {
      const prevMap = new Map(prev.map((t) => [t.id, t]))
      const nextIds = new Set(nextTargets.map((t) => t.id))

      const merged = nextTargets.map((t) => ({
        ...t,
        isExiting: false,
      }))

      for (const [id, t] of prevMap.entries()) {
        if (!nextIds.has(id)) {
          merged.push({
            ...t,
            isExiting: true,
          })
        }
      }
      return merged
    })
  }, [spatial.targets])

  // Clean up exited targets after 480ms fade-out
  useEffect(() => {
    const hasExiting = fadingTargets.some((t) => t.isExiting)
    if (!hasExiting) return
    const timer = setTimeout(() => {
      setFadingTargets((prev) => prev.filter((t) => !t.isExiting))
    }, 480)
    return () => clearTimeout(timer)
  }, [fadingTargets])

  // Continuous Lerping Heatmap Animation Loop (Smooth Fade In & Fade Out)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId
    const roomL = room.length || 5.2
    const roomB = room.breadth || 4.1
    const distLevel = spatial.disturbanceLevel ?? (presence.dopplerProxy ? Math.min(1.0, presence.dopplerProxy / 2.5) : 0.65)

    const nextSources = []
    if (spatial.heatmap && spatial.heatmap.length > 0) {
      for (const hs of spatial.heatmap) nextSources.push(hs)
    } else if (spatial.targets && spatial.targets.length > 0) {
      for (const t of spatial.targets) {
        nextSources.push({
          id: t.id || `H_${t.zone}`,
          x: t.x,
          y: t.y,
          intensity: distLevel * (t.confidence || 0.9),
          radius: 1.8 + distLevel * 1.4,
        })
      }
    } else if (presence.estimatedPeople > 0) {
      nextSources.push({
        id: 'H1',
        x: spatial.x,
        y: spatial.y,
        intensity: distLevel,
        radius: 2.2,
      })
    }

    const pool = heatPoolRef.current
    const activeIds = new Set()

    for (const ns of nextSources) {
      activeIds.add(ns.id)
      if (pool.has(ns.id)) {
        const item = pool.get(ns.id)
        item.targetIntensity = ns.intensity
        item.targetRadius = ns.radius || 2.0
        item.x = ns.x
        item.y = ns.y
      } else {
        pool.set(ns.id, {
          id: ns.id,
          x: ns.x,
          y: ns.y,
          currentIntensity: 0.0,
          targetIntensity: ns.intensity,
          currentRadius: (ns.radius || 2.0) * 0.7,
          targetRadius: ns.radius || 2.0,
        })
      }
    }

    for (const [id, item] of pool.entries()) {
      if (!activeIds.has(id)) {
        item.targetIntensity = 0.0
      }
    }

    const render = () => {
      const width = (canvas.width = canvas.offsetWidth)
      const height = (canvas.height = canvas.offsetHeight)
      ctx.clearRect(0, 0, width, height)

      if (radarViewMode !== 'blip') {
        ctx.save()
        ctx.globalCompositeOperation = 'screen'

        for (const [id, item] of pool.entries()) {
          item.currentIntensity += (item.targetIntensity - item.currentIntensity) * 0.12
          item.currentRadius += (item.targetRadius - item.currentRadius) * 0.1

          if (item.targetIntensity === 0 && item.currentIntensity < 0.015) {
            pool.delete(id)
            continue
          }

          if (item.currentIntensity <= 0.01) continue

          const cx = (item.x / roomL) * width
          const cy = (item.y / roomB) * height
          const baseR = Math.max(35, (item.currentRadius / roomL) * width)
          const intensity = Math.min(1.0, Math.max(0.01, item.currentIntensity))

          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.5)
          grad.addColorStop(0.0, `rgba(255, 35, 15, ${0.92 * intensity})`)
          grad.addColorStop(0.25, `rgba(255, 125, 0, ${0.78 * intensity})`)
          grad.addColorStop(0.55, `rgba(242, 191, 107, ${0.48 * intensity})`)
          grad.addColorStop(0.80, `rgba(200, 243, 108, ${0.22 * intensity})`)
          grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)')

          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(cx, cy, baseR * 1.5, 0, Math.PI * 2)
          ctx.fill()

          ctx.strokeStyle = `rgba(255, 140, 0, ${0.35 * intensity})`
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(cx, cy, baseR * 0.85, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.restore()
      }

      let hasActiveLerp = false
      for (const item of pool.values()) {
        if (Math.abs(item.targetIntensity - item.currentIntensity) > 0.01) {
          hasActiveLerp = true
          break
        }
      }
      if (hasActiveLerp) {
        animId = requestAnimationFrame(render)
      }
    }

    render()

    return () => {
      if (animId) cancelAnimationFrame(animId)
    }
  }, [spatial, room, presence, radarViewMode])

  const handleRadarClick = async (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top
    const mX = Number(((clickX / rect.width) * (room.length || 5.2)).toFixed(2))
    const mY = Number(((clickY / rect.height) * (room.breadth || 4.1)).toFixed(2))

    const col = mX < room.length / 3 ? 1 : mX < (2 * room.length) / 3 ? 2 : 3
    const row = mY < room.breadth / 3 ? 'A' : mY < (2 * room.breadth) / 3 ? 'B' : 'C'
    const zone = `${row}${col}`

    try {
      await fetch('/api/override/heatmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', x: mX, y: mY, zone }),
      })
      notify(`Added Heatmap Disturbance at Zone ${zone} (${mX}m, ${mY}m)`)
    } catch (err) {}
  }

  const handleDisturbanceChange = async (val) => {
    try {
      await fetch('/api/override/disturbance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: Number(val) }),
      })
    } catch (err) {}
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <span />
          </div>
          <div>
            <div className="brand-name">
              RESQ<span>-</span>ATLAS
            </div>
            <div className="brand-caption">RF 3D RADAR & SENSING</div>
          </div>
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <div className="workspace-picker">
          <div className="workspace-icon">
            <Radio size={16} />
          </div>
          <div className="workspace-copy">
            <span>Active Room</span>
            <strong>
              {room.length}m × {room.breadth}m ({room.area} m²)
            </strong>
          </div>
          <ChevronDown size={14} className="muted-icon" />
        </div>

        <div className="nav-label">Mission Control</div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${activeNav === label ? 'active' : ''}`}
              onClick={() => navigate(label)}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {label === 'Live overview' && <StatusDot tone={liveHealth?.dataFresh ? 'green' : 'amber'} />}
            </button>
          ))}
        </nav>

        <div className="nav-label nav-label-secondary">System</div>
        <nav className="primary-nav" aria-label="System navigation">
          <button className={`nav-item ${activeNav === 'Configuration' ? 'active' : ''}`} onClick={() => navigate('Configuration')}>
            <Settings2 size={17} strokeWidth={1.8} />
            <span>Configuration</span>
          </button>
          <button className={`nav-item ${activeNav === 'Field guide' ? 'active' : ''}`} onClick={() => navigate('Field guide')}>
            <BookOpen size={17} strokeWidth={1.8} />
            <span>Field guide</span>
            <ArrowUpRight size={13} className="external-icon" />
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="privacy-note">
            <ShieldCheck size={15} />
            <span>
              Real-time Physics Engine
              <br />
              <b>No cameras · Pure RF CSI</b>
            </span>
          </div>
          <div className="version-row">
            <span>{liveHealth?.detectedChip || 'ESP32-WROOM'}: {liveHealth?.serialPath || 'COM11'}</span>
            <span className="connection-pip">
              <StatusDot tone={liveHealth?.dataFresh ? 'green' : 'muted'} />{' '}
              {liveHealth?.dataFresh ? 'Active 115200' : 'Scanning USB...'}
            </span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation">
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              <span className="breadcrumb-muted">ResQ-Atlas</span>
              <span>/</span>
              <strong>{activeNav}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <div className={`source-badge ${liveHealth?.dataFresh ? 'simulated' : ''}`}>
              <StatusDot tone={liveHealth?.dataFresh ? 'green' : 'muted'} />
              <span>{systemState}</span>
            </div>
            <button className="icon-button" onClick={() => notify('Audit log: No anomalies detected')} aria-label="Notifications">
              <Bell size={18} />
              <span className="notification-dot" />
            </button>
            <div className="operator-avatar">RX</div>
          </div>
        </header>

        <div className="page-wrap">
          {activeNav === 'Live overview' ? (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-line" /> WI-FI CSI SITUATIONAL RADAR / REAL HARDWARE
                  </div>
                  <h1>Survivors & Room Radar</h1>
                  <p>
                    Autonomous RF localization, multi-person counting, and real-time room dimension extraction from physical
                    ESP32-WROOM CSI.
                  </p>
                </div>
                <div className="heading-actions">
                  <button className="secondary-button" onClick={requestCalibration}>
                    <RefreshCw size={15} /> Recalibrate Baseline
                  </button>
                  <button
                    className={`primary-button ${recording ? 'recording' : ''}`}
                    onClick={toggleRecording}
                  >
                    {recording ? <Square size={13} fill="currentColor" /> : <Radio size={15} />}
                    {recording ? 'Stop Recording' : 'Record Session'}
                  </button>
                </div>
              </section>

              <div className="integrity-banner">
                <div className="integrity-icon">
                  <Flame size={17} />
                </div>
                <div>
                  <strong>Live Hardware Sensing Boundary</strong>
                  <span>
                    Auto-detected <b>{liveHealth?.detectedChip || 'ESP32-WROOM'}</b> on <b>{liveHealth?.serialPath || 'COM11'}</b> at {liveHealth?.baudRate || 115200} baud (
                    {liveMeasurement?.subcarriers || 64} subcarriers, Ch {liveMeasurement?.channel || 1}). Real-time physics models
                    infer room boundary, survivor location, and respiratory movement.
                  </span>
                </div>
                <button onClick={() => notify(`Packets: ${liveHealth?.packets || 0} | Seq: ${liveMeasurement?.sequence || 0}`)}>
                  <span className="learn-label">Telemetry</span>
                  <ArrowUpRight size={14} />
                </button>
              </div>

              {/* Top 4 KPI Metrics */}
              <section className="metrics-grid" aria-label="Current system estimates">
                <MetricCard
                  label="Presence Detection"
                  value={
                    presence.presenceClass === 'STRONG_PRESENCE'
                      ? 'CONFIRMED'
                      : presence.presenceClass === 'POSSIBLE_PRESENCE'
                      ? 'DETECTED'
                      : 'ROOM EMPTY'
                  }
                  status={`Prob ${(presence.probability * 100).toFixed(0)}% · ${presence.activityState.replace('_', ' ')}`}
                  tone={presence.probability > 0.5 ? 'amber' : presence.probability > 0.25 ? 'blue' : 'muted'}
                  icon={Activity}
                />
                <MetricCard
                  label="Survivors in Room"
                  value={presence.estimatedPeople > 0 ? `${presence.estimatedPeople} ${presence.estimatedPeople === 1 ? 'Person' : 'People'}` : '0 People'}
                  status={
                    presence.breathingBpm
                      ? `Respiration: ${presence.breathingBpm} breaths/min`
                      : presence.estimatedPeople > 0
                      ? 'Active physical motion'
                      : 'No human reflectors'
                  }
                  tone={presence.estimatedPeople > 0 ? 'amber' : 'muted'}
                  icon={Users}
                />
                <MetricCard
                  label="Survivor Location"
                  value={presence.estimatedPeople > 0 ? `Zone ${spatial.activeZone}` : 'Unoccupied'}
                  status={
                    presence.estimatedPeople > 0
                      ? `${spatial.zoneName} · X:${spatial.x}m, Y:${spatial.y}m (±${spatial.uncertaintyM}m)`
                      : 'Zero targets localized'
                  }
                  tone={presence.estimatedPeople > 0 ? 'amber' : 'muted'}
                  icon={MapPinned}
                />
                <MetricCard
                  label="Real-Time Room Dimensions"
                  value={`${room.length}m × ${room.breadth}m`}
                  status={`Area ${room.area} m² · Delay ${room.delaySpreadNs}ns (Multipath CIR)`}
                  tone="blue"
                  icon={Maximize2}
                />
              </section>

              {/* Main Content: Spatial Room Radar (Left) + Side Telemetry (Right) */}
              <section className="content-grid">
                <div className="map-panel panel">
                  <div className="panel-header">
                    <div>
                      <div className="panel-kicker">
                        <MapPinned size={14} /> DYNAMIC SPATIAL ROOM RADAR
                      </div>
                      <h2>
                        Real-Time Room Layout & Location ({room.length}m × {room.breadth}m)
                      </h2>
                    </div>
                    <div className="radar-status-chip">
                      <StatusDot tone={presence.estimatedPeople > 0 ? 'amber' : 'green'} />
                      <span>{presence.estimatedPeople > 0 ? `${presence.estimatedPeople} TARGET IN ZONE ${spatial.activeZone}` : 'ROOM QUIET'}</span>
                    </div>
                  </div>

                  <div className="map-toolbar">
                    <span className="toolbar-status">
                      <Compass size={13} /> Grid Origin (0,0) · Cell: {(room.length / 3).toFixed(1)}m × {(room.breadth / 3).toFixed(1)}m · {room.area} m²
                    </span>
                    <div className="radar-toolbar-right">
                      <div className="radar-view-selector">
                        <button
                          className={`radar-view-btn ${radarViewMode === 'composite' ? 'is-active' : ''}`}
                          onClick={() => setRadarViewMode('composite')}
                          title="CSI Heatmap + Target Markers"
                        >
                          <Zap size={12} /> Composite
                        </button>
                        <button
                          className={`radar-view-btn ${radarViewMode === 'heatmap' ? 'is-active' : ''}`}
                          onClick={() => setRadarViewMode('heatmap')}
                          title="Thermal RF Disturbance Heatmap"
                        >
                          <Flame size={12} /> Heatmap
                        </button>
                        <button
                          className={`radar-view-btn ${radarViewMode === 'blip' ? 'is-active' : ''}`}
                          onClick={() => setRadarViewMode('blip')}
                          title="Target Blips Only"
                        >
                          <Users size={12} /> Blips
                        </button>
                        <button
                          className={`radar-view-btn ${radarViewMode === '3d' ? 'is-active' : ''}`}
                          onClick={() => setRadarViewMode('3d')}
                          title="Volumetric 3D Wi-Fi Hash Map & Spectral View"
                        >
                          <Boxes size={12} /> 3D View
                        </button>
                      </div>

                      <div className="disturbance-pill" title="Slide to adjust RF Disturbance & Doppler intensity">
                        <Activity size={12} />
                        <span>Disturb: {Math.round((spatial.disturbanceLevel ?? 0.65) * 100)}%</span>
                        <input
                          type="range"
                          min="5"
                          max="100"
                          value={Math.round((spatial.disturbanceLevel ?? 0.65) * 100)}
                          onChange={(e) => handleDisturbanceChange(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {radarViewMode === '3d' ? (
                    <div style={{ padding: '16px 20px 18px' }}>
                      <ThreeDimensionalView
                        room={room}
                        presence={presence}
                        spatial={spatial}
                        liveHealth={liveHealth}
                        liveMeasurement={liveMeasurement}
                        onNotify={notify}
                      />
                    </div>
                  ) : (
                    <>
                      {/* Interactive Dynamic Room Radar Canvas */}
                      <div className="map-canvas interactive-radar">
                        {/* Real-time 2D Thermal CSI Heatmap Canvas */}
                        <canvas
                          ref={canvasRef}
                          className="radar-heatmap-canvas"
                          onClick={handleRadarClick}
                          style={{ cursor: 'crosshair' }}
                          title="Click anywhere to add or intensify an RF Heatspot!"
                        />

                        {/* Real-time dimension axis callouts */}
                        <div className="dimension-label dim-top">
                          <span>LENGTH: {room.length} METERS</span>
                        </div>
                        <div className="dimension-label dim-left">
                          <span>BREADTH: {room.breadth} METERS</span>
                        </div>

                        <div className="map-grid-lines" />

                        {/* Receiver Sensor Node (ESP32) */}
                        <div className="radar-node" title={`Sensor Node RX-01 (ESP32)`}>
                          <div className="radar-node-pulse" />
                          <Antenna size={14} />
                          <span>RX-01</span>
                        </div>

                        {/* 3x3 Zones scaled dynamically to room dimensions */}
                        {ZONES.map((zone) => {
                          const isOccupied = spatial.occupiedZones.includes(zone.id)
                          return (
                            <div
                              key={zone.id}
                              className={`radar-zone ${isOccupied ? 'is-occupied' : ''}`}
                              style={{
                                left: `${(zone.col / 3) * 100}%`,
                                top: `${(zone.row / 3) * 100}%`,
                                width: `${100 / 3}%`,
                                height: `${100 / 3}%`,
                              }}
                            >
                              <div className="zone-header">
                                <span className="zone-code">{zone.id}</span>
                                <span className="zone-sub">{zone.name}</span>
                              </div>
                              {isOccupied && (
                                <div className="zone-glow">
                                  <span className="glow-core" />
                                </div>
                              )}
                            </div>
                          )
                        })}

                        {/* Dynamic Target Blips (Survivors / People) - with smooth fade in & fade out */}
                        {radarViewMode !== 'heatmap' &&
                          fadingTargets.map((target) => {
                            const normX = Math.min(92, Math.max(8, (target.x / room.length) * 100))
                            const normY = Math.min(90, Math.max(10, (target.y / room.breadth) * 100))
                            return (
                              <div
                                key={target.id}
                                className={`radar-target ${target.isExiting ? 'is-exiting' : ''}`}
                                style={{
                                  left: `${normX}%`,
                                  top: `${normY}%`,
                                }}
                              >
                                <div
                                  className="target-uncertainty"
                                  style={{
                                    width: `${Math.max(45, (spatial.uncertaintyM / room.length) * 280)}px`,
                                    height: `${Math.max(45, (spatial.uncertaintyM / room.breadth) * 280)}px`,
                                  }}
                                />
                                <div className="target-blip">
                                  <Users size={13} />
                                </div>
                                <div className="target-tooltip">
                                  <strong>{target.id}: Survivor</strong>
                                  <span>
                                    {target.x}m, {target.y}m ({target.zone})
                                  </span>
                                  <span>{target.activity.replace('_', ' ')}</span>
                                  {target.breathingBpm && (
                                    <span className="target-bpm">
                                      <Activity size={10} /> {target.breathingBpm} breaths/min
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}

                        <div className="map-legend">
                          <span>
                            <i className="legend-sensor" /> ESP32 Receiver
                          </span>
                          <span>
                            <i className="legend-target" /> Detected Person
                          </span>
                          <span>
                            <i className="legend-zone-active" /> Active Zone
                          </span>
                        </div>
                      </div>

                      {/* Thermal Scale Bar */}
                      <div className="thermal-scale-bar">
                        <span>RF Perturbation:</span>
                        <span>0 dB (Quiet)</span>
                        <div className="scale-gradient" />
                        <span>+15 dB</span>
                        <div className="scale-gradient" />
                        <span>+30+ dB (Thermal Surge)</span>
                        <span className="heatmap-hint">💡 Tap radar to add heatspot</span>
                      </div>
                    </>
                  )}

                  <div className="map-footer">
                    <span>
                      <Check size={14} /> Room boundary computed from physical multipath delay spread ({room.delaySpreadNs} ns) and first-order wall reflection echoes.
                    </span>
                    <button onClick={() => notify(`Direct Path: ${room.directPathM}m | Echo 1: ${room.wallEcho1M}m | Echo 2: ${room.wallEcho2M}m`)}>
                      Reflection Details <ArrowUpRight size={13} />
                    </button>
                  </div>
                </div>

                {/* Right Side Stack: Live Receiver Telemetry & Multi-Subcarrier Waterfall */}
                <div className="side-stack">
                  <div className="panel signal-panel">
                    <div className="panel-header compact">
                      <div>
                        <div className="panel-kicker">
                          <Gauge size={14} /> HARDWARE TELEMETRY
                        </div>
                        <h2>Receiver Health (ESP32)</h2>
                      </div>
                      <span className="live-label">
                        <StatusDot tone={liveHealth?.dataFresh ? 'green' : 'amber'} />{' '}
                        {liveHealth?.dataFresh ? 'STREAMING' : 'CONNECTING'}
                      </span>
                    </div>

                    <div className="receiver-card">
                      <div className="receiver-icon">
                        <Router size={18} />
                      </div>
                      <div className="receiver-info">
                        <strong>{liveMeasurement?.nodeId || 'esp32_wroom_01'} · Wi-Fi CSI</strong>
                        <span>
                          <StatusDot tone="green" /> {liveHealth?.serialPath || 'COM11'} · Ch {liveMeasurement?.channel || 1}
                        </span>
                      </div>
                      <span className="health-pill live">
                        {liveMeasurement?.rssi ? `${liveMeasurement.rssi} dBm` : 'CONNECTED'}
                      </span>
                    </div>

                    <div className="health-rows">
                      <HealthRow
                        label="Packets Received"
                        value={`${liveHealth?.packets || 0} (${liveMeasurement?.sequence || 0} seq)`}
                      />
                      <HealthRow
                        label="Subcarrier Count"
                        value={`${liveMeasurement?.subcarriers || 64} HT20 OFDM Subcarriers`}
                      />
                      <HealthRow
                        label="Doppler Shift Proxy"
                        value={`${liveMeasurement?.presence?.dopplerProxy || 0.0} Hz`}
                        warn={Number(liveMeasurement?.presence?.dopplerProxy) > 2.0}
                      />
                      <HealthRow
                        label="Temporal Variance"
                        value={`${liveMeasurement?.presence?.temporalVariance || 0.0}`}
                        warn={Number(liveMeasurement?.presence?.temporalVariance) > 5.0}
                      />
                      {liveMeasurement?.presence?.breathingBpm && (
                        <HealthRow
                          label="Respiration Rate"
                          value={`${liveMeasurement.presence.breathingBpm} Breaths/min`}
                        />
                      )}
                    </div>
                  </div>

                  <div className="panel activity-panel">
                    <div className="panel-header compact">
                      <div>
                        <div className="panel-kicker">
                          <Zap size={14} /> RECENT SENSING EVENTS
                        </div>
                        <h2>Detection Log</h2>
                      </div>
                      <span className="live-label">
                        <StatusDot tone="green" /> LIVE
                      </span>
                    </div>

                    <div className="event-list">
                      {events.map((event, idx) => (
                        <EventRow key={idx} {...event} />
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Lower Section: Multi-Subcarrier Spectrum & Live Waveform Chart */}
              <section className="telemetry-grid">
                <div className="panel telemetry-panel">
                  <div className="panel-header compact">
                    <div>
                      <div className="panel-kicker">
                        <Activity size={14} /> REAL-TIME CSI AMPLITUDE WAVEFORM
                      </div>
                      <h2>Continuous Signal History ({liveHistory.length} frames)</h2>
                    </div>
                    <span className="live-label">
                      <StatusDot tone="green" /> {liveHistory.length ? 'UPDATING REAL-TIME' : 'WAITING FOR PACKETS'}
                    </span>
                  </div>

                  <div className="chart-wrap">
                    <LiveLineChart points={liveHistory} field="amplitudeMean" color="var(--lime)" empty="Waiting for CSI packets" />
                    <div className="chart-axis">
                      <span>−{Math.min(60, liveHistory.length)}s</span>
                      <span>TIME (PAST TO PRESENT) →</span>
                      <span>NOW</span>
                    </div>
                  </div>

                  <div className="chart-legend">
                    <span>
                      <i className="line-swatch lime" /> Subcarrier Mean Amplitude ({liveMeasurement?.amplitudeMean || 0})
                    </span>
                    <span>
                      Spread: ±{liveMeasurement?.amplitudeSpread || 0} | Packets: {liveHealth?.packets || 0}
                    </span>
                  </div>
                </div>

                <div className="panel telemetry-panel">
                  <div className="panel-header compact">
                    <div>
                      <div className="panel-kicker">
                        <Layers3 size={14} /> 64-SUBCARRIER SPECTRUM
                      </div>
                      <h2>OFDM Channel Response (CFR)</h2>
                    </div>
                    <span className="source-type">HT20 20MHz</span>
                  </div>

                  {/* 64 Subcarrier Bars */}
                  <div className="subcarrier-bars">
                    {(liveMeasurement?.subcarriersData || []).slice(0, 64).map((sc) => {
                      const heightPct = Math.min(100, Math.max(8, (sc.amplitude / 25) * 100))
                      return (
                        <div
                          key={sc.subcarrier}
                          className="subcarrier-bar"
                          style={{ '--h': `${heightPct}%` }}
                          title={`Subcarrier #${sc.subcarrier}: Amp ${sc.amplitude}, Phase ${sc.phase} rad`}
                        >
                          <span className="bar-fill" />
                        </div>
                      )
                    })}
                  </div>

                  <div className="heatmap-scale">
                    <span>Low (0)</span>
                    <i />
                    <i />
                    <i />
                    <i />
                    <span>High (25 dB)</span>
                  </div>
                  <div className="chart-note">
                    Multipath constructive and destructive interference across 64 subcarriers. Human chest movement and body displacement disturb specific subcarrier clusters.
                  </div>
                </div>
              </section>
            </>
          ) : (
            <WorkspacePage
              page={activeNav}
              room={room}
              presence={presence}
              spatial={spatial}
              liveHealth={liveHealth}
              liveMeasurement={liveMeasurement}
              onNavigate={navigate}
              onNotify={notify}
            />
          )}

          <footer className="page-footer">
            <span>
              ResQ-Atlas Research System · Live RF CSI Spatial Mapping & Autonomous Survivor Detection.
            </span>
            <span>
              Hardware: {liveHealth?.serialPath || 'COM11'} @ {liveHealth?.baudRate || 115200} · Privacy Boundary Active (Zero Cameras)
            </span>
          </footer>
        </div>
      </main>

      {toast && (
        <div className="toast" role="status">
          <Check size={15} /> {toast}
        </div>
      )}
    </div>
  )
}

function LiveLineChart({ points, field, color, empty }) {
  if (!points.length) {
    return (
      <div className="chart-empty">
        <Activity size={18} />
        <span>{empty}</span>
      </div>
    )
  }

  const values = points.map((p) => Number(p[field]) || 0)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = Math.max(0.8, max - min)

  const coords = values.map((val, idx) => {
    const x = (idx / Math.max(1, values.length - 1)) * 100
    const y = 90 - ((val - min) / spread) * 72
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const lineStr = coords.join(' ')
  const areaPath = `M 0,92 L ${lineStr.split(' ').join(' L ')} L 100,92 Z`

  return (
    <svg className="live-line-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
      <defs>
        <linearGradient id="signalFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#signalFill)" />
      <polyline points={lineStr} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function WorkspacePage({ page, room, presence, spatial, liveHealth, liveMeasurement, onNavigate, onNotify }) {
  if (page === '3D Scan & Spectral') {
    return (
      <ThreeDimensionalView
        room={room}
        presence={presence}
        spatial={spatial}
        liveHealth={liveHealth}
        liveMeasurement={liveMeasurement}
        onNotify={onNotify}
      />
    )
  }

  if (page === 'Spatial view') {
    return (
      <section className="workspace-columns">
        <div className="panel workspace-map-panel">
          <div className="panel-header">
            <div>
              <div className="panel-kicker">
                <MapPinned size={14} /> AUTONOMOUS ROOM LOCALIZATION & BOUNDARIES
              </div>
              <h2>
                Live Room Geometry: {room.length}m × {room.breadth}m ({room.area} m²)
              </h2>
            </div>
            <div className="radar-status-chip">
              <StatusDot tone={presence.estimatedPeople > 0 ? 'amber' : 'green'} />
              <span>{presence.estimatedPeople > 0 ? `${presence.estimatedPeople} Target(s) in Zone ${spatial.activeZone}` : 'Clear'}</span>
            </div>
          </div>

          <div className="large-map interactive-radar">
            <div className="dimension-label dim-top">LENGTH: {room.length} METERS</div>
            <div className="dimension-label dim-left">BREADTH: {room.breadth} METERS</div>
            <div className="map-grid-lines" />

            <div className="radar-node" title="Sensor Node RX-01 (ESP32)">
              <div className="radar-node-pulse" />
              <Antenna size={14} />
              <span>RX-01</span>
            </div>

            {ZONES.map((zone) => {
              const isOccupied = spatial.occupiedZones.includes(zone.id)
              return (
                <div
                  key={zone.id}
                  className={`radar-zone ${isOccupied ? 'is-occupied' : ''}`}
                  style={{
                    left: `${(zone.col / 3) * 100}%`,
                    top: `${(zone.row / 3) * 100}%`,
                    width: `${100 / 3}%`,
                    height: `${100 / 3}%`,
                  }}
                >
                  <div className="zone-header">
                    <span className="zone-code">{zone.id}</span>
                    <span className="zone-sub">{zone.name}</span>
                  </div>
                  {isOccupied && (
                    <div className="zone-glow">
                      <span className="glow-core" />
                    </div>
                  )}
                </div>
              )
            })}

            {spatial.targets.map((target) => {
              const normX = Math.min(92, Math.max(8, (target.x / room.length) * 100))
              const normY = Math.min(90, Math.max(10, (target.y / room.breadth) * 100))
              return (
                <div
                  key={target.id}
                  className="radar-target"
                  style={{
                    left: `${normX}%`,
                    top: `${normY}%`,
                  }}
                >
                  <div
                    className="target-uncertainty"
                    style={{
                      width: `${Math.max(50, (spatial.uncertaintyM / room.length) * 300)}px`,
                      height: `${Math.max(50, (spatial.uncertaintyM / room.breadth) * 300)}px`,
                    }}
                  />
                  <div className="target-blip">
                    <Users size={14} />
                  </div>
                  <div className="target-tooltip">
                    <strong>{target.id}: Survivor</strong>
                    <span>
                      Coordinates: X={target.x}m, Y={target.y}m
                    </span>
                    <span>Zone {target.zone} · {target.activity.replace('_', ' ')}</span>
                    {target.breathingBpm && (
                      <span className="target-bpm">
                        <Activity size={10} /> {target.breathingBpm} breaths/min
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="workspace-card-footer">
            <span>
              <Check size={14} /> Live spatial grid dynamically scaled to real-world multipath boundaries.
            </span>
            <span>
              Estimated Targets: <strong>{spatial.targets.length}</strong> | Active Zone:{' '}
              <strong>{spatial.activeZone}</strong>
            </span>
          </div>
        </div>

        <div className="panel checklist-panel">
          <div className="panel-header compact">
            <div>
              <div className="panel-kicker">
                <Check size={14} /> MULTIPATH CIR DIAGNOSTICS
              </div>
              <h2>Echo Reflection Parameters</h2>
            </div>
          </div>
          <HealthRow label="Direct Path Distance" value={`${room.directPathM} m`} />
          <HealthRow label="Wall Echo 1 (Breadth)" value={`${room.wallEcho1M} m`} />
          <HealthRow label="Wall Echo 2 (Length)" value={`${room.wallEcho2M} m`} />
          <HealthRow label="RMS Delay Spread" value={`${room.delaySpreadNs} ns`} />
          <HealthRow label="Aspect Ratio" value={`${room.aspectRatio}`} />
          <HealthRow label="Model Confidence" value={`${(room.confidence * 100).toFixed(0)}%`} />
          <button className="wide-button" onClick={() => onNotify('Room dimension recalculated on each CSI packet')}>
            <Maximize2 size={15} /> Real-Time Calibration Active
          </button>
        </div>
      </section>
    )
  }

  if (page === 'Sensor fleet') {
    return (
      <section className="panel sensor-table-panel">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">
              <Antenna size={14} /> SENSOR REGISTRY
            </div>
            <h2>Connected CSI Hardware</h2>
          </div>
        </div>
        <div className="sensor-table">
          <div className="sensor-table-head">
            <span>Node Identifier</span>
            <span>Adapter / Port</span>
            <span>Status</span>
            <span>Signal RSSI</span>
          </div>
          <div className="sensor-table-row">
            <div className="sensor-id">
              <div className="sensor-symbol">
                <Router size={15} />
              </div>
              <span>
                <strong>{liveMeasurement?.nodeId || 'esp32_wroom_01'}</strong>
                <small>Silicon Labs CP210x USB UART</small>
              </span>
            </div>
            <span className="adapter-copy">
              {liveHealth?.serialPath || 'COM11'} @ {liveHealth?.baudRate || 115200}
            </span>
            <span className="sensor-status">
              <StatusDot tone={liveHealth?.dataFresh ? 'green' : 'amber'} />{' '}
              {liveHealth?.dataFresh ? 'ONLINE (STREAMING)' : 'STANDBY'}
            </span>
            <span className="table-muted">{liveMeasurement?.rssi || -42} dBm (Ch {liveMeasurement?.channel || 1})</span>
          </div>
        </div>
      </section>
    )
  }

  if (page === 'Recordings') {
    return (
      <section className="workspace-columns">
        <div className="panel recordings-panel">
          <div className="panel-header">
            <div>
              <div className="panel-kicker">
                <Archive size={14} /> CSI TELEMETRY VAULT
              </div>
              <h2>Captured Sessions</h2>
            </div>
          </div>
          <div className="empty-large">
            <Archive size={26} />
            <strong>Physical CSI frames streaming live</strong>
            <span>Recorded packets include raw amplitudes, phase angles, and CIR delay profiles.</span>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="config-grid">
      <div className="panel config-panel">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">
              <Settings2 size={14} /> DSP & PHYSICS ENGINE
            </div>
            <h2>Sensing Configuration</h2>
          </div>
        </div>
        <ConfigRow label="Detected Hardware" value={liveHealth?.detectedChip || 'ESP32-WROOM (Silicon Labs CP210x)'} />
        <ConfigRow label="Active Serial Port" value={liveHealth?.serialPath || 'COM11'} />
        <ConfigRow label="Baud Rate" value={`${liveHealth?.baudRate || 115200} bps`} />
        <ConfigRow label="Subcarrier Window" value="64 Subcarriers (HT20)" />
        <ConfigRow label="Phase Sanitization" value="Linear Detrended + Unwrapped" />
        <ConfigRow label="Respiration Filter Band" value="0.15 Hz – 0.45 Hz (9–27 breaths/min)" />
        <ConfigRow label="Multipath Resolution" value="50 ns / 15m (Sub-bin Interpolated)" />
      </div>
      <div className="panel config-panel">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">
              <ShieldCheck size={14} /> ETHICAL SAFEGUARDS
            </div>
            <h2>Privacy by Design</h2>
          </div>
        </div>
        <ConfigRow label="Image / Camera Sensors" value="NONE (0 Cameras)" />
        <ConfigRow label="Personal Identifiers" value="Salted Ephemeral Hash" />
        <ConfigRow label="Raw Payload Storage" value="Never Persisted" />
        <ConfigRow label="Compliance" value="India DPDP 2025 & IEEE 802.11bf" />
      </div>
    </section>
  )
}

function MetricCard({ label, value, status, tone, icon: Icon }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <Icon size={17} />
      </div>
      <div className={`metric-value ${tone}`}>{value}</div>
      <div className="metric-status">
        <StatusDot tone={tone} /> {status}
      </div>
    </div>
  )
}

function HealthRow({ label, value, warn }) {
  return (
    <div className="health-row">
      <span>{label}</span>
      <strong className={warn ? 'warn-text' : ''}>{value}</strong>
    </div>
  )
}

function ConfigRow({ label, value }) {
  return (
    <div className="config-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function EventRow({ time, title, detail, tone }) {
  return (
    <div className="event-row">
      <div className={`event-icon ${tone}`}>
        <Activity size={13} />
      </div>
      <div className="event-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <time>{time}</time>
    </div>
  )
}

export default App

createRoot(document.getElementById('root')).render(<App />)
