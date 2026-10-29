import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  Activity,
  AlertTriangle,
  Antenna,
  ArrowRight,
  Boxes,
  Camera,
  CheckCircle2,
  Clock,
  Compass,
  Eye,
  FastForward,
  Flame,
  Globe,
  Layers3,
  Lock,
  MapPin,
  Maximize2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Rewind,
  RotateCcw,
  Scan,
  Shield,
  ShieldCheck,
  Sliders,
  Sparkles,
  Split,
  Users,
  Wifi,
  Zap,
} from 'lucide-react'

export default function ObservatoryView({
  room,
  presence,
  spatial,
  modeState,
  liveMeasurement,
  onNotify,
  onOpenModeModal,
}) {
  const mountRef = useRef(null)
  const sceneRef = useRef(null)
  const rendererRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const animFrameIdRef = useRef(null)

  // 12 View Modes:
  // 1=3d, 2=wifi, 3=bt, 4=fusion, 5=change, 6=heat, 7=xray, 8=vitals, 9=spectrum, 0=temporal, g=geo, p=privacy
  const [viewMode, setViewMode] = useState('2') // Default to '2' (WiFi Mesh)
  const [peelValue, setPeelValue] = useState(0.5) // 0.0 = 3D Model, 0.5 = X-ray, 1.0 = WiFi Mesh
  const [isSplitView, setIsSplitView] = useState(false)
  const [cameraPreset, setCameraPreset] = useState('orbit')
  const [isPlaying, setIsPlaying] = useState(true)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [timelinePos, setTimelinePos] = useState(100)
  const [selectedZone, setSelectedZone] = useState('B2')

  // Observability groups
  const nodesGroupRef = useRef(new THREE.Group())
  const linksGroupRef = useRef(new THREE.Group())
  const twinGroupRef = useRef(new THREE.Group())
  const emittersGroupRef = useRef(new THREE.Group())
  const vitalsGroupRef = useRef(new THREE.Group())
  const blindSpotsGroupRef = useRef(new THREE.Group())
  const spectralGroupRef = useRef(new THREE.Group())

  const roomL = room?.length || 5.2
  const roomW = room?.breadth || 4.1
  const roomH = room?.height || 2.8

  // Keyboard shortcut listener (1-0, G, P)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toUpperCase()
      if (['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'G', 'P'].includes(key)) {
        setViewMode(key.toLowerCase())
        onNotify?.(`Switched to View Mode [${key}]`)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onNotify])

  // Initialize Three.js scene
  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    const width = container.clientWidth || 800
    const height = container.clientHeight || 550

    // Scene & Camera
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0d14)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    camera.position.set(roomL * 1.4, roomH * 1.8, roomW * 1.6)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    rendererRef.current = renderer
    container.innerHTML = ''
    container.appendChild(renderer.domElement)

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.target.set(roomL / 2, roomH / 3, roomW / 2)
    controlsRef.current = controls

    // Ambient & Directional Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
    scene.add(ambientLight)
    const dirLight = new THREE.DirectionalLight(0x70a5ff, 1.2)
    dirLight.position.set(10, 15, 10)
    scene.add(dirLight)

    // Floor Grid
    const gridHelper = new THREE.GridHelper(Math.max(roomL, roomW) * 1.6, 20, 0x223555, 0x111c2e)
    gridHelper.position.set(roomL / 2, 0, roomW / 2)
    scene.add(gridHelper)

    // Add Scene Groups
    scene.add(twinGroupRef.current)
    scene.add(nodesGroupRef.current)
    scene.add(linksGroupRef.current)
    scene.add(emittersGroupRef.current)
    scene.add(vitalsGroupRef.current)
    scene.add(blindSpotsGroupRef.current)
    scene.add(spectralGroupRef.current)

    // Handle Resize
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return
      const w = container.clientWidth
      const h = container.clientHeight
      cameraRef.current.aspect = w / h
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    // Animation Loop
    let clock = new THREE.Clock()
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate)
      const elapsedTime = clock.getElapsedTime()
      controls.update()

      // Pulse link ribbons
      linksGroupRef.current.children.forEach((mesh, idx) => {
        if (mesh.material) {
          mesh.material.opacity = 0.35 + 0.35 * Math.sin(elapsedTime * 4.0 + idx * 0.4)
        }
      })

      // Vitals breathing pulsation
      vitalsGroupRef.current.children.forEach((halo) => {
        const scale = 1.0 + 0.25 * Math.sin(elapsedTime * 2.2) // ~18 BPM
        halo.scale.set(scale, scale, scale)
      })

      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animFrameIdRef.current)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
    }
  }, [roomL, roomW, roomH])

  // Build 3D objects according to selected view mode & peel value
  useEffect(() => {
    const twinGroup = twinGroupRef.current
    const nodesGroup = nodesGroupRef.current
    const linksGroup = linksGroupRef.current
    const emittersGroup = emittersGroupRef.current
    const vitalsGroup = vitalsGroupRef.current
    const blindSpotsGroup = blindSpotsGroupRef.current
    const spectralGroup = spectralGroupRef.current

    // Clear previous children
    while (twinGroup.children.length > 0) twinGroup.remove(twinGroup.children[0])
    while (nodesGroup.children.length > 0) nodesGroup.remove(nodesGroup.children[0])
    while (linksGroup.children.length > 0) linksGroup.remove(linksGroup.children[0])
    while (emittersGroup.children.length > 0) emittersGroup.remove(emittersGroup.children[0])
    while (vitalsGroup.children.length > 0) vitalsGroup.remove(vitalsGroup.children[0])
    while (blindSpotsGroup.children.length > 0) blindSpotsGroup.remove(blindSpotsGroup.children[0])
    while (spectralGroup.children.length > 0) spectralGroup.remove(spectralGroup.children[0])

    const isWireframe = viewMode === '7' || peelValue > 0.3
    const is3dModel = viewMode === '1' || peelValue < 0.4
    const isWifiMesh = viewMode === '2' || peelValue > 0.6
    const isHeat = viewMode === '6' || viewMode === '4'
    const isChange = viewMode === '5'
    const isVitals = viewMode === '8' || viewMode === '4'
    const isBt = viewMode === '3' || viewMode === '4'

    // 1. Build Room Proxy Mesh & Walls
    const roomBoxGeo = new THREE.BoxGeometry(roomL, roomH, roomW)
    const roomMat = new THREE.MeshStandardMaterial({
      color: isChange ? 0xcc6633 : 0x1f2e48,
      wireframe: isWireframe,
      transparent: true,
      opacity: is3dModel ? 0.35 : 0.15,
      roughness: 0.8,
    })
    const roomMesh = new THREE.Mesh(roomBoxGeo, roomMat)
    roomMesh.position.set(roomL / 2, roomH / 2, roomW / 2)
    twinGroup.add(roomMesh)

    // Interior walls (W12 concrete & W17 drywall)
    const w12Geo = new THREE.BoxGeometry(0.2, roomH, roomW * 0.5)
    const w12Mat = new THREE.MeshStandardMaterial({
      color: 0xee4444, // Suspect wall in red/amber
      transparent: true,
      opacity: isWireframe ? 0.3 : 0.6,
      wireframe: isWireframe,
    })
    const w12 = new THREE.Mesh(w12Geo, w12Mat)
    w12.position.set(roomL * 0.4, roomH / 2, roomW * 0.35)
    twinGroup.add(w12)

    // 2. Build 8 Sensor Nodes
    const nodeCoords = [
      { id: 'DR-CSI-01', x: 0.4, y: 1.5, z: 0.4, color: 0x00e5ff },
      { id: 'DR-CSI-02', x: roomL - 0.4, y: 1.5, z: 0.4, color: 0x00e5ff },
      { id: 'DR-CSI-03', x: roomL - 0.4, y: 1.5, z: roomW - 0.4, color: 0x00e5ff },
      { id: 'DR-SCN-01', x: 0.4, y: 1.5, z: roomW - 0.4, color: 0xffaa00 },
      { id: 'DR-ANC-01', x: roomL / 2, y: 2.4, z: 0.2, color: 0x33ff88 },
      { id: 'RPI-HUB', x: roomL / 2, y: 1.2, z: roomW / 2, color: 0xff33bb },
      { id: 'LD2410-A', x: roomL / 2, y: 1.8, z: roomW - 0.2, color: 0xaa44ff },
      { id: 'IMU-BARO-01', x: 1.0, y: 0.4, z: roomW / 2, color: 0x66aaff },
    ]

    nodeCoords.forEach((nc) => {
      const nodeGeo = new THREE.SphereGeometry(0.12, 16, 16)
      const nodeMat = new THREE.MeshBasicMaterial({ color: nc.color })
      const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat)
      nodeMesh.position.set(nc.x, nc.y, nc.z)
      nodesGroup.add(nodeMesh)

      // Ring pulse
      const ringGeo = new THREE.RingGeometry(0.16, 0.22, 16)
      const ringMat = new THREE.MeshBasicMaterial({ color: nc.color, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
      const ringMesh = new THREE.Mesh(ringGeo, ringMat)
      ringMesh.rotation.x = Math.PI / 2
      ringMesh.position.set(nc.x, 0.05, nc.z)
      nodesGroup.add(ringMesh)
    })

    // 3. Build Fresnel Link Ribbons (WiFi Mesh Mode)
    if (isWifiMesh || viewMode === '2' || viewMode === '4') {
      for (let i = 0; i < nodeCoords.length; i++) {
        for (let j = i + 1; j < nodeCoords.length; j++) {
          const p1 = new THREE.Vector3(nodeCoords[i].x, nodeCoords[i].y, nodeCoords[i].z)
          const p2 = new THREE.Vector3(nodeCoords[j].x, nodeCoords[j].y, nodeCoords[j].z)

          const curve = new THREE.LineCurve3(p1, p2)
          const tubeGeo = new THREE.TubeGeometry(curve, 10, 0.018, 6, false)
          const isDisturbed = i === 0 && j === 2 // Example disturbed link through center
          const tubeMat = new THREE.MeshBasicMaterial({
            color: isDisturbed ? 0xff4433 : 0x00d4ff,
            transparent: true,
            opacity: isDisturbed ? 0.8 : 0.35,
          })
          const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat)
          linksGroup.add(tubeMesh)
        }
      }
    }

    // 4. Anonymous Emitter Cloud Blobs (BT Scan Mode)
    if (isBt && presence?.estimatedPeople > 0) {
      const blobGeo = new THREE.SphereGeometry(spatial.uncertaintyM || 1.1, 16, 16)
      const blobMat = new THREE.MeshBasicMaterial({
        color: 0x4488ff,
        transparent: true,
        opacity: 0.25,
        wireframe: true,
      })
      const blobMesh = new THREE.Mesh(blobGeo, blobMat)
      blobMesh.position.set(spatial.x || roomL / 2, 1.2, spatial.y || roomW / 2)
      emittersGroup.add(blobMesh)
    }

    // 5. Vitals Respiration Halos (0.1–0.5 Hz micro-motion)
    if (isVitals && presence?.estimatedPeople > 0) {
      const haloGeo = new THREE.TorusGeometry(0.7, 0.04, 8, 32)
      const haloMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.8 })
      const haloMesh = new THREE.Mesh(haloGeo, haloMat)
      haloMesh.rotation.x = Math.PI / 2
      haloMesh.position.set(spatial.x || roomL / 2, 0.9, spatial.y || roomW / 2)
      vitalsGroup.add(haloMesh)
    }

    // 6. Hatched Blind Spots (Hatched cones where Fresnel link sensitivity is low)
    if (viewMode === '4' || viewMode === '7' || viewMode === 'p') {
      const bsGeo = new THREE.ConeGeometry(0.6, 1.4, 8)
      const bsMat = new THREE.MeshBasicMaterial({ color: 0x8844aa, wireframe: true, transparent: true, opacity: 0.35 })
      const bsMesh = new THREE.Mesh(bsGeo, bsMat)
      bsMesh.position.set(0.8, 0.7, roomW * 0.75)
      blindSpotsGroup.add(bsMesh)
    }
  }, [viewMode, peelValue, roomL, roomW, roomH, presence, spatial])

  // Camera presets switcher
  const applyCameraPreset = (preset) => {
    setCameraPreset(preset)
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return

    if (preset === 'orbit') {
      camera.position.set(roomL * 1.4, roomH * 1.8, roomW * 1.6)
      controls.target.set(roomL / 2, roomH / 3, roomW / 2)
    } else if (preset === 'top') {
      camera.position.set(roomL / 2, roomH * 3.2, roomW / 2 + 0.01)
      controls.target.set(roomL / 2, 0, roomW / 2)
    } else if (preset === 'side') {
      camera.position.set(roomL * 2.2, roomH / 2, roomW / 2)
      controls.target.set(roomL / 2, roomH / 2, roomW / 2)
    } else if (preset === 'fpv') {
      camera.position.set(0.4, 1.5, 0.4)
      controls.target.set(roomL / 2, 1.2, roomW / 2)
    }
  }

  return (
    <div className="observatory-layout">
      {/* 12-Mode Button & Key Strip */}
      <div className="observatory-mode-bar">
        <div className="mode-keys-scroll">
          {[
            { key: '1', label: '3D CAM', desc: 'Photoreal Twin' },
            { key: '2', label: 'WiFi Mesh', desc: 'Dotted + Fresnel' },
            { key: '3', label: 'BT Scan', desc: 'Emitter Cloud' },
            { key: '4', label: 'Fusion', desc: 'Belief + Tracks' },
            { key: '5', label: 'Change', desc: 'Baseline Diff' },
            { key: '6', label: 'Heat', desc: 'Probability Volume' },
            { key: '7', label: 'X-ray', desc: 'Residual Shading' },
            { key: '8', label: 'Vitals', desc: 'Breathing Glows' },
            { key: '9', label: 'Spectrum', desc: '3D Waterfall' },
            { key: '0', label: 'Temporal', desc: 'Time Scrubber' },
            { key: 'g', label: 'Geo', desc: 'Satellite Context' },
            { key: 'p', label: 'Privacy', desc: 'Audit Log' },
          ].map((m) => (
            <button
              key={m.key}
              className={`obs-mode-btn ${viewMode === m.key ? 'active' : ''}`}
              onClick={() => {
                setViewMode(m.key)
                onNotify?.(`Mode [${m.key.toUpperCase()}]: ${m.desc}`)
              }}
              title={`Shortcut: Press '${m.key.toUpperCase()}'`}
            >
              <span className="mode-btn-key">[{m.key.toUpperCase()}]</span>
              <span className="mode-btn-label">{m.label}</span>
            </button>
          ))}
        </div>

        <div className="observatory-hud-tools">
          <div className="peel-slider-box" title="Peel: Cross-fade 3D Model -> X-Ray -> WiFi Mesh">
            <span className="peel-label">Peel:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={peelValue}
              onChange={(e) => setPeelValue(parseFloat(e.target.value))}
            />
          </div>

          <button
            className={`split-btn ${isSplitView ? 'active' : ''}`}
            onClick={() => setIsSplitView(!isSplitView)}
            title="Toggle Split View Mode"
          >
            <Split size={14} /> Split
          </button>
        </div>
      </div>

      {/* Main 3D Viewport with Overlaid HUD & Inspector */}
      <div className="observatory-viewport-container">
        {/* 3D WebGL Canvas */}
        <div ref={mountRef} className="threejs-canvas-host" />

        {/* Camera Preset Toolbar */}
        <div className="cam-presets-hud">
          {['orbit', 'top', 'side', 'fpv'].map((preset) => (
            <button
              key={preset}
              className={`cam-preset-btn ${cameraPreset === preset ? 'active' : ''}`}
              onClick={() => applyCameraPreset(preset)}
            >
              {preset.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Mode & Privacy Status Watermark */}
        <div className="obs-watermark-hud">
          <div className="mode-tag-line" onClick={onOpenModeModal}>
            <span className={`status-pill ${modeState?.current?.toLowerCase() || 'baseline'}`}>
              MODE: {modeState?.current || 'BASELINE'}
            </span>
            <span className="privacy-pill">
              <ShieldCheck size={12} /> 0 IDENTIFIERS STORED
            </span>
          </div>
          <span className="watermark-sub">DRISHTI · दृष्टि OBSERVATORY · 28 RF LINKS ACTIVE</span>
        </div>

        {/* Right Zone Inspector Panel */}
        <div className="zone-inspector-panel">
          <div className="inspector-header">
            <div>
              <span className="inspector-kicker">ZONE INSPECTION</span>
              <h3>Zone {spatial.activeZone || 'B2'} (Center)</h3>
            </div>
            <span className="confidence-pill medium">CONFIDENCE: MEDIUM</span>
          </div>

          <div className="inspector-belief-box">
            <div className="belief-score">
              <strong>{(spatial.disturbanceLevel * 100 || 62).toFixed(0)}%</strong>
              <span>Belief (p_person_like)</span>
            </div>
            <div className="blindspot-badge">
              <span>Blind Spot: 12%</span>
            </div>
          </div>

          {/* Evidence Breakdown Bars */}
          <div className="evidence-bars-group">
            <label>Evidence Breakdown:</label>
            <div className="evidence-row">
              <span className="ev-name">CSI Subcarrier Motion</span>
              <div className="ev-track">
                <div className="ev-fill csi" style={{ width: '74%' }} />
              </div>
              <span className="ev-val">0.74</span>
            </div>
            <div className="evidence-row">
              <span className="ev-name">Device Probe Bursts</span>
              <div className="ev-track">
                <div className="ev-fill bursts" style={{ width: presence.estimatedPeople > 0 ? '50%' : '0%' }} />
              </div>
              <span className="ev-val">{presence.estimatedPeople > 0 ? '3' : '0'}</span>
            </div>
            <div className="evidence-row">
              <span className="ev-name">mmWave Radar Micro-Motion</span>
              <div className="ev-track">
                <div className="ev-fill radar" style={{ width: presence.estimatedPeople > 0 ? '78%' : '0%' }} />
              </div>
              <span className="ev-val">{presence.estimatedPeople > 0 ? '0.78' : 'None'}</span>
            </div>
            <div className="evidence-row">
              <span className="ev-name">RF CUSUM Change Index</span>
              <div className="ev-track">
                <div className="ev-fill change" style={{ width: '38%' }} />
              </div>
              <span className="ev-val">0.38</span>
            </div>
          </div>

          {/* Action / Guidance badge */}
          <div className="inspector-footer-guidance">
            <AlertTriangle size={14} />
            <span>Verify on site: Wall W12 echo shows +8.2 dB disagreement.</span>
          </div>
        </div>
      </div>

      {/* 4D Temporal Timeline Bar */}
      <div className="observatory-timeline-bar">
        <div className="timeline-controls">
          <button className="time-btn" onClick={() => setTimelinePos(Math.max(0, timelinePos - 20))}>
            <Rewind size={14} />
          </button>
          <button className="time-btn play" onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button className="time-btn" onClick={() => setTimelinePos(Math.min(100, timelinePos + 20))}>
            <FastForward size={14} />
          </button>
          <span className="live-clock-badge">
            <span className="status-dot green" /> LIVE 10:15:03
          </span>
        </div>

        <div className="timeline-slider-track">
          <input
            type="range"
            min="0"
            max="100"
            value={timelinePos}
            onChange={(e) => setTimelinePos(parseInt(e.target.value))}
          />
        </div>

        <div className="timeline-meta-right">
          <div className="speed-pills">
            {[1, 5, 20, 60].map((s) => (
              <button
                key={s}
                className={`speed-pill ${playbackSpeed === s ? 'active' : ''}`}
                onClick={() => setPlaybackSpeed(s)}
              >
                &times;{s}
              </button>
            ))}
          </div>

          <span className="alert-ticker">
            <AlertTriangle size={13} className="alert-icon" /> RF change Zone B2 (0.81) · 2 nodes offline · IDs stored: 0
          </span>
        </div>
      </div>
    </div>
  )
}
