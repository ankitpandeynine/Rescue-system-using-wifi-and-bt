import { useState } from 'react'
import {
  Activity,
  AlertCircle,
  Antenna,
  BatteryMedium,
  CheckCircle2,
  Clock,
  Cpu,
  Flame,
  Gauge,
  HardDrive,
  Info,
  Layers,
  Lock,
  Plus,
  Radio,
  RefreshCw,
  Router,
  Search,
  Settings2,
  ShieldCheck,
  Signal,
  Smartphone,
  Sliders,
  Terminal,
  Wifi,
  Zap,
} from 'lucide-react'

export default function DevicesView({
  devices,
  modeState,
  liveMeasurement,
  onNotify,
  onCalibrate,
}) {
  const [selectedDeviceId, setSelectedDeviceId] = useState('DR-CSI-01')
  const [filterRole, setFilterRole] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddWizard, setShowAddWizard] = useState(false)
  const [activeTab, setActiveTab] = useState('feeds') // 'feeds' | 'calibration' | 'registered'

  const selectedDevice = (devices || []).find((d) => d.id === selectedDeviceId) || devices?.[0]

  const filteredDevices = (devices || []).filter((d) => {
    const matchesRole = filterRole === 'ALL' || d.role.includes(filterRole)
    const matchesSearch =
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.id.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesRole && matchesSearch
  })

  return (
    <div className="devices-container">
      {/* Top Bar */}
      <div className="devices-topbar">
        <div className="search-filter-group">
          <div className="search-input-box">
            <Search size={15} />
            <input
              type="text"
              placeholder="Search sensors by ID or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="role-filter-pills">
            {['ALL', 'CSI', 'LINK', 'SCANNER', 'RADAR'].map((role) => (
              <button
                key={role}
                className={`filter-pill ${filterRole === role ? 'active' : ''}`}
                onClick={() => setFilterRole(role)}
              >
                {role}
              </button>
            ))}
          </div>
        </div>

        <div className="devices-top-actions">
          <span className="mesh-stat-badge">
            <Antenna size={13} /> Mesh: 8 Nodes · 28 Links · Ch 6
          </span>
          <button className="primary-action-btn" onClick={() => setShowAddWizard(true)}>
            <Plus size={15} /> Add Sensor Node
          </button>
        </div>
      </div>

      {/* Main 3-Column Studio Grid */}
      <div className="devices-grid">
        {/* Left Column: Device Cards List */}
        <div className="devices-list-panel panel">
          <div className="panel-header compact">
            <div>
              <div className="panel-kicker">
                <Antenna size={13} /> SENSOR REGISTRY
              </div>
              <h3>Connected Hardware ({filteredDevices.length})</h3>
            </div>
            <span className="status-pill green">ALL SYNCED</span>
          </div>

          <div className="device-cards-scroll">
            {filteredDevices.map((dev) => (
              <div
                key={dev.id}
                className={`device-item-card ${dev.id === selectedDeviceId ? 'selected' : ''}`}
                onClick={() => setSelectedDeviceId(dev.id)}
              >
                <div className="dev-card-header">
                  <div className="dev-icon-title">
                    <div className="dev-icon">
                      {dev.kind === 'radar' ? <Radio size={16} /> : <Router size={16} />}
                    </div>
                    <div>
                      <strong>{dev.id}</strong>
                      <span className="dev-name-sub">{dev.name}</span>
                    </div>
                  </div>
                  <span className={`role-badge ${dev.role.toLowerCase()}`}>{dev.role}</span>
                </div>

                <div className="dev-card-meta">
                  <span className="meta-item">
                    <Signal size={12} /> SQI {(dev.sqi * 100).toFixed(0)}%
                  </span>
                  {dev.battery && (
                    <span className="meta-item">
                      <BatteryMedium size={12} /> {dev.battery}%
                    </span>
                  )}
                  <span className="meta-item">
                    <Activity size={12} /> {dev.packetRateHz || 50} Hz
                  </span>
                  <span className="meta-item chip-type">
                    {dev.kind === 'esp32' ? 'ESP32-S3' : dev.kind}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center Column: Feed Explorer for Selected Device */}
        <div className="device-detail-panel panel">
          <div className="panel-header compact">
            <div>
              <div className="panel-kicker">
                <Sliders size={13} /> ACTIVE FEEDS & TELEMETRY
              </div>
              <h3>{selectedDevice?.name} ({selectedDevice?.id})</h3>
            </div>
            <div className="tab-pill-group">
              <button
                className={`tab-pill ${activeTab === 'feeds' ? 'active' : ''}`}
                onClick={() => setActiveTab('feeds')}
              >
                Feeds
              </button>
              <button
                className={`tab-pill ${activeTab === 'calibration' ? 'active' : ''}`}
                onClick={() => setActiveTab('calibration')}
              >
                Calibration
              </button>
              <button
                className={`tab-pill ${activeTab === 'registered' ? 'active' : ''}`}
                onClick={() => setActiveTab('registered')}
              >
                Registered Devices
              </button>
            </div>
          </div>

          {activeTab === 'feeds' && (
            <div className="feeds-body">
              {/* Feed Toggles */}
              <div className="feed-toggles-grid">
                {[
                  { id: 'csi', label: 'CSI Subcarriers', rate: '50 Hz', class: 'Medium' },
                  { id: 'rssi_links', label: 'RSSI Link Matrix', rate: '10 Hz', class: 'Low' },
                  { id: 'mgmt_frames', label: 'Probe Bursts (mgmt)', rate: 'Event', class: 'Incident Only', locked: modeState?.current !== 'INCIDENT' },
                  { id: 'ap_scan', label: 'AP Environment Scan', rate: '0.5 Hz', class: 'Low' },
                  { id: 'radar', label: 'mmWave Micro-Motion', rate: '20 Hz', class: 'Medium' },
                  { id: 'health', label: 'Hardware Health / Sync', rate: '1 Hz', class: 'Low' },
                ].map((f) => (
                  <div key={f.id} className={`feed-toggle-card ${f.locked ? 'locked' : 'active'}`}>
                    <div className="feed-card-top">
                      <span className="feed-name">{f.label}</span>
                      <span className="feed-rate">{f.rate}</span>
                    </div>
                    <div className="feed-card-status">
                      <span className={`privacy-class-tag ${f.class.toLowerCase().replace(' ', '-')}`}>
                        {f.locked ? <Lock size={10} /> : null} {f.class}
                      </span>
                      <span className="feed-switch">{f.locked ? 'LOCKED' : 'STREAMING'}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Live Signal Oscilloscope / CSI Heatmap Strip */}
              <div className="signal-plot-box">
                <div className="plot-header">
                  <span>
                    <Activity size={13} /> 64-Subcarrier CSI Amplitude Dispersion (Link {selectedDevice?.id}&gt;DR-CSI-02)
                  </span>
                  <span className="plot-legend">Live 50 Hz Frame Rate</span>
                </div>
                <div className="csi-spectrogram-bars">
                  {Array.from({ length: 48 }).map((_, i) => {
                    const h = 25 + Math.sin(i * 0.2 + Date.now() * 0.003) * 20 + Math.random() * 8
                    const isMid = i > 18 && i < 30
                    return (
                      <div
                        key={i}
                        className={`spectrogram-bar ${isMid ? 'disturbed' : ''}`}
                        style={{ height: `${Math.min(95, Math.max(15, h))}%` }}
                        title={`Subcarrier ${i}: ${h.toFixed(1)} dB`}
                      />
                    )
                  })}
                </div>
                <div className="plot-footer-sub">
                  <span>Subcarrier -32 (2402 MHz)</span>
                  <span>Center Channel 6 (2437 MHz)</span>
                  <span>Subcarrier +32 (2472 MHz)</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'calibration' && (
            <div className="calibration-body">
              <div className="calib-card">
                <h4>Empty-Room Baseline Capture</h4>
                <p>Captures 50 stationary CSI frames to establish zero-motion baseline and lock multipath reflection delays.</p>
                <button className="primary-action-btn" onClick={onCalibrate}>
                  <RefreshCw size={14} /> Recalibrate Empty-Room Baseline
                </button>
              </div>

              <div className="calib-card">
                <h4>Wall-Attenuation Calibration Wizard</h4>
                <p>Measures one-hop attenuation across known wall obstacles to fit local material loss priors (drywall, brick, concrete).</p>
                <button
                  className="secondary-action-btn"
                  onClick={() => onNotify?.('Wall attenuation test completed: Drywall 4.2 dB, Brick 14.8 dB')}
                >
                  <Gauge size={14} /> Run Wall Attenuation Test
                </button>
              </div>

              <div className="calib-card">
                <h4>Hardware Temperature & Clock Drift Regressor</h4>
                <p>Regresses RSSI and CSI drift against internal ESP32 chip thermistor (Current: {selectedDevice?.tempC || 40.2}&deg;C).</p>
                <span className="calib-badge">Drift Rate: 0.12 dB/hour (Compensated)</span>
              </div>
            </div>
          )}

          {activeTab === 'registered' && (
            <div className="registered-body">
              <div className="registered-header">
                <h4>Consented Ground-Truth Devices</h4>
                <p>Register your own phone or wearable tag to verify localization accuracy. Unknown phones remain anonymous emitters.</p>
              </div>

              <div className="registered-list">
                <div className="registered-item">
                  <div className="reg-icon">
                    <Smartphone size={16} />
                  </div>
                  <div className="reg-info">
                    <strong>Responder Field Phone (Pixel 8)</strong>
                    <span>Consented Ground Truth · BLE Beacon active · Zone B2</span>
                  </div>
                  <span className="status-pill green">CALIBRATION TARGET</span>
                </div>
              </div>

              <button
                className="secondary-action-btn"
                onClick={() => onNotify?.('Ground truth tag registered for current session')}
              >
                <Plus size={14} /> Register New Ground-Truth Device
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Signal Lab Strip */}
        <div className="signal-lab-panel panel">
          <div className="panel-header compact">
            <div>
              <div className="panel-kicker">
                <Gauge size={13} /> SIGNAL LAB STRIP
              </div>
              <h3>Channel & Mesh Health</h3>
            </div>
            <span className="status-pill green">HEALTHY</span>
          </div>

          <div className="signal-metrics-list">
            <div className="metric-row">
              <span className="metric-name">Channel Occupancy</span>
              <span className="metric-val">31% Airtime (Ch 6)</span>
            </div>
            <div className="metric-row">
              <span className="metric-name">Ambient RF Noise</span>
              <span className="metric-val">-92 dBm (Clean)</span>
            </div>
            <div className="metric-row">
              <span className="metric-name">Link SQI (Average)</span>
              <span className="metric-val highlight">0.89 / 1.00</span>
            </div>
            <div className="metric-row">
              <span className="metric-name">Mesh Clock Drift</span>
              <span className="metric-val">1.8 ms (Synchronized)</span>
            </div>
            <div className="metric-row">
              <span className="metric-name">Interference Class</span>
              <span className="metric-val clean">None Detected</span>
            </div>
          </div>

          {/* Add Device Wizard Modal */}
          {showAddWizard && (
            <div className="wizard-box">
              <h4>Web Serial Browser Flashing</h4>
              <p>Flash firmware directly from Chrome/Edge over USB via ESP Web Tools.</p>
              <div className="wizard-roles">
                <label>Select Role:</label>
                <select defaultValue="CSI_RX">
                  <option value="CSI_TX">CSI-TX (Fixed Illuminator)</option>
                  <option value="CSI_RX">CSI-RX (Channel Receiver)</option>
                  <option value="LINK">LINK (Round-Robin Mesh)</option>
                  <option value="SCANNER">SCANNER (Promiscuous)</option>
                  <option value="RADAR_HOST">RADAR-HOST (mmWave)</option>
                </select>
              </div>
              <div className="wizard-btns">
                <button
                  className="primary-action-btn"
                  onClick={() => {
                    onNotify?.('Web Serial connected. Firmware v0.4.1 flashed.')
                    setShowAddWizard(false)
                  }}
                >
                  <Terminal size={14} /> Connect & Flash ESP32
                </button>
                <button className="secondary-action-btn" onClick={() => setShowAddWizard(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
