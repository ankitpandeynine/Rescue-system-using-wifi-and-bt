import { useState } from 'react'
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Lock,
  Trash2,
  FileText,
  Key,
  Clock,
  MapPin,
  CheckCircle,
  XCircle,
  X,
  Radio,
} from 'lucide-react'

export default function PrivacyModeModal({ modeState, auditLog, onSwitchMode, onClose, onNotify }) {
  const [selectedMode, setSelectedMode] = useState(modeState?.current || 'BASELINE')
  const [purpose, setPurpose] = useState('Structural collapse survivor triage')
  const [geofence, setGeofence] = useState('School-A')
  const [isBreakGlass, setIsBreakGlass] = useState(false)
  const [signer1, setSigner1] = useState('key:resp-01')
  const [signer2, setSigner2] = useState('key:resp-02')

  const handleApply = async () => {
    if (selectedMode === 'INCIDENT') {
      const authContext = {
        purpose,
        geofence,
        breakGlass: isBreakGlass,
        signers: isBreakGlass ? [signer1] : [signer1, signer2],
      }
      await onSwitchMode('INCIDENT', 'operator', authContext)
      onNotify?.(isBreakGlass ? '🚨 BREAK-GLASS INCIDENT declared (15m TTL)' : '✅ INCIDENT declared with 2-responder signature')
    } else if (selectedMode === 'PURGE') {
      await onSwitchMode('PURGE', 'operator', {})
      onNotify?.('🧹 Ephemeral data purged. Mode reset to BASELINE.')
    } else {
      await onSwitchMode(selectedMode, 'operator', {})
      onNotify?.(`Mode changed to ${selectedMode}`)
    }
    onClose()
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card privacy-modal">
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon shield">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3>Sensing Mode & Architectural Governance</h3>
              <p>Privacy enforced by hardware design and cryptographic access control</p>
            </div>
          </div>
          <button className="icon-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="mode-selector-grid">
          <div
            className={`mode-card ${selectedMode === 'BASELINE' ? 'active baseline' : ''}`}
            onClick={() => setSelectedMode('BASELINE')}
          >
            <div className="mode-badge-line">
              <span className="mode-pill baseline">BASELINE</span>
              <span className="mode-tag">Default</span>
            </div>
            <h4>Structural & Environment RF</h4>
            <p>Monitors AP baseline, link attenuation, and RF change index. Person-level tracks and device burst decoding are strictly forbidden on the chip.</p>
          </div>

          <div
            className={`mode-card ${selectedMode === 'ALERT' ? 'active alert' : ''}`}
            onClick={() => setSelectedMode('ALERT')}
          >
            <div className="mode-badge-line">
              <span className="mode-pill alert">ALERT</span>
              <span className="mode-tag">Automated</span>
            </div>
            <h4>Coarse Anomaly Verification</h4>
            <p>Triggered when RF Change Index exceeds threshold. Displays coarse zone-level warnings. No individual tracks or fine cells.</p>
          </div>

          <div
            className={`mode-card ${selectedMode === 'INCIDENT' ? 'active incident' : ''}`}
            onClick={() => setSelectedMode('INCIDENT')}
          >
            <div className="mode-badge-line">
              <span className="mode-pill incident">INCIDENT</span>
              <span className="mode-tag">Signed Token</span>
            </div>
            <h4>Search & Rescue Operations</h4>
            <p>Enables person-level belief maps, ephemeral anonymous tracks, and vitals likelihood. Requires 2-key Ed25519 declaration or break-glass.</p>
          </div>

          <div
            className={`mode-card ${selectedMode === 'PURGE' ? 'active purge' : ''}`}
            onClick={() => setSelectedMode('PURGE')}
          >
            <div className="mode-badge-line">
              <span className="mode-pill purge">PURGE</span>
              <span className="mode-tag">Emergency Wipe</span>
            </div>
            <h4>Ephemeral Data Wipe</h4>
            <p>Instantly wipes all ephemeral belief maps, tracks, and burst logs. Writes an aggregate after-action entry to the audit log.</p>
          </div>
        </div>

        {selectedMode === 'INCIDENT' && (
          <div className="incident-form-box">
            <div className="box-title">
              <Key size={15} /> Two-Person Cryptographic Incident Declaration
            </div>
            <div className="form-row">
              <label>Declared Purpose</label>
              <input
                type="text"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Disaster response / Structural collapse"
              />
            </div>
            <div className="form-row split">
              <div>
                <label>Geofence Target</label>
                <input
                  type="text"
                  value={geofence}
                  onChange={(e) => setGeofence(e.target.value)}
                  placeholder="e.g. School-A"
                />
              </div>
              <div>
                <label>TTL Expiry Schedule</label>
                <input type="text" disabled value={isBreakGlass ? '15 minutes (Break-glass)' : '72 hours (Standard S&R)'} />
              </div>
            </div>

            <div className="break-glass-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={isBreakGlass}
                  onChange={(e) => setIsBreakGlass(e.target.checked)}
                />
                <span>Enable Break-Glass Emergency Override (1 Key, max 15m TTL, mandatory audit flag)</span>
              </label>
            </div>

            <div className="form-row split">
              <div>
                <label>Signer 1 (Ed25519 Responder Key)</label>
                <input type="text" value={signer1} onChange={(e) => setSigner1(e.target.value)} />
              </div>
              {!isBreakGlass && (
                <div>
                  <label>Signer 2 (Incident Commander Key)</label>
                  <input type="text" value={signer2} onChange={(e) => setSigner2(e.target.value)} />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="audit-tail-box">
          <div className="audit-tail-header">
            <span>
              <Lock size={13} /> Tamper-Evident Hash-Chained Audit Trail ({auditLog?.length || 0} entries)
            </span>
            <span className="audit-zero-ids">Persistent IDs Stored: 0</span>
          </div>
          <div className="audit-tail-list">
            {(auditLog || []).slice(-3).map((item, idx) => (
              <div key={idx} className="audit-row">
                <span className="audit-seq">#{item.seq}</span>
                <span className="audit-time">{item.time?.split('T')[1]?.slice(0, 8)}</span>
                <span className="audit-actor">{item.actor}</span>
                <span className="audit-action">{item.action}</span>
                <span className="audit-hash" title={item.hash}>{item.hash?.slice(0, 16)}...</span>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" onClick={handleApply}>
            {selectedMode === 'PURGE' ? 'Execute Data Purge' : `Apply ${selectedMode} Mode`}
          </button>
        </div>
      </div>
    </div>
  )
}
