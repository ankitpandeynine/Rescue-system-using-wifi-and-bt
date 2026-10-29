import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity,
  AlertTriangle,
  Antenna,
  ArrowRight,
  Boxes,
  Brain,
  Check,
  ChevronDown,
  Clock,
  Compass,
  Cpu,
  Eye,
  FileCheck,
  FileText,
  Flame,
  Globe,
  HardDrive,
  Home,
  Layers3,
  Lock,
  MapPin,
  Menu,
  Plus,
  Radio,
  RefreshCw,
  Router,
  Scan,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Users,
  Wifi,
  X,
  Zap,
} from 'lucide-react'
import './styles.css'
import HomeView from './components/HomeView.jsx'
import DevicesView from './components/DevicesView.jsx'
import WorkspaceView from './components/WorkspaceView.jsx'
import ObservatoryView from './components/ObservatoryView.jsx'
import PrivacyModeModal from './components/PrivacyModeModal.jsx'

const navItems = [
  { label: 'Home', icon: Home, desc: 'Orientation, health & shortcuts' },
  { label: 'Devices', icon: Antenna, desc: 'Registry, feeds & Signal Lab' },
  { label: 'Workspace', icon: Layers3, desc: 'Twin builder, noise lab, AI copilot' },
  { label: 'Observatory', icon: Boxes, desc: 'The special 3D RF view' },
]

