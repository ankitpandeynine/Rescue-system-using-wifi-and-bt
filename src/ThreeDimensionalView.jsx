import { useEffect, useRef, useState, useMemo } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  Activity,
  Antenna,
  Box,
  Boxes,
  Check,
  Compass,
  Download,
  Eye,
  Flame,
  Layers3,
  Maximize2,
  Play,
  Radio,
  RefreshCw,
  Scan,
  Settings2,
  Sparkles,
  Square,
  Users,
  Zap,
} from 'lucide-react'

export default function ThreeDimensionalView({
  room,
  presence,
  spatial,
  liveHealth,
  liveMeasurement,
  onNotify,
}) {
  const mountRef = useRef(null)
  const sceneRef = useRef(null)
  const rendererRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const instancedMeshRef = useRef(null)
  const spectralMeshRef = useRef(null)
  const sweepPlaneRef = useRef(null)
  const survivorGroupRef = useRef(null)
  const rfWavesGroupRef = useRef(null)
  const roomGroupRef = useRef(null)
  const animFrameIdRef = useRef(null)

  // 3D UI states
  const [cameraPreset, setCameraPreset] = useState('orbit') // 'orbit', 'top', 'side', 'spectral', 'fpv'
  const [showVoxels, setShowVoxels] = useState(true)
  const [showSpectral, setShowSpectral] = useState(true)
  const [showSurvivors, setShowSurvivors] = useState(true)
  const [showRfWaves, setShowRfWaves] = useState(true)
  const [showRoomBounds, setShowRoomBounds] = useState(true)
  const [voxelMode, setVoxelMode] = useState('hashmap') // 'hashmap', 'disturbance', 'status'
  const [scanResolution, setScanResolution] = useState(0.5)

  // Scan progress and hash map data from backend
  const [scanStatus, setScanStatus] = useState({
    isScanning: false,
    scanProgress: 100,
    scanPhase: 'COMPLETE',
    stats: { totalVoxels: 0, disturbedVoxels: 0, avgStability: 1.0 },
  })
  const [hashMap, setHashMap] = useState([])
  const [selectedVoxel, setSelectedVoxel] = useState(null)
  const [hoveredVoxel, setHoveredVoxel] = useState(null)
  const [isScanningLocal, setIsScanningLocal] = useState(false)

  // Room geometry dimensions in meters
  const roomL = room?.length || 5.2
  const roomW = room?.breadth || 4.1
  const roomH = room?.height || 2.8

  // Fetch initial 3D status and hash map
  const fetch3dData = async () => {
    try {
      const [resStatus, resMap] = await Promise.all([
        fetch('/api/3d/status').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/3d/hashmap').then((r) => (r.ok ? r.json() : null)),
      ])
      if (resStatus) {
        setScanStatus({
          isScanning: resStatus.isScanning,
          scanProgress: resStatus.scanProgress,
          scanPhase: resStatus.scanPhase,
          stats: resStatus.stats || { totalVoxels: 0, disturbedVoxels: 0, avgStability: 1.0 },
        })
        setIsScanningLocal(resStatus.isScanning)
      }
      if (resMap && resMap.voxels) {
        setHashMap(resMap.voxels)
      }
    } catch {
      // Ignore background fetch failure
    }
  }

  useEffect(() => {
    fetch3dData()
    const interval = setInterval(fetch3dData, 1500)
    return () => clearInterval(interval)
  }, [])

  // Sync scan state from liveMeasurement SSE stream if available
  useEffect(() => {
    if (liveMeasurement?.scan3d) {
      setScanStatus((prev) => ({
        ...prev,
        ...liveMeasurement.scan3d,
      }))
      setIsScanningLocal(liveMeasurement.scan3d.isScanning)
    }
  }, [liveMeasurement])

  // Trigger 3D Area Scan
  const handleStartScan = async () => {
    setIsScanningLocal(true)
    onNotify?.(`Starting 3D Wi-Fi Area Scan across ${roomL}m × ${roomW}m × ${roomH}m`)
    try {
      const res = await fetch('/api/3d/scan/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolution: scanResolution,
          length: roomL,
          breadth: roomW,
          height: roomH,
          name: 'Sector 3D Scan',
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.scan) setScanStatus((prev) => ({ ...prev, ...data.scan }))
      }
    } catch {
      onNotify?.('Error starting 3D scan')
    }
  }

  // Reset Hash Map
  const handleResetHashMap = async () => {
    try {
      const res = await fetch('/api/3d/hashmap/reset', { method: 'POST' })
      if (res.ok) {
        onNotify?.('3D Wi-Fi Hash Map reset to baseline')
        fetch3dData()
      }
    } catch {
      onNotify?.('Error resetting hash map')
    }
  }

  // Export Wi-Fi Hash Map as JSON
  const handleExportHashMap = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          room: { length: roomL, breadth: roomW, height: roomH },
          stats: scanStatus.stats,
          voxels: hashMap,
        },
        null,
        2
      )
    )
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', dataStr)
    downloadAnchor.setAttribute('download', `wifi_3d_hashmap_${Date.now()}.json`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
    onNotify?.('Exported 3D Wi-Fi Hash Map JSON')
  }

  // --- THREE.JS SCENE SETUP & RENDER LOOP ---
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const width = mount.clientWidth || 800
    const height = mount.clientHeight || 500

    // 1. Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b0d0c)
    scene.fog = new THREE.FogExp2(0x0b0d0c, 0.028)
    sceneRef.current = scene

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    camera.position.set(roomL * 1.35, roomH * 1.45, roomW * 1.45)
    cameraRef.current = camera

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // 4. Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.target.set(0, roomH * 0.4, 0)
    controls.maxPolarAngle = Math.PI / 2 + 0.05
    controls.minDistance = 2.0
    controls.maxDistance = 35.0
    controlsRef.current = controls

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xc8f36c, 0.8)
    dirLight.position.set(roomL, roomH * 2, roomW)
    scene.add(dirLight)

    const nodePointLight = new THREE.PointLight(0xc8f36c, 2.5, 8)
    nodePointLight.position.set(-roomL / 2 + 0.3, 1.0, -roomW / 2 + 0.3)
    scene.add(nodePointLight)

    // 6. Room Bounds Group
    const roomGroup = new THREE.Group()
    roomGroupRef.current = roomGroup
    scene.add(roomGroup)

    // Floor Grid
    const floorGrid = new THREE.GridHelper(Math.max(roomL, roomW) * 1.4, 20, 0x24331e, 0x18221b)
    floorGrid.position.y = 0
    roomGroup.add(floorGrid)

    // Room Bounding Box Wireframe
    const boxGeo = new THREE.BoxGeometry(roomL, roomH, roomW)
    const boxEdges = new THREE.EdgesGeometry(boxGeo)
    const boxMat = new THREE.LineBasicMaterial({ color: 0x3d5445, linewidth: 1.5 })
    const roomBoxLine = new THREE.LineSegments(boxEdges, boxMat)
    roomBoxLine.position.set(0, roomH / 2, 0)
    roomGroup.add(roomBoxLine)

    // Subtle Glass Wall Panels
    const glassMat = new THREE.MeshBasicMaterial({
      color: 0x142017,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
    })
    const roomGlassBox = new THREE.Mesh(boxGeo, glassMat)
    roomGlassBox.position.set(0, roomH / 2, 0)
    roomGroup.add(roomGlassBox)

    // 3x3 Tactical Zones projected onto the floor
    const zones = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3']
    const zoneLineMat = new THREE.LineBasicMaterial({ color: 0x273b2d })
    for (let c = 1; c < 3; c++) {
      const zx = -roomL / 2 + (c * roomL) / 3
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(zx, 0.02, -roomW / 2),
        new THREE.Vector3(zx, 0.02, roomW / 2),
      ])
      roomGroup.add(new THREE.Line(lineGeo, zoneLineMat))
    }
    for (let r = 1; r < 3; r++) {
      const zz = -roomW / 2 + (r * roomW) / 3
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-roomL / 2, 0.02, zz),
        new THREE.Vector3(roomL / 2, 0.02, zz),
      ])
      roomGroup.add(new THREE.Line(lineGeo, zoneLineMat))
    }

    // 7. ESP32 Sensor Node 3D Object
    const espGroup = new THREE.Group()
    espGroup.position.set(-roomL / 2 + 0.35, 0, -roomW / 2 + 0.35)

    // Stand Mast
    const mastGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.0, 12)
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x222a24, metalness: 0.8, roughness: 0.2 })
    const mast = new THREE.Mesh(mastGeo, mastMat)
    mast.position.y = 0.5
    espGroup.add(mast)

    // ESP32 PCB Box
    const pcbGeo = new THREE.BoxGeometry(0.24, 0.06, 0.16)
    const pcbMat = new THREE.MeshStandardMaterial({ color: 0x184422, roughness: 0.4 })
    const pcb = new THREE.Mesh(pcbGeo, pcbMat)
    pcb.position.y = 1.0
    espGroup.add(pcb)

    // Antenna
    const antGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.35, 8)
    const antMat = new THREE.MeshStandardMaterial({ color: 0xc8f36c, emissive: 0x3d5420 })
    const ant = new THREE.Mesh(antGeo, antMat)
    ant.position.set(0.08, 1.18, 0)
    espGroup.add(ant)

    scene.add(espGroup)

    // 8. Expanding RF Fresnel Wave Rings
    const rfWavesGroup = new THREE.Group()
    rfWavesGroup.position.set(-roomL / 2 + 0.35, 1.0, -roomW / 2 + 0.35)
    rfWavesGroupRef.current = rfWavesGroup
    scene.add(rfWavesGroup)

    const waveRings = []
    for (let i = 0; i < 4; i++) {
      const ringGeo = new THREE.RingGeometry(0.3, 0.34, 32)
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xc8f36c,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
      })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = Math.PI / 2
      rfWavesGroup.add(ring)
      waveRings.push({ mesh: ring, offset: i * 0.25 })
    }

    // 9. Scanning Laser Sweep Plane
    const sweepGeo = new THREE.PlaneGeometry(roomW, roomH)
    const sweepMat = new THREE.MeshBasicMaterial({
      color: 0xf2bf6b,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    })
    const sweepPlane = new THREE.Mesh(sweepGeo, sweepMat)
    sweepPlane.rotation.y = Math.PI / 2
    sweepPlane.position.set(-roomL / 2, roomH / 2, 0)
    sweepPlane.visible = false
    scene.add(sweepPlane)
    sweepPlaneRef.current = sweepPlane

    // 10. Survivors Group
    const survivorGroup = new THREE.Group()
    survivorGroupRef.current = survivorGroup
    scene.add(survivorGroup)

    // 11. 3D Spectral Waterfall Surface Mesh
    const specCols = 64
    const specRows = 32
    const specGeo = new THREE.PlaneGeometry(roomL * 0.95, roomW * 0.75, specCols - 1, specRows - 1)
    specGeo.rotateX(-Math.PI / 2)
    const specMat = new THREE.MeshStandardMaterial({
      color: 0x63e6e2,
      wireframe: true,
      transparent: true,
      opacity: 0.8,
      emissive: 0x112824,
    })
    const spectralMesh = new THREE.Mesh(specGeo, specMat)
    spectralMesh.position.set(0, 0.05, 0)
    scene.add(spectralMesh)
    spectralMeshRef.current = spectralMesh

    // 12. Animation loop
    let clock = new THREE.Clock()
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()

      controls.update()

      // Animate RF Fresnel waves expanding
      if (showRfWaves) {
        waveRings.forEach(({ mesh, offset }) => {
          const t = (elapsed * 0.5 + offset) % 1.0
          const scale = 0.5 + t * Math.max(roomL, roomW) * 2.2
          mesh.scale.set(scale, scale, scale)
          mesh.material.opacity = (1.0 - t) * 0.6
        })
      }

      // Animate Laser Sweep Plane during 3D Area Scan
      if (sweepPlaneRef.current) {
        if (isScanningLocal) {
          sweepPlaneRef.current.visible = true
          const sweepX = -roomL / 2 + ((elapsed * 0.6) % 1.0) * roomL
          sweepPlaneRef.current.position.x = sweepX
        } else {
          sweepPlaneRef.current.visible = false
        }
      }

      // Animate Survivor Respiration spheres (pulsing at BPM)
      if (survivorGroupRef.current) {
        const bpm = presence?.breathingBpm || 16
        const pulse = 1.0 + Math.sin(elapsed * (bpm / 60) * Math.PI * 2) * 0.18
        survivorGroupRef.current.children.forEach((child) => {
          if (child.userData?.isHalo) {
            child.scale.set(pulse, pulse, pulse)
          }
        })
      }

      // Animate 3D Spectral Waterfall surface mesh vertices
      if (spectralMeshRef.current && showSpectral) {
        const pos = spectralMeshRef.current.geometry.attributes.position
        const distLevel = spatial?.disturbanceLevel ?? 0.15
        for (let i = 0; i < pos.count; i++) {
          const u = i % specCols
          const v = Math.floor(i / specCols)
          // Wave oscillations + physical OFDM ripple
          const wave =
            Math.sin(elapsed * 2.5 + u * 0.35 + v * 0.25) * 0.12 * distLevel +
            Math.cos(elapsed * 1.8 + u * 0.15) * 0.08
          pos.setY(i, Math.max(0.02, wave + distLevel * 0.35))
        }
        pos.needsUpdate = true
      }

      renderer.render(scene, camera)
    }
    animate()

    // Resize handler
    const handleResize = () => {
      if (!mount) return
      const w = mount.clientWidth
      const h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current)
      renderer.dispose()
      if (mount && renderer.domElement) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [roomL, roomW, roomH])

  // --- UPDATE 3D WI-FI HASH MAP INSTANCED VOXELS ---
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    // Remove old instanced mesh if present
    if (instancedMeshRef.current) {
      scene.remove(instancedMeshRef.current)
      instancedMeshRef.current.geometry.dispose()
      instancedMeshRef.current.material.dispose()
      instancedMeshRef.current = null
    }

    if (!showVoxels || !hashMap || hashMap.length === 0) return

    const voxelSize = 0.22
    const geo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize)
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.3,
      metalness: 0.2,
      transparent: true,
      opacity: 0.85,
    })

    const count = hashMap.length
    const mesh = new THREE.InstancedMesh(geo, mat, count)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    const dummy = new THREE.Object3D()
    const color = new THREE.Color()

    for (let i = 0; i < count; i++) {
      const v = hashMap[i]
      // Map room coordinates (0..L, 0..W, 0..H) to 3D center origin
      const wx = v.x - roomL / 2
      const wy = v.z // Y is vertical in Three.js
      const wz = v.y - roomW / 2

      dummy.position.set(wx, wy, wz)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      // Color coding by Wi-Fi status & disturbance
      if (v.status === 'HIGH_DISTURBANCE' || v.currentDisturbance >= 0.65) {
        color.setRGB(1.0, 0.15, 0.1) // Hot incandescent red
      } else if (v.status === 'PERTURBED' || v.currentDisturbance >= 0.28) {
        color.setRGB(0.95, 0.72, 0.2) // Amber disturbance
      } else {
        // Stable baseline Wi-Fi hash
        color.setRGB(0.2, 0.85, 0.62) // Cyan-mint stable
      }
      mesh.setColorAt(i, color)
    }

    mesh.instanceColor.needsUpdate = true
    mesh.instanceMatrix.needsUpdate = true
    scene.add(mesh)
    instancedMeshRef.current = mesh
  }, [hashMap, showVoxels, roomL, roomW, roomH])

  // --- UPDATE 3D SURVIVORS & RESPIRATION HALOS ---
  useEffect(() => {
    const group = survivorGroupRef.current
    if (!group) return

    // Clear previous survivor models
    while (group.children.length > 0) {
      const obj = group.children[0]
      group.remove(obj)
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) obj.material.dispose()
    }

    if (!showSurvivors) return

    const targets = spatial?.targets || []
    targets.forEach((t) => {
      const wx = t.x - roomL / 2
      const wy = 1.05 // Human chest height ~1.05m
      const wz = t.y - roomW / 2

      const tGroup = new THREE.Group()
      tGroup.position.set(wx, wy, wz)

      // 1. Core Glowing Target Blip Sphere
      const blipGeo = new THREE.SphereGeometry(0.18, 16, 16)
      const blipMat = new THREE.MeshStandardMaterial({
        color: 0xf2bf6b,
        emissive: 0x996611,
        roughness: 0.2,
      })
      const blipMesh = new THREE.Mesh(blipGeo, blipMat)
      tGroup.add(blipMesh)

      // 2. Respiration Pulsing Halo Sphere
      const haloGeo = new THREE.SphereGeometry(0.38, 24, 24)
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0x63e6e2,
        transparent: true,
        opacity: 0.32,
        wireframe: true,
      })
      const haloMesh = new THREE.Mesh(haloGeo, haloMat)
      haloMesh.userData = { isHalo: true }
      tGroup.add(haloMesh)

      // 3. Drop Shadow / Projection on floor
      const projGeo = new THREE.RingGeometry(0.1, 0.45, 16)
      const projMat = new THREE.MeshBasicMaterial({ color: 0xf2bf6b, side: THREE.DoubleSide, transparent: true, opacity: 0.4 })
      const projMesh = new THREE.Mesh(projGeo, projMat)
      projMesh.rotation.x = Math.PI / 2
      projMesh.position.y = -wy + 0.02
      tGroup.add(projMesh)

      group.add(tGroup)
    })
  }, [spatial?.targets, showSurvivors, roomL, roomW])

  // --- CAMERA PRESET SWITCHING ---
  const applyCameraPreset = (preset) => {
    setCameraPreset(preset)
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return

    if (preset === 'orbit') {
      camera.position.set(roomL * 1.35, roomH * 1.45, roomW * 1.45)
      controls.target.set(0, roomH * 0.4, 0)
    } else if (preset === 'top') {
      camera.position.set(0, roomH * 2.8, 0.01)
      controls.target.set(0, 0, 0)
    } else if (preset === 'side') {
      camera.position.set(roomL * 1.8, roomH * 0.5, 0)
      controls.target.set(0, roomH * 0.5, 0)
    } else if (preset === 'spectral') {
      camera.position.set(0, roomH * 0.8, roomW * 1.2)
      controls.target.set(0, 0.2, 0)
    } else if (preset === 'fpv') {
      // Look from ESP32 antenna into the room
      camera.position.set(-roomL / 2 + 0.45, 1.25, -roomW / 2 + 0.45)
      controls.target.set(roomL * 0.2, 1.0, roomW * 0.2)
    }
  }

  // --- RAYCASTING FOR VOXEL INSPECTION ---
  const handleCanvasClick = (e) => {
    const mount = mountRef.current
    const camera = cameraRef.current
    const mesh = instancedMeshRef.current
    if (!mount || !camera || !mesh || !hashMap.length) return

    const rect = mount.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    )

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, camera)
    const intersects = raycaster.intersectObject(mesh)

    if (intersects.length > 0) {
      const instanceId = intersects[0].instanceId
      if (instanceId !== undefined && hashMap[instanceId]) {
        setSelectedVoxel(hashMap[instanceId])
        onNotify?.(`Inspecting Voxel ${hashMap[instanceId].id} in Zone ${hashMap[instanceId].zone}`)
      }
    } else {
      setSelectedVoxel(null)
    }
  }

  return (
    <div className="three-d-studio-container">
      {/* 3D Header & Tactical Controls */}
      <div className="three-d-header">
        <div className="three-d-title-block">
          <div className="panel-kicker">
            <Boxes size={14} /> 3D SPATIAL SENSING & WI-FI HASH MAP STUDIO
          </div>
          <h2>
            Volumetric 3D Scanner & Spectral Disturbance ({roomL}m × {roomW}m × {roomH}m)
          </h2>
        </div>

        <div className="three-d-actions">
          <button
            className={`secondary-button ${isScanningLocal ? 'is-active' : ''}`}
            onClick={handleStartScan}
            disabled={isScanningLocal}
          >
            {isScanningLocal ? <RefreshCw size={14} className="spin-icon" /> : <Scan size={14} />}
            {isScanningLocal ? `Scanning (${scanStatus.scanProgress}%)` : 'Start 3D Area Scan'}
          </button>

          <button className="secondary-button" onClick={handleResetHashMap} title="Reset Wi-Fi Hash Map to fresh baseline">
            <RefreshCw size={13} /> Reset Hash Map
          </button>

          <button className="secondary-button" onClick={handleExportHashMap} title="Export 3D Wi-Fi Hash Map as JSON">
            <Download size={13} /> Export Hash Map
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="three-d-stats-bar">
        <div className="stat-item">
          <span className="stat-label">Mapped Volume</span>
          <strong className="stat-val">{(roomL * roomW * roomH).toFixed(1)} m³</strong>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total 3D Voxels</span>
          <strong className="stat-val">{scanStatus.stats?.totalVoxels || hashMap.length || 0}</strong>
        </div>
        <div className="stat-item">
          <span className="stat-label">Disturbed Voxels</span>
          <strong className={`stat-val ${(scanStatus.stats?.disturbedVoxels || 0) > 0 ? 'amber' : ''}`}>
            {scanStatus.stats?.disturbedVoxels || 0}
          </strong>
        </div>
        <div className="stat-item">
          <span className="stat-label">RF Stability Index</span>
          <strong className="stat-val lime">
            {((scanStatus.stats?.avgStability ?? 1.0) * 100).toFixed(1)}%
          </strong>
        </div>
        <div className="stat-item">
          <span className="stat-label">Wi-Fi Scan Phase</span>
          <strong className="stat-val blue">{scanStatus.scanPhase || 'COMPLETE'}</strong>
        </div>
      </div>

      {/* Main 3D Viewport Area */}
      <div className="three-d-viewport-wrapper">
        <div
          ref={mountRef}
          className="three-d-canvas-container"
          onClick={handleCanvasClick}
          style={{ cursor: 'grab' }}
        />

        {/* Viewport Floating HUD Controls */}
        <div className="three-d-hud-top-left">
          <div className="hud-pill-group">
            <button
              className={`hud-btn ${cameraPreset === 'orbit' ? 'active' : ''}`}
              onClick={() => applyCameraPreset('orbit')}
              title="3D Tactical Orbit View"
            >
              <Compass size={12} /> 3D Orbit
            </button>
            <button
              className={`hud-btn ${cameraPreset === 'top' ? 'active' : ''}`}
              onClick={() => applyCameraPreset('top')}
              title="Top-Down Ortho Radar View"
            >
              <Maximize2 size={12} /> Top Plan
            </button>
            <button
              className={`hud-btn ${cameraPreset === 'side' ? 'active' : ''}`}
              onClick={() => applyCameraPreset('side')}
              title="Side Elevation Cross-Section"
            >
              <Layers3 size={12} /> Side Cross
            </button>
            <button
              className={`hud-btn ${cameraPreset === 'spectral' ? 'active' : ''}`}
              onClick={() => applyCameraPreset('spectral')}
              title="Focus on 3D Spectral Waterfall Surface"
            >
              <Activity size={12} /> Spectral 3D
            </button>
            <button
              className={`hud-btn ${cameraPreset === 'fpv' ? 'active' : ''}`}
              onClick={() => applyCameraPreset('fpv')}
              title="ESP32 Antenna Point-of-View"
            >
              <Antenna size={12} /> ESP32 FPV
            </button>
          </div>
        </div>

        {/* Viewport Layer Toggles */}
        <div className="three-d-hud-top-right">
          <div className="hud-layer-toggles">
            <label className="hud-checkbox">
              <input
                type="checkbox"
                checked={showVoxels}
                onChange={(e) => setShowVoxels(e.target.checked)}
              />
              <span>Wi-Fi Hash Voxels</span>
            </label>
            <label className="hud-checkbox">
              <input
                type="checkbox"
                checked={showSpectral}
                onChange={(e) => setShowSpectral(e.target.checked)}
              />
              <span>3D Spectral Mesh</span>
            </label>
            <label className="hud-checkbox">
              <input
                type="checkbox"
                checked={showSurvivors}
                onChange={(e) => setShowSurvivors(e.target.checked)}
              />
              <span>Survivor Avatars</span>
            </label>
            <label className="hud-checkbox">
              <input
                type="checkbox"
                checked={showRfWaves}
                onChange={(e) => setShowRfWaves(e.target.checked)}
              />
              <span>RF Fresnel Waves</span>
            </label>
          </div>
        </div>

        {/* Selected Voxel AR Inspector Popover */}
        {selectedVoxel && (
          <div className="three-d-voxel-card">
            <div className="voxel-card-header">
              <div className="voxel-id-badge">
                <Box size={13} />
                <span>{selectedVoxel.id}</span>
              </div>
              <button className="icon-button" onClick={() => setSelectedVoxel(null)}>
                ✕
              </button>
            </div>
            <div className="voxel-card-body">
              <div className="voxel-row">
                <span>3D Coordinates</span>
                <strong>
                  X:{selectedVoxel.x}m · Y:{selectedVoxel.y}m · Z:{selectedVoxel.z}m
                </strong>
              </div>
              <div className="voxel-row">
                <span>Room Zone</span>
                <strong>Zone {selectedVoxel.zone}</strong>
              </div>
              <div className="voxel-row">
                <span>Wi-Fi Baseline Hash</span>
                <strong className="hash-code">#{selectedVoxel.hash}</strong>
              </div>
              <div className="voxel-row">
                <span>Live Perturbation Hash</span>
                <strong className={`hash-code ${selectedVoxel.isDisturbed ? 'amber' : ''}`}>
                  #{selectedVoxel.liveHash}
                </strong>
              </div>
              <div className="voxel-row">
                <span>RF Disturbance Level</span>
                <strong className={selectedVoxel.isDisturbed ? 'warn-text' : 'lime'}>
                  {Math.round(selectedVoxel.currentDisturbance * 100)}% ({selectedVoxel.status})
                </strong>
              </div>
              <div className="voxel-row">
                <span>Subcarrier Phase Shift</span>
                <strong>Δφ: {selectedVoxel.phaseShiftDeg}°</strong>
              </div>
              <div className="voxel-row">
                <span>Distance to Node</span>
                <strong>{selectedVoxel.distToNode} meters</strong>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="three-d-legend">
          <span>
            <i style={{ background: '#2ae49e' }} /> Stable Wi-Fi Baseline
          </span>
          <span>
            <i style={{ background: '#f2bf6b' }} /> Perturbed Voxel (Change)
          </span>
          <span>
            <i style={{ background: '#ff3b30' }} /> High Disturbance (Survivor)
          </span>
          <span>
            <i style={{ background: '#c8f36c' }} /> ESP32-WROOM Node
          </span>
        </div>
      </div>

      {/* Lower Details: Area Scan Parameters & Spectral Breakdown */}
      <div className="three-d-lower-grid">
        <div className="panel three-d-info-panel">
          <div className="panel-header compact">
            <div>
              <div className="panel-kicker">
                <Settings2 size={13} /> SCAN CONFIGURATION & AREA BOUNDS
              </div>
              <h2>3D Spatial Hash Map Engine</h2>
            </div>
          </div>
          <div className="info-content-grid">
            <div className="config-item">
              <span className="cfg-label">Voxel Resolution</span>
              <div className="cfg-btn-row">
                <button
                  className={`cfg-pill ${scanResolution === 0.5 ? 'active' : ''}`}
                  onClick={() => setScanResolution(0.5)}
                >
                  Standard (0.50m)
                </button>
                <button
                  className={`cfg-pill ${scanResolution === 0.25 ? 'active' : ''}`}
                  onClick={() => setScanResolution(0.25)}
                >
                  Fine (0.25m)
                </button>
              </div>
            </div>
            <div className="config-item">
              <span className="cfg-label">Physical Area Boundaries</span>
              <strong className="cfg-val">
                {roomL}m (L) × {roomW}m (W) × {roomH}m (H)
              </strong>
            </div>
            <div className="config-item">
              <span className="cfg-label">Wi-Fi Channel State Protocol</span>
              <strong className="cfg-val">IEEE 802.11bf / ESP-CSI 64-OFDM</strong>
            </div>
            <div className="config-item">
              <span className="cfg-label">Multipath Reflection Profiling</span>
              <strong className="cfg-val">
                Direct Path ({room?.directPathM || 2.1}m) + First-Order Echoes ({room?.wallEcho1M || 4.1}m)
              </strong>
            </div>
          </div>
        </div>

        <div className="panel three-d-info-panel">
          <div className="panel-header compact">
            <div>
              <div className="panel-kicker">
                <Activity size={13} /> 3D SPECTRAL DISTURBANCE MATRIX
              </div>
              <h2>Real-Time Doppler & Notch Dispersion</h2>
            </div>
          </div>
          <div className="spectral-stats-row">
            <div className="spectral-stat-box">
              <span>Doppler Shift</span>
              <strong>{presence?.dopplerProxy || 0.0} Hz</strong>
            </div>
            <div className="spectral-stat-box">
              <span>Temporal Spread</span>
              <strong>{presence?.temporalVariance || 0.0}</strong>
            </div>
            <div className="spectral-stat-box">
              <span>Active Subcarriers</span>
              <strong>64 OFDM (HT20)</strong>
            </div>
            <div className="spectral-stat-box">
              <span>Respiration Peak</span>
              <strong className="cyan">
                {presence?.breathingBpm ? `${presence.breathingBpm} BPM` : 'No periodic motion'}
              </strong>
            </div>
          </div>
          <p className="spectral-explainer">
            The 3D Spectral View maps time × 64 subcarriers × perturbation energy into a topological surface.
            Human body displacement alters multipath constructive interference, twisting the spatial hash and
            highlighting survivor motion in true 3D space.
          </p>
        </div>
      </div>
    </div>
  )
}
