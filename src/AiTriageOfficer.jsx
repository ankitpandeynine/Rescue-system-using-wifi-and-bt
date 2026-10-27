import { useEffect, useState } from 'react'
import {
  Brain,
  Check,
  ClipboardCopy,
  Cpu,
  Flame,
  Globe,
  HardDrive,
  Key,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

export default function AiTriageOfficer({ room, presence, spatial, onNotify }) {
  const [engine, setEngine] = useState('auto') // 'auto', 'gemma', 'gemini'
  const [apiKey, setApiKey] = useState('')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [loading, setLoading] = useState(false)
  const [aiStatus, setAiStatus] = useState(null)
  const [triage, setTriage] = useState(null)

  // Fetch AI status on mount
  useEffect(() => {
    fetch('/api/ai/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setAiStatus(data))
      .catch(() => {})
  }, [])

  // Run Triage
  const runTriage = async (overrideEngine = engine) => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: overrideEngine,
          apiKey: apiKey || undefined,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.triage) {
          setTriage(data.triage)
          onNotify?.(`AI Triage complete: Level ${data.triage.triageLevel}`)
        }
      }
    } catch {
      onNotify?.('Error generating AI triage assessment')
    } finally {
      setLoading(false)
    }
  }

  // Run initial triage when presence or targets change
  useEffect(() => {
    runTriage(engine)
  }, [presence?.estimatedPeople, presence?.presenceClass])

  // Copy SITREP report
  const copySitrep = () => {
    if (!triage) return
    const sitrep = `=== RESQ-ATLAS EMERGENCY INCIDENT SITREP ===
Timestamp: ${triage.timestamp || new Date().toISOString()}
AI Engine: ${triage.aiEngine} (${triage.modelUsed})
Sector Bounds: ${room?.length}m x ${room?.breadth}m x ${room?.height || 2.8}m (${room?.area} m²)
Triage Priority: ${triage.triageLevel}
Hazard Rating: ${triage.hazardRating}
Survivors Localized: ${triage.survivorCount || 0}
Active Zone: ${spatial?.activeZone} (${spatial?.zoneName})

[PHYSIOLOGICAL VITALS]
${triage.vitalsSummary}

[TACTICAL ASSESSMENT]
${triage.tacticalAssessment}

[FIELD EXTRACTION PLAN]
${triage.extractionPlan}
============================================`

    navigator.clipboard?.writeText(sitrep)
    onNotify?.('Copied Emergency SITREP to clipboard!')
  }

  const triageTone =
    triage?.triageLevel === 'RED_CRITICAL'
      ? 'red'
      : triage?.triageLevel === 'AMBER_URGENT'
      ? 'amber'
      : triage?.triageLevel === 'GREEN_STABLE'
      ? 'green'
      : 'muted'

  return (
    <div className={`ai-triage-panel panel ${triageTone}`}>
      <div className="ai-triage-header">
        <div className="ai-header-left">
          <div className="ai-icon-badge">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="panel-kicker">
              <span>AI TACTICAL INCIDENT OFFICER</span>
              <span className="dot-sep">·</span>
              <span className="engine-name-badge">
                {triage?.aiEngine || 'Gemma 4-Bit Edge / Google AI Studio'}
              </span>
            </div>
            <h3>Autonomous Survivor Triage & Emergency Reasoning</h3>
          </div>
        </div>

        <div className="ai-header-actions">
          {/* Engine Selector */}
          <div className="ai-engine-selector">
            <button
              className={`ai-eng-btn ${engine === 'gemma' ? 'active' : ''}`}
              onClick={() => {
                setEngine('gemma')
                runTriage('gemma')
              }}
              title="Gemma 4-bit runs 100% offline on your laptop (via local Ollama on port 11434). Zero internet needed in disaster zones."
            >
              <HardDrive size={11} /> Gemma 4-Bit (Offline)
            </button>
            <button
              className={`ai-eng-btn ${engine === 'gemini' ? 'active' : ''}`}
              onClick={() => {
                setEngine('gemini')
                runTriage('gemini')
              }}
              title="Google AI Studio Gemini 1.5/2.5 Flash cloud API for deep situational report generation."
            >
              <Globe size={11} /> Google AI Studio
            </button>
            <button
              className={`ai-eng-btn ${engine === 'auto' ? 'active' : ''}`}
              onClick={() => {
                setEngine('auto')
                runTriage('auto')
              }}
              title="Auto: Prefers local Gemma 4-bit, falls back to Google AI Studio, then clinical SAR vitals rules."
            >
              <Cpu size={11} /> Auto
            </button>
          </div>

          <button className="secondary-button compact-btn" onClick={() => setShowKeyInput(!showKeyInput)} title="Configure Google AI Studio API Key">
            <Key size={13} />
          </button>

          <button
            className={`secondary-button compact-btn ${loading ? 'is-loading' : ''}`}
            onClick={() => runTriage(engine)}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? 'spin-icon' : ''} />
            <span>{loading ? 'Analyzing...' : 'Run Triage'}</span>
          </button>
        </div>
      </div>

      {showKeyInput && (
        <div className="ai-key-drawer">
          <div className="key-input-row">
            <Key size={14} className="key-icon" />
            <input
              type="password"
              placeholder="Enter Google AI Studio Gemini API Key (Optional)..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="ai-key-input"
            />
            <button className="primary-button compact-btn" onClick={() => { setShowKeyInput(false); runTriage('gemini') }}>
              Save & Test
            </button>
          </div>
          <span className="key-hint">
            💡 For 100% offline disaster response with zero internet, install Ollama and run <code>ollama run gemma2:2b</code>. ResQ-Atlas detects Gemma automatically!
          </span>
        </div>
      )}

      {/* Main Triage Body */}
      <div className="ai-triage-body">
        {/* Triage Banner */}
        <div className={`triage-status-banner ${triageTone}`}>
          <div className="status-label-group">
            <span className="priority-label">TRIAGE PRIORITY:</span>
            <strong className="priority-value">
              {triage?.triageLevel?.replace('_', ' ') || 'EVALUATING SENSORS...'}
            </strong>
          </div>
          <div className="triage-pills">
            <span className="triage-pill hazard">
              Hazard: <b>{triage?.hazardRating || 'NORMAL'}</b>
            </span>
            <span className="triage-pill model">
              Engine: <b>{triage?.modelUsed || 'gemma2:2b (4-bit)'}</b>
            </span>
          </div>
        </div>

        {/* Clinical Assessment Grid */}
        <div className="triage-details-grid">
          <div className="triage-detail-box">
            <span className="detail-kicker">PHYSICAL RF VITALS & RESPIRATION</span>
            <p className="detail-copy bold-copy">
              {triage?.vitalsSummary || 'Analyzing temporal variance and Doppler subcarrier dispersion...'}
            </p>
          </div>

          <div className="triage-detail-box">
            <span className="detail-kicker">TACTICAL SURVIVOR ASSESSMENT</span>
            <p className="detail-copy">
              {triage?.tacticalAssessment || 'Evaluating survivor consciousness and entrapment mechanics...'}
            </p>
          </div>

          <div className="triage-detail-box full-width">
            <span className="detail-kicker">FIRST RESPONDER EXTRACTION PLAN</span>
            <p className="detail-copy plan-copy">
              {triage?.extractionPlan || '1. Secure coordinate perimeter. 2. Establish acoustic contact. 3. Deploy extraction tools.'}
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="ai-triage-footer">
          <span className="footer-note">
            🛡️ <b>Ethical & Safe</b>: Evaluates only RF Wi-Fi multipath reflections and breathing displacement. Zero cameras, zero facial data.
          </span>
          <button className="text-button" onClick={copySitrep} title="Copy standardized NATO / FEMA SITREP report to clipboard">
            <ClipboardCopy size={13} /> Copy Emergency SITREP
          </button>
        </div>
      </div>
    </div>
  )
}