function App() {
  const [activeNav, setActiveNav] = useState('Home')
  const [toast, setToast] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [showModeModal, setShowModeModal] = useState(false)
  const [isSimulator, setIsSimulator] = useState(false)

  // System states
  const [status, setStatus] = useState(null)
  const [devices, setDevices] = useState([])
  const [sites, setSites] = useState([])
  const [modeState, setModeState] = useState({ current: 'BASELINE', incident: {} })
  const [auditLog, setAuditLog] = useState([])
  const [liveHealth, setLiveHealth] = useState(null)
  const [liveMeasurement, setLiveMeasurement] = useState(null)

  const notify = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 4500)
  }

  // Fetch initial DRISHTI state & poll
  const fetchAllData = async () => {
    try {
      const [resStatus, resDevices, resSites, resMode, resAudit, resHealth, resLatest] = await Promise.all([
        fetch('/api/v1/status').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/v1/devices').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/v1/sites').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/v1/mode').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/v1/audit').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/health').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/latest').then((r) => (r.ok ? r.json() : null)),
      ])

      if (resStatus) setStatus(resStatus)
      if (resDevices?.devices) setDevices(resDevices.devices)
      if (resSites?.sites) setSites(resSites.sites)
      if (resMode) setModeState({ current: resMode.mode, incident: resMode.incident })
      if (resAudit?.entries) setAuditLog(resAudit.entries)
      if (resHealth) setLiveHealth(resHealth)
      if (resLatest) setLiveMeasurement(resLatest)
    } catch {
      // Backend offline or starting up
    }
  }

  useEffect(() => {
    fetchAllData()
    const timer = setInterval(fetchAllData, 3000)
    return () => clearInterval(timer)
  }, [])

  // Switch sensing mode
  const handleSwitchMode = async (newMode, actor = 'operator', authContext = {}) => {
    try {
      const res = await fetch('/api/v1/mode/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode, actor, authContext }),
      })
      if (res.ok) {
        const data = await res.json()
        setModeState({ current: data.mode, incident: data.incident })
        fetchAllData()
      }
    } catch {
      notify('Failed to switch sensing mode')
    }
  }

  // Run RF confirmation loop
  const handleRunRfConfirm = async () => {
    try {
      const res = await fetch('/api/v1/rf-confirm', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        notify(`Physics Confirmation: ${(data.rfAgreementScore * 100).toFixed(0)}% link agreement within \u03C4 = 6 dB`)
        fetchAllData()
      }
    } catch {
      notify('Error running RF confirmation loop')
    }
  }

  // Recalibrate empty room baseline
  const handleCalibrate = async () => {
    try {
      await fetch('/api/calibrate', { method: 'POST' })
      notify('Zero-motion baseline started: sampling 50 CSI frames...')
    } catch {
      notify('Failed to start calibration')
    }
  }

  const room = liveMeasurement?.room || { length: 5.2, breadth: 4.1, height: 2.8, area: 21.3 }
  const presence = liveMeasurement?.presence || {
    probability: 0.0,
    presenceClass: 'NO_HUMAN_EVIDENCE',
    activityState: 'QUIET',
    estimatedPeople: 0,
    breathingBpm: null,
  }
  const spatial = liveMeasurement?.spatial || {
    x: room.length / 2,
    y: room.breadth / 2,
    activeZone: 'B2',
    zoneName: 'Center',
    uncertaintyM: 1.1,
    disturbanceLevel: 0.1,
  }

  return (
    <div className="drishti-app-shell">
      {/* Toast Notification Banner */}
      {toast && (
        <div className="toast-notification">
          <Zap size={15} />
          <span>{toast}</span>
          <button className="toast-close" onClick={() => setToast('')}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Sensing Mode & Governance Modal */}
      {showModeModal && (
        <PrivacyModeModal
          modeState={modeState}
          auditLog={auditLog}
          onSwitchMode={handleSwitchMode}
          onClose={() => setShowModeModal(false)}
          onNotify={notify}
        />
      )}

      {/* Main Sidebar */}
      <aside className={`drishti-sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="sidebar-brand-box">
          <div className="brand-logo-mark">
            <Boxes size={20} />
          </div>
          <div className="brand-copy">
            <div className="brand-title-row">
              <h2>DRISHTI</h2>
              <span className="hindi-title">दृष्टि</span>
            </div>
            <span className="brand-motto">Know where, not who.</span>
          </div>
        </div>

        {/* Navigation Items (The Four Pages) */}
        <div className="nav-group-label">OBSERVATORY PAGES</div>
        <nav className="drishti-nav-menu">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                className={`nav-btn ${activeNav === item.label ? 'active' : ''}`}
                onClick={() => {
                  setActiveNav(item.label)
                  setMobileNav(false)
                }}
              >
                <Icon size={18} />
                <div className="nav-btn-copy">
                  <span className="nav-btn-label">{item.label}</span>
                  <span className="nav-btn-desc">{item.desc}</span>
                </div>
              </button>
            )
          })}
        </nav>

        {/* Sidebar Footer Privacy Status */}
        <div className="sidebar-privacy-footer">
          <div className="privacy-badge-box">
            <div className="privacy-badge-icon">
              <ShieldCheck size={16} />
            </div>
            <div className="privacy-badge-copy">
              <strong>Zero Personal Data</strong>
              <span>No cameras · No MAC IDs</span>
            </div>
          </div>
          <div className="hardware-indicator-row">
            <span>ESP32-S3 Mesh</span>
            <span className="live-dot-green">● 115200 baud</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="drishti-main-area">
        {/* Top Header Status Strip */}
        <header className="drishti-topbar">
          <div className="topbar-left">
            <button
              className="icon-btn mobile-menu-toggle"
              onClick={() => setMobileNav(!mobileNav)}
              aria-label="Toggle Navigation"
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumb-nav">
              <span className="brand-crumb">DRISHTI</span>
              <span>/</span>
              <strong className="page-crumb">{activeNav}</strong>
            </div>
          </div>

          <div className="topbar-right">
            {/* Interactive Sensing Mode Pill */}
            <button
              className={`mode-indicator-pill ${modeState?.current?.toLowerCase() || 'baseline'}`}
              onClick={() => setShowModeModal(true)}
              title="Click to view governance rules or declare an incident"
            >
              <span className="mode-dot" />
              <span>MODE: {modeState?.current || 'BASELINE'}</span>
              <ChevronDown size={13} />
            </button>

            {/* Identifiers Stored Badge */}
            <div className="privacy-counter-pill" title="Strict architectural invariant: 0 personal identifiers stored">
              <Lock size={13} />
              <span>IDs: 0</span>
            </div>

            {/* Devices Count */}
            <div className="devices-online-pill" onClick={() => setActiveNav('Devices')}>
              <Antenna size={13} />
              <span>{status?.devicesOnline || 6}/8 Nodes</span>
            </div>

            {/* AI Provider Status */}
            <div className="ai-status-pill" title="AI Layer: Local Model First with read-only tools">
              <Brain size={13} />
              <span>AI: Local Model</span>
            </div>
          </div>
        </header>

        {/* Page Content Rendering */}
        <main className="drishti-page-body">
          {activeNav === 'Home' && (
            <HomeView
              status={status}
              sites={sites}
              modeState={modeState}
              onOpenObservatory={(siteId) => setActiveNav('Observatory')}
              onOpenDevices={() => setActiveNav('Devices')}
              onOpenWorkspace={(subTab) => setActiveNav('Workspace')}
              onOpenModeModal={() => setShowModeModal(true)}
              onRunRfConfirm={handleRunRfConfirm}
              onToggleSimulator={() => {
                setIsSimulator(!isSimulator)
                notify(`Switched to ${!isSimulator ? 'Synthetic Simulator' : 'Live ESP32 Hardware'}`)
              }}
              isSimulator={isSimulator}
              onNotify={notify}
            />
          )}

          {activeNav === 'Devices' && (
            <DevicesView
              devices={devices}
              modeState={modeState}
              liveMeasurement={liveMeasurement}
              onNotify={notify}
              onCalibrate={handleCalibrate}
            />
          )}

          {activeNav === 'Workspace' && (
            <WorkspaceView
              sites={sites}
              modeState={modeState}
              liveMeasurement={liveMeasurement}
              onNotify={notify}
              onRunRfConfirm={handleRunRfConfirm}
              onOpenObservatory={() => setActiveNav('Observatory')}
            />
          )}

          {activeNav === 'Observatory' && (
            <ObservatoryView
              room={room}
              presence={presence}
              spatial={spatial}
              modeState={modeState}
              liveMeasurement={liveMeasurement}
              onNotify={notify}
              onOpenModeModal={() => setShowModeModal(true)}
            />
          )}
        </main>
      </div>
    </div>
  )
}

const root = createRoot(document.getElementById('root'))
root.render(<App />)
