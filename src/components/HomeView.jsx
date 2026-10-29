import {
  Activity,
  AlertTriangle,
  Antenna,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  Compass,
  FileCheck,
  FileText,
  Flame,
  Globe,
  Layers3,
  Lock,
  MapPin,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Scan,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Zap,
} from 'lucide-react'

export default function HomeView({
  status,
  sites,
  modeState,
  onOpenObservatory,
  onOpenDevices,
  onOpenWorkspace,
  onOpenModeModal,
  onRunRfConfirm,
  onToggleSimulator,
  isSimulator,
  onNotify,
}) {
  const currentMode = modeState?.current || 'BASELINE'

  return (
    <div className="home-container">
      {/* Hero Header */}
      <section className="drishti-hero">
        <div className="hero-top-badge">
          <span className="badge-pulse" />
          <span>DRISHTI · दृष्टि · SENSING OBSERVATORY</span>
          <span className="badge-divider">•</span>
          <span className="badge-privacy">
            <Lock size={12} /> ZERO IDENTIFIERS STORED
          </span>
        </div>
        <h1 className="hero-title">
          Know where people and signals are — <span className="highlight-text">never who they are.</span>
        </h1>
        <p className="hero-subtitle">
          A free-first, ESP32-powered observatory for places you cannot see into: a photo-built 3D twin,
          a live WiFi / Bluetooth / radar signal layer, and AI that explains what it all means — with privacy
          enforced by the architecture, not by promises.
        </p>

        {/* Quick Actions Bar */}
        <div className="hero-actions-bar">
          <button className="primary-action-btn" onClick={onOpenDevices}>
            <Plus size={16} /> Add Device
          </button>
          <button className="secondary-action-btn" onClick={() => onOpenWorkspace('twin')}>
            <Upload size={16} /> New Twin from Photos
          </button>
          <button className="secondary-action-btn" onClick={() => onOpenWorkspace('twin')}>
            <Boxes size={16} /> Import 3D Scan
          </button>
          <button className="secondary-action-btn" onClick={onRunRfConfirm}>
            <RefreshCw size={16} /> Run RF Confirmation
          </button>
          <button
            className={`simulator-toggle-btn ${isSimulator ? 'sim-active' : ''}`}
            onClick={onToggleSimulator}
          >
            <Radio size={15} /> {isSimulator ? 'Simulator Active' : 'Live Hardware'}
          </button>
        </div>
      </section>

      {/* Persistent Status Strip */}
      <section className="status-strip-grid" aria-label="System status overview">
        <div className="status-strip-card">
          <div className="strip-header">
            <span className="strip-label">HUB STATUS</span>
            <span className="status-pill green">ONLINE</span>
          </div>
          <div className="strip-value">Hub Engine OK</div>
          <div className="strip-detail">ESP-CSI & 802.11bf Ingest · 0% packet drop</div>
        </div>

        <div className="status-strip-card">
          <div className="strip-header">
            <span className="strip-label">SENSOR FLEET</span>
            <span className="status-pill blue">28 LINKS</span>
          </div>
          <div className="strip-value">{status?.devicesOnline || 6} / {status?.devicesTotal || 8} Nodes</div>
          <div className="strip-detail">ESP32-S3 · mmWave Radar · RPi Hub</div>
        </div>

        <div className="status-strip-card clickable" onClick={onOpenModeModal}>
          <div className="strip-header">
            <span className="strip-label">SENSING MODE</span>
            <span className={`status-pill ${currentMode.toLowerCase()}`}>{currentMode}</span>
          </div>
          <div className="strip-value mode-highlight">
            {currentMode === 'BASELINE' && 'Baseline (Environment Only)'}
            {currentMode === 'ALERT' && 'Alert (Coarse Anomaly)'}
            {currentMode === 'INCIDENT' && 'Incident (Search & Rescue)'}
            {currentMode === 'PURGE' && 'Purge Schedule Active'}
          </div>
          <div className="strip-detail">Click to inspect or declare incident ➜</div>
        </div>

        <div className="status-strip-card">
          <div className="strip-header">
            <span className="strip-label">PRIVACY INVARIANT</span>
            <span className="status-pill purple">STRICT ZERO</span>
          </div>
          <div className="strip-value">0 Identifiers Stored</div>
          <div className="strip-detail">Ephemeral pseudonyms rotated ≤ 10 min</div>
        </div>
      </section>

      {/* Main Grid: Sites & Twins + What's Happening */}
      <section className="home-content-split">
        {/* Sites & 3D Twins */}
        <div className="sites-section panel">
          <div className="panel-header">
            <div>
              <div className="panel-kicker">
                <Boxes size={14} /> 3D SPATIAL TWINS & RF AGREEMENT
              </div>
              <h2>Registered Observatories</h2>
            </div>
            <button className="secondary-button compact" onClick={() => onOpenWorkspace('twin')}>
              <Plus size={14} /> New Site
            </button>
          </div>

          <div className="site-cards-grid">
            {(sites || []).map((site) => (
              <div key={site.id} className="site-card">
                <div className="site-card-top">
                  <div>
                    <span className="site-version-tag">{site.version}</span>
                    <h3 className="site-name">{site.name}</h3>
                    <span className="site-dims">{site.dimensions} ({site.areaM2} m²)</span>
                  </div>
                  <div className="agreement-badge" title="Fraction of links predicting path loss within 6 dB">
                    <span className="agreement-value">{(site.rfAgreement * 100).toFixed(0)}%</span>
                    <span className="agreement-label">RF Agreement</span>
                  </div>
                </div>

                <div className="site-suspects-row">
                  {site.suspectWalls?.length > 0 ? (
                    <span className="suspect-tag warn">
                      <AlertTriangle size={12} /> Suspect: {site.suspectWalls.join(', ')}
                    </span>
                  ) : (
                    <span className="suspect-tag clean">
                      <CheckCircle2 size={12} /> Physics agrees with twin
                    </span>
                  )}
                  <span className="site-activity">{site.lastActivity}</span>
                </div>

                <div className="site-card-footer">
                  <button className="site-open-btn" onClick={() => onOpenObservatory(site.id)}>
                    Open in Observatory <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* What's Happening Timeline */}
        <div className="timeline-section panel">
          <div className="panel-header">
            <div>
              <div className="panel-kicker">
                <Clock size={14} /> LIVE SENSING FEED
              </div>
              <h2>What Is Happening</h2>
            </div>
            <span className="status-pill green">REAL-TIME</span>
          </div>

          <div className="happening-timeline">
            <div className="timeline-item alert-item">
              <div className="timeline-time">10:15</div>
              <div className="timeline-dot alert" />
              <div className="timeline-body">
                <strong>RF Disturbance Flagged in Zone B2</strong>
                <p>CSI subcarrier variance increased (+14 dB). Multiple Fresnel links perturbed.</p>
                <span className="evidence-chip">Evidence: CSI variance 0.38 · Doppler 0.8 Hz</span>
              </div>
            </div>

            <div className="timeline-item">
              <div className="timeline-time">10:02</div>
              <div className="timeline-dot info" />
              <div className="timeline-body">
                <strong>DR-CSI-03 Battery Check</strong>
                <p>Battery level normal (88%, 3.91V). Mesh round-robin timing verified.</p>
              </div>
            </div>

            <div className="timeline-item">
              <div className="timeline-time">09:40</div>
              <div className="timeline-dot success" />
              <div className="timeline-body">
                <strong>Baseline Model Updated</strong>
                <p>Empty-room calibration vector refreshed across 28 links. Drift compensated.</p>
              </div>
            </div>

            <div className="timeline-item">
              <div className="timeline-time">09:12</div>
              <div className="timeline-dot success" />
              <div className="timeline-body">
                <strong>Twin v3 Approved (School-A)</strong>
                <p>RF Agreement score: 81% (&tau; = 6 dB). Suspect walls W12 and W17 flagged for inspection.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Guided Onboarding Bar */}
      <section className="onboarding-guide-strip">
        <div className="guide-step">
          <div className="step-num">1</div>
          <div className="step-info">
            <strong>Connect Devices</strong>
            <span>Flash ESP32-S3 over Web Serial and join the mesh</span>
          </div>
        </div>
        <ArrowRight size={18} className="guide-arrow" />
        <div className="guide-step">
          <div className="step-num">2</div>
          <div className="step-info">
            <strong>Build the Twin</strong>
            <span>Generate 3D structure from photos or import an existing scan</span>
          </div>
        </div>
        <ArrowRight size={18} className="guide-arrow" />
        <div className="guide-step">
          <div className="step-num">3</div>
          <div className="step-info">
            <strong>Observe & Verify</strong>
            <span>Inspect WiFi distortion, vitals glows, and change in 3D</span>
          </div>
        </div>
      </section>

      {/* Responsible Use & Social Implications Statement */}
      <section className="panel ethics-panel">
        <div className="ethics-grid">
          <div>
            <div className="panel-kicker">
              <ShieldCheck size={14} /> SOCIAL IMPLICATIONS & EQUITABLE DESIGN
            </div>
            <h3>Dual-Use Safeguards & India DPDP Section 7 Compliance</h3>
            <p>
              Radio signals capable of finding a buried survivor under a concrete slab could, in unauthorized hands,
              covertly monitor occupants. DRISHTI addresses this dual-use dilemma by embedding privacy into the firmware
              and data structures: <b>SSIDs and vendor information elements are dropped on the chip</b>, transmitter
              addresses are salted with pseudonyms rotated every &le; 10 minutes, and person-level processing is gated
              strictly by cryptographic incident declarations under DPDP disaster relief provisions.
            </p>
          </div>
          <div className="ethics-stats-box">
            <div className="ethic-stat">
              <strong>0</strong>
              <span>Persistent Identifiers Stored</span>
            </div>
            <div className="ethic-stat">
              <strong>100%</strong>
              <span>Offline / Local Operation</span>
            </div>
            <div className="ethic-stat">
              <strong>Device-Free</strong>
              <span>Senses bodies without phones</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
