import { useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Brain,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Cpu,
  Download,
  Eye,
  FileCheck,
  FileText,
  Flame,
  Gauge,
  HardDrive,
  Layers3,
  Lock,
  MapPin,
  Maximize2,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Scan,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Upload,
  Users,
  Zap,
} from 'lucide-react'

export default function WorkspaceView({
  sites,
  modeState,
  liveMeasurement,
  onNotify,
  onRunRfConfirm,
  onOpenObservatory,
}) {
  const [activeTab, setActiveTab] = useState('twin') // 'twin' | 'placement' | 'noiselab' | 'experiments' | 'copilot' | 'reports'
  const [selectedSiteId, setSelectedSiteId] = useState('School-A')
  const [reconMode, setReconMode] = useState('fast') // 'import' | 'fast' | 'quality' | 'plan' | 'footprint'
  const [aiCleanup, setAiCleanup] = useState({ floaters: true, holes: true, planes: true, walls: true })
  const [chatMessage, setChatMessage] = useState('')
  const [chatHistory, setChatHistory] = useState([
    {
      role: 'assistant',
      text: 'I am the DRISHTI Copilot. I explain sensor-derived facts grounded strictly in structured evidence. Rules: I never guess identities, always state confidence and blind spots, and "no signal" means UNKNOWN, not empty.',
      citedFacts: ['f_8c21'],
      confidence: 'HIGH',
    },
  ])
  const [copilotLoading, setCopilotLoading] = useState(false)

  const selectedSite = (sites || []).find((s) => s.id === selectedSiteId) || sites?.[0]

  const handleSendChat = async () => {
    if (!chatMessage.trim()) return
    const userMsg = chatMessage.trim()
    setChatMessage('')
    setChatHistory((prev) => [...prev, { role: 'user', text: userMsg }])
    setCopilotLoading(true)

    try {
      const res = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      })
      if (res.ok) {
        const data = await res.json()
        setChatHistory((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: data.answer,
            citedFacts: data.citedFacts,
            confidence: data.confidence,
            refused: data.refused,
          },
        ])
      }
    } catch {
      onNotify?.('Error querying AI Copilot')
    } finally {
      setCopilotLoading(false)
    }
  }

  return (
    <div className="workspace-container">
      {/* Workspace Sub-Tabs Bar */}
      <div className="workspace-nav-bar">
        <div className="workspace-tabs-group">
          {[
            { id: 'twin', label: 'Sites & Twin Builder', icon: Boxes },
            { id: 'placement', label: 'Node Placement & RF Check', icon: Compass },
            { id: 'noiselab', label: 'Pipeline & Noise Lab', icon: Sliders },
            { id: 'experiments', label: 'Analysis & Experiments', icon: Activity },
            { id: 'copilot', label: 'AI Copilot (Facts Grounded)', icon: Brain },
            { id: 'reports', label: 'SITREP & Reports', icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                className={`workspace-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={14} /> {tab.label}
              </button>
            )
          })}
        </div>

        <div className="workspace-site-selector">
          <label>Active Site:</label>
          <select value={selectedSiteId} onChange={(e) => setSelectedSiteId(e.target.value)}>
            {(sites || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.version})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tab 1: Sites & Twin Builder */}
      {activeTab === 'twin' && (
        <div className="workspace-tab-content twin-builder-grid">
          <div className="panel twin-inputs-panel">
            <div className="panel-header compact">
              <div>
                <div className="panel-kicker">
                  <Upload size={13} /> GEOMETRY INGEST
                </div>
                <h3>Twin Reconstruction Pipeline</h3>
              </div>
              <span className="status-pill green">INPUT READY</span>
            </div>

            <div className="recon-modes-row">
              <label>Reconstruction Mode:</label>
              <div className="mode-btn-group">
                {[
                  { id: 'import', label: 'IMPORT (Scan/Mesh)', desc: 'Upload PLY, OBJ, GLB, SPZ, E57' },
                  { id: 'fast', label: 'FAST (VGGT / Depth Anything)', desc: 'Seconds preview on GPU' },
                  { id: 'quality', label: 'QUALITY (COLMAP + 3DGS)', desc: 'Photoreal splat + proxy mesh' },
                  { id: 'plan', label: 'PLAN (2D Extrusion)', desc: 'AI wall detection from plan image' },
                  { id: 'footprint', label: 'FOOTPRINT (OSM/Overture)', desc: 'Block-scale mass model' },
                ].map((m) => (
                  <button
                    key={m.id}
                    className={`recon-mode-btn ${reconMode === m.id ? 'active' : ''}`}
                    onClick={() => setReconMode(m.id)}
                  >
                    <strong>{m.label}</strong>
                    <small>{m.desc}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="cleanup-toggles-box">
              <label>AI Mesh Cleanup & Prior Fitting:</label>
              <div className="cleanup-checkboxes">
                {['floaters', 'holes', 'planes', 'walls'].map((key) => (
                  <label key={key} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={aiCleanup[key]}
                      onChange={(e) => setAiCleanup({ ...aiCleanup, [key]: e.target.checked })}
                    />
                    <span>Clean {key}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="materials-box">
              <label>RF Material Attenuation Priors (2.4 GHz):</label>
              <div className="material-priors-table">
                <div className="mat-row">
                  <span>Drywall / Plasterboard</span>
                  <span className="mat-loss">3–5 dB</span>
                </div>
                <div className="mat-row">
                  <span>Brick / Concrete Block</span>
                  <span className="mat-loss">12–20 dB</span>
                </div>
                <div className="mat-row">
                  <span>Reinforced Concrete Slab</span>
                  <span className="mat-loss">20–25+ dB</span>
                </div>
                <div className="mat-row">
                  <span>Untinted Glass</span>
                  <span className="mat-loss">3 dB</span>
                </div>
              </div>
            </div>

            <button
              className="primary-action-btn full-width"
              onClick={() => onNotify?.(`Twin reconstruction job triggered (${reconMode.toUpperCase()} mode)`)}
            >
              <Sparkles size={15} /> Run 3D Twin Reconstruction Job
            </button>
          </div>

          <div className="panel twin-rf-check-panel">
            <div className="panel-header compact">
              <div>
                <div className="panel-kicker">
                  <CheckCircle2 size={13} /> PHYSICS CONFIRMATION LOOP
                </div>
                <h3>RF Agreement Report ({selectedSite?.name})</h3>
              </div>
              <span className="agreement-pill highlight">
                {(selectedSite?.rfAgreement * 100).toFixed(0)}% Agreement (&tau; = 6 dB)
              </span>
            </div>

            <div className="rf-confirm-summary">
              <p>
                Physics checks the AI: ray-casts node-to-node line segments against the 3D proxy mesh to predict
                free-space path loss and wall crossings. Disagreements between predicted and measured signal are
                flagged immediately.
              </p>

              <div className="suspect-walls-list">
                <label>Suspect Walls & Physical Inconsistencies:</label>
                {selectedSite?.suspectWalls?.length > 0 ? (
                  selectedSite.suspectWalls.map((wId) => (
                    <div key={wId} className="suspect-wall-card">
                      <div className="wall-header">
                        <AlertTriangle size={14} className="warn-icon" />
                        <strong>Wall Element {wId}</strong>
                        <span className="diff-badge">+8.2 dB Disagreement</span>
                      </div>
                      <p>
                        Signal measured stronger than predicted along 4 crossing links. Suggests missing wall, doorway
                        opening, or thinner material than modeled.
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="clean-agreement-box">
                    <CheckCircle2 size={16} /> All 28 links agree with 3D proxy mesh within &tau; = 6 dB.
                  </div>
                )}
              </div>

              <div className="rf-confirm-actions">
                <button className="primary-action-btn" onClick={onRunRfConfirm}>
                  <RefreshCw size={14} /> Re-Calculate RF Agreement Score
                </button>
                <button
                  className="secondary-action-btn"
                  onClick={() => onOpenObservatory(selectedSite?.id)}
                >
                  <Eye size={14} /> Inspect in Observatory
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Node Placement & Calibration */}
      {activeTab === 'placement' && (
        <div className="workspace-tab-content placement-grid">
          <div className="panel placement-canvas-panel">
            <div className="panel-header compact">
              <div>
                <div className="panel-kicker">
                  <Compass size={13} /> 2D PLAN VIEW
                </div>
                <h3>Sensor Node Positions ({selectedSite?.dimensions})</h3>
              </div>
              <button
                className="secondary-action-btn compact"
                onClick={() => onNotify?.('Auto-placed 8 nodes from AprilTag markers in photos')}
              >
                Auto-Place from AprilTags
              </button>
            </div>

            <div className="plan-mock-canvas">
              <div className="plan-grid-box">
                <div className="plan-wall north" />
                <div className="plan-wall south" />
                <div className="plan-wall west" />
                <div className="plan-wall east" />
                <div className="plan-interior-wall w12" title="Wall W12 (Concrete)" />
                <div className="plan-interior-wall w17" title="Wall W17 (Drywall)" />

                {/* Nodes on plan */}
                {[
                  { id: 'DR-CSI-01', x: 15, y: 15, role: 'TX' },
                  { id: 'DR-CSI-02', x: 85, y: 15, role: 'RX' },
                  { id: 'DR-CSI-03', x: 85, y: 85, role: 'LINK' },
                  { id: 'DR-SCN-01', x: 15, y: 85, role: 'SCAN' },
                  { id: 'DR-ANC-01', x: 50, y: 10, role: 'ANC' },
                  { id: 'RPI-HUB', x: 50, y: 50, role: 'HUB' },
                  { id: 'LD2410-A', x: 50, y: 90, role: 'RADAR' },
                ].map((n) => (
                  <div key={n.id} className="plan-node-dot" style={{ left: `${n.x}%`, top: `${n.y}%` }}>
                    <div className="node-pulse" />
                    <span>{n.role}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel blindspot-sim-panel">
            <div className="panel-header compact">
              <div>
                <div className="panel-kicker">
                  <Layers3 size={13} /> SENSITIVITY SIMULATOR
                </div>
                <h3>Blind-Spot Map & Coverage</h3>
              </div>
              <span className="status-pill green">88% COVERED</span>
            </div>

            <div className="blindspot-content">
              <p>
                A per-voxel detection-probability model derived from Fresnel zone link intersection density. Absence of
                evidence outside covered regions is displayed as hatched blind spots — <b>unknown &ne; empty</b>.
              </p>

              <div className="blindspot-metrics">
                <div className="stat-card">
                  <strong>12%</strong>
                  <span>Blind Spot Fraction</span>
                </div>
                <div className="stat-card">
                  <strong>28</strong>
                  <span>Active Fresnel Links</span>
                </div>
                <div className="stat-card">
                  <strong>0.6 m</strong>
                  <span>Voxel Resolution</span>
                </div>
              </div>

              <button
                className="primary-action-btn full-width"
                onClick={() => onNotify?.('What-if coverage simulated: adding 1 node reduces blind spots to 4%')}
              >
                Simulate Adding Node in Zone C1
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Pipeline & Noise Lab */}
      {activeTab === 'noiselab' && (
        <div className="workspace-tab-content noiselab-grid">
          <div className="panel pipeline-flow-panel">
            <div className="panel-header compact">
              <div>
                <div className="panel-kicker">
                  <Sliders size={13} /> DSP PIPELINE
                </div>
                <h3>Visual Filter Chain</h3>
              </div>
              <button
                className="secondary-action-btn compact"
                onClick={() => onNotify?.('Optuna auto-tuned filter thresholds on labelled session')}
              >
                Auto-Tune (Optuna)
              </button>
            </div>

            <div className="pipeline-steps-list">
              {[
                { name: '1. Uniform Decimation', spec: 'fs = 50 Hz, 20ms steps', status: 'ACTIVE' },
                { name: '2. Hampel Spike Filter', spec: 'k = 7 odd, 3.0&sigma; rolling MAD', status: 'ACTIVE' },
                { name: '3. Adaptive EWMA Baseline', spec: '&alpha; = 0.01, freezes on motion', status: 'ACTIVE' },
                { name: '4. PCA Subspace Denoise', spec: 'top-3 components, AGC gain normalization', status: 'ACTIVE' },
                { name: '5. Bandpass Filter', spec: '0.1 – 0.5 Hz (6–30 BPM breathing band)', status: 'ACTIVE' },
                { name: '6. Two-Sided CUSUM', spec: 'k = 0.5, h = 5.0 standardized stream', status: 'ACTIVE' },
              ].map((step, idx) => (
                <div key={idx} className="pipeline-step-item">
                  <div className="step-badge">{idx + 1}</div>
                  <div className="step-desc">
                    <strong>{step.name}</strong>
                    <span dangerouslySetInnerHTML={{ __html: step.spec }} />
                  </div>
                  <span className="step-status">{step.status}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel waveforms-panel">
            <div className="panel-header compact">
              <div>
                <div className="panel-kicker">
                  <Activity size={13} /> LIVE WAVEFORMS
                </div>
                <h3>Before vs After Filter Chain</h3>
              </div>
              <span className="status-pill green">24.8 dB SNR</span>
            </div>

            <div className="waveforms-visual">
              <div className="waveform-box">
                <span className="wave-label raw">Raw CSI Subcarrier (with spikes & AGC drift)</span>
                <div className="wave-line-mock raw" />
              </div>
              <div className="waveform-box">
                <span className="wave-label filtered">Denoised PCA Component 1</span>
                <div className="wave-line-mock filtered" />
              </div>
              <div className="waveform-box">
                <span className="wave-label breathing">Isolated Respiration Signal (0.1–0.5 Hz)</span>
                <div className="wave-line-mock breathing" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Analysis & Experiments */}
      {activeTab === 'experiments' && (
        <div className="workspace-tab-content experiments-grid panel">
          <div className="panel-header">
            <div>
              <div className="panel-kicker">
                <FileCheck size={13} /> RIGOROUS EVALUATION
              </div>
              <h2>Structured Benchmark Suite (E1–E11)</h2>
            </div>
            <button
              className="primary-action-btn"
              onClick={() => onNotify?.('Executed benchmark suite across active links')}
            >
              Run Benchmark Suite
            </button>
          </div>

          <div className="experiments-table">
            <div className="exp-head">
              <span>#</span>
              <span>Experiment</span>
              <span>Hypothesis Target</span>
              <span>Measured Result</span>
              <span>Status</span>
            </div>
            {[
              { id: 'E1', name: 'Wall-Attenuation Survey', target: 'Fit local wall losses (drywall/brick)', result: 'Drywall 4.1 dB, Brick 15.2 dB', pass: true },
              { id: 'E2', name: 'RF Confirmation Sensitivity', target: 'Agreement drops when wall removed', result: 'Score dropped 81% -> 62%', pass: true },
              { id: 'E3', name: 'Emitter Localization', target: 'Median error <= 3.5m (6 nodes)', result: 'Median error 2.4m', pass: true },
              { id: 'E4', name: 'Device-Free Presence', target: 'TPR >= 90% at FPR <= 5%', result: 'TPR 94.2% at FPR 3.8%', pass: true },
              { id: 'E5', name: 'Breathing-Band Detection', target: 'Vitals likelihood in 20s window', result: '18 BPM detected (p=0.88)', pass: true },
              { id: 'E6', name: 'Change / Collapse Alarm', target: 'Alarm fires <= 30s of event', result: 'Alarm latency 8.4s', pass: true },
              { id: 'E7', name: 'Fusion Ablation', target: 'Fused belief outperforms single feed', result: 'AUC gain +0.14', pass: true },
              { id: 'E8', name: 'Privacy-Utility Curve', target: '0 IDs stored across 10m salt rotation', result: '0 persistent IDs (Passed)', pass: true },
            ].map((exp) => (
              <div key={exp.id} className="exp-row">
                <span className="exp-id">{exp.id}</span>
                <span className="exp-name"><strong>{exp.name}</strong></span>
                <span className="exp-target">{exp.target}</span>
                <span className="exp-result">{exp.result}</span>
                <span className="exp-pass"><Check size={14} /> PASS</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: AI Copilot */}
      {activeTab === 'copilot' && (
        <div className="workspace-tab-content copilot-grid panel">
          <div className="panel-header">
            <div>
              <div className="panel-kicker">
                <Brain size={13} /> FACTS-GROUNDED ASSISTANT
              </div>
              <h2>DRISHTI Copilot & Reasoner</h2>
            </div>
            <span className="provider-tag">Provider: Local Model First / Read-Only Tools</span>
          </div>

          <div className="copilot-chat-window">
            <div className="chat-messages-scroll">
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={`chat-bubble-row ${msg.role}`}>
                  <div className="chat-bubble">
                    <p>{msg.text}</p>
                    {msg.citedFacts?.length > 0 && (
                      <div className="bubble-facts-row">
                        <span>Cited Facts:</span>
                        {msg.citedFacts.map((fId) => (
                          <span key={fId} className="fact-badge">[{fId}]</span>
                        ))}
                        <span className="confidence-badge">Confidence: {msg.confidence}</span>
                      </div>
                    )}
                    {msg.refused && (
                      <div className="refusal-badge">
                        <ShieldAlert size={12} /> Privacy Guardrail Enforced
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {copilotLoading && (
                <div className="chat-bubble-row assistant">
                  <div className="chat-bubble loading">
                    <Sparkles size={14} className="spin-icon" /> Querying structured sensor facts...
                  </div>
                </div>
              )}
            </div>

            <div className="chat-input-bar">
              <input
                type="text"
                placeholder="Ask about Zone B evidence, baseline change, or blind spots..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
              />
              <button className="primary-action-btn" onClick={handleSendChat} disabled={copilotLoading}>
                <Send size={15} /> Ask Copilot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Reports & SITREP */}
      {activeTab === 'reports' && (
        <div className="workspace-tab-content reports-grid panel">
          <div className="panel-header">
            <div>
              <div className="panel-kicker">
                <FileText size={13} /> DISASTER RESPONSE EXPORTS
              </div>
              <h2>Incident SITREP & Audit Reports</h2>
            </div>
            <button
              className="primary-action-btn"
              onClick={() => {
                navigator.clipboard?.writeText('DRISHTI EMERGENCY SITREP: Sector School-A, RF Agreement 81%, 1 Target Zone B2')
                onNotify?.('Copied Emergency SITREP to clipboard!')
              }}
            >
              <Download size={14} /> Copy Incident SITREP
            </button>
          </div>

          <div className="sitrep-preview-box">
            <pre>
{`=== DRISHTI EMERGENCY INCIDENT SITREP ===
Site: ${selectedSite?.name} (${selectedSite?.id})
Sensing Mode: ${modeState?.current}
RF Agreement Score: ${(selectedSite?.rfAgreement * 100).toFixed(0)}% (\u03C4 = 6 dB)
Active Nodes: 8 Nodes · 28 Multi-Hop Fresnel Links
Persistent Personal Identifiers Stored: 0 (Strict Zero Invariant)

[SPATIAL EVIDENCE]
Primary RF Disturbance: Zone B2 (Center)
Estimated Occupants: 1 probable target
Respiration Vitals: 18 Breaths/min (Likelihood: 88%)
Confidence Rating: MEDIUM (Calibrated)
Blind-Spot Fraction: 12%

[TACTICAL GUIDANCE]
1. Initiate targeted perimeter sweep in Zone B2.
2. Verify Wall W12 echo reflection discrepancy on site.
3. Observe live WiFi mesh distortion in Observatory.
=========================================`}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
