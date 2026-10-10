import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ShieldAlert, ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react'
import { useAuth } from '../auth/useAuthContext'
import ImageGallery from './ImageGallery'

const TABS = [
  { value: 'needs_review', label: 'Needs Review', countKey: 'needsReview' },
  { value: 'rejected', label: 'Rejected', countKey: 'rejected' }
]

const EMPTY_MESSAGES = {
  needs_review: {
    title: 'No complaints are waiting for review.',
    detail: 'New complaints that need a manual check will appear here.'
  },
  rejected: {
    title: 'No rejected complaints.',
    detail: 'Complaints you reject will be listed here and can be overturned.'
  }
}

const FLAG_LABELS = {
  abusive_language: 'Abusive language',
  mild_insult: 'Rude wording',
  threatening_language: 'Threatening language',
  promotional_content: 'Promotional wording',
  contains_link: 'Contains link',
  no_civic_terms: 'No civic terms found',
  possible_duplicate: 'Possible duplicate',
  meaningless_text: 'Meaningless text',
  too_little_detail: 'Very short description'
}

// Admin section for complaints held by moderation. Approving moves a
// complaint into the normal workflow (the backend guarantees this
// happens once); rejecting requires a reason that is sent to the citizen.
function ModerationPanel({ onWorkflowChange }) {

  const { authRequest } = useAuth()

  const [tab, setTab] = useState('needs_review')
  const [complaints, setComplaints] = useState([])
  // null until the first successful load, so a failed request never
  // shows a misleading "(0)".
  const [counts, setCounts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState('')
  const [reason, setReason] = useState('')
  const [busyId, setBusyId] = useState('')

  // Bumped to re-run the loader (manual refresh / after an action)
  const [reloadKey, setReloadKey] = useState(0)

  function fetchQueue() {
    setLoading(true)
    setReloadKey(key => key + 1)
  }

  useEffect(() => {

    let cancelled = false

    async function load() {

      try {

        const data = await authRequest(`/api/moderation/complaints?status=${tab}`)

        if (cancelled) return

        setError('')
        setComplaints(Array.isArray(data.complaints) ? data.complaints : [])
        setCounts(data.counts || { needsReview: 0, rejected: 0 })

      } catch (fetchError) {

        if (!cancelled) setError(fetchError.message || 'Failed to load the moderation queue.')

      } finally {

        if (!cancelled) setLoading(false)

      }

    }

    load()

    return () => { cancelled = true }

  }, [tab, authRequest, reloadKey])

  function switchTab(value) {
    if (value === tab) return
    setTab(value)
    setOpenId('')
    setReason('')
    setComplaints([])
    setLoading(true)
  }

  function toggleOpen(id) {
    setOpenId(current => (current === id ? '' : id))
    setReason('')
  }

  async function decide(complaint, action) {

    // Guard against double clicks while any request is in flight.
    if (busyId) return

    const trimmedReason = reason.trim()

    if (action === 'reject' && trimmedReason.length < 5) {
      toast.error('Please enter a reason (at least 5 characters) for the citizen.')
      return
    }

    const confirmText = action === 'reject'
      ? `Reject complaint ${complaint.id}?\n\nThe citizen will be notified with this reason:\n"${trimmedReason}"`
      : tab === 'rejected'
        ? `Overturn the rejection and approve complaint ${complaint.id}?\n\nIt will enter the priority queue and the citizen will be notified.`
        : `Approve complaint ${complaint.id}?\n\nIt will enter the priority queue and the citizen will be notified.`

    if (!window.confirm(confirmText)) return

    try {

      setBusyId(complaint.id)

      const data = await authRequest(`/api/moderation/complaints/${complaint.id}/${action}`, {
        method: 'POST',
        json: action === 'reject' ? { reason: trimmedReason } : { note: trimmedReason }
      })

      toast.success(data.message)

      setOpenId('')
      setReason('')

      fetchQueue()

      if (action === 'approve' && onWorkflowChange) onWorkflowChange()

    } catch (actionError) {

      // 409 = someone already decided it; refresh to show the truth.
      if (actionError.status === 409) fetchQueue()

      toast.error(actionError.message || 'Moderation action failed.')

    } finally {

      setBusyId('')

    }

  }

  const empty = EMPTY_MESSAGES[tab]

  return (
    <div className="admin-card moderation-card">

      <div className="admin-card-header">

        <div>
          <p className="result-label">CONTENT MODERATION</p>
          <h2 className="notifications-title">
            <ShieldAlert size={22} />
            Complaint Review
            {counts?.needsReview > 0 && <span className="notification-count">{counts.needsReview}</span>}
          </h2>
          <p>Complaints held back from the priority queue until an administrator decides.</p>
        </div>

        <button
          type="button"
          className="refresh-button"
          onClick={fetchQueue}
          disabled={loading || Boolean(busyId)}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>

      </div>

      <div className="moderation-tabs" role="tablist" aria-label="Moderation queues">
        {TABS.map(item => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            className={`moderation-tab${tab === item.value ? ' active' : ''}`}
            onClick={() => switchTab(item.value)}
            disabled={Boolean(busyId)}
          >
            {item.label} ({counts ? counts[item.countKey] || 0 : '–'})
          </button>
        ))}
      </div>

      {loading && complaints.length === 0 && (
        <div className="panel-status" role="status">
          <RefreshCw size={16} className="spin" aria-hidden="true" />
          Loading complaints for review...
        </div>
      )}

      {error && !loading && (
        <div className="panel-status error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" className="link-button" onClick={fetchQueue}>Retry</button>
        </div>
      )}

      {!loading && !error && complaints.length === 0 && (
        <div className="panel-status empty">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>
            <strong>{empty.title}</strong>
            <small>{empty.detail}</small>
          </span>
        </div>
      )}

      {complaints.length > 0 && (

        <div className="moderation-list" aria-busy={loading}>

          {complaints.map(complaint => {

            const isOpen = openId === complaint.id
            const isBusy = busyId === complaint.id

            return (

              <div className={`moderation-item${isOpen ? ' open' : ''}`} key={complaint.id}>

                <button
                  type="button"
                  className="moderation-summary"
                  onClick={() => toggleOpen(complaint.id)}
                  aria-expanded={isOpen}
                >
                  <span className="complaint-id-cell">{complaint.id}</span>
                  <span className="moderation-summary-title">{complaint.title}</span>
                  <span>{complaint.category}</span>
                  <span>{new Date(complaint.createdAt).toLocaleDateString()}</span>
                </button>

                {isOpen && (

                  <div className="moderation-details">

                    <div className="moderation-reason">
                      <strong>Moderation reason:</strong> {complaint.moderationReason || '—'}
                    </div>

                    {complaint.moderationFlags?.length > 0 && (
                      <div className="moderation-flags">
                        {complaint.moderationFlags.map(flag => (
                          <span key={flag} className="moderation-flag">{FLAG_LABELS[flag] || flag}</span>
                        ))}
                      </div>
                    )}

                    <div className="result-grid">
                      <div className="result-item"><span>Severity</span><strong>{complaint.severity}</strong></div>
                      <div className="result-item"><span>Location</span><strong>{complaint.location}</strong></div>
                      <div className="result-item">
                        <span>Citizen</span>
                        <strong>{complaint.citizenName || '—'}{complaint.citizenEmail ? ` (${complaint.citizenEmail})` : ''}</strong>
                      </div>
                      <div className="result-item">
                        <span>Mobile</span>
                        <strong>
                          {complaint.citizenMobile || 'Not provided'}
                          {complaint.citizenMobile ? (complaint.citizenMobileVerified ? ' (verified)' : ' (not verified)') : ''}
                        </strong>
                      </div>
                    </div>

                    <div className="submitted-description">
                      <span>Description</span>
                      <p>{complaint.description}</p>
                    </div>

                    {complaint.images?.length > 0 && (
                      <div className="submitted-description">
                        <span>Photos</span>
                        <ImageGallery images={complaint.images} />
                      </div>
                    )}

                    {complaint.moderationHistory?.length > 0 && (
                      <div className="moderation-audit">
                        <span>Decision history</span>
                        <ul>
                          {complaint.moderationHistory.map(entry => (
                            <li key={entry._id}>
                              {new Date(entry.timestamp).toLocaleString()} — {entry.actor === 'admin' ? `Admin ${entry.adminEmail || ''}` : 'Automatic check'}: <strong>{entry.decision.replace('_', ' ')}</strong>
                              {entry.reason ? ` — ${entry.reason}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="form-group">
                      <label htmlFor={`moderation-reason-${complaint.id}`}>
                        {tab === 'needs_review' ? 'Reason (required to reject, optional note when approving)' : 'Note (optional)'}
                      </label>
                      <textarea
                        id={`moderation-reason-${complaint.id}`}
                        rows={2}
                        maxLength={500}
                        value={reason}
                        onChange={event => setReason(event.target.value)}
                        placeholder="This message is shown to the citizen."
                        disabled={isBusy}
                      />
                    </div>

                    <div className="wizard-actions">

                      {tab === 'needs_review' && (
                        <button type="button" className="secondary-button" disabled={Boolean(busyId)} onClick={() => decide(complaint, 'reject')}>
                          {isBusy ? 'Saving...' : 'Reject'}
                        </button>
                      )}

                      <button type="button" className="submit-button" disabled={Boolean(busyId)} onClick={() => decide(complaint, 'approve')}>
                        {isBusy ? 'Saving...' : tab === 'rejected' ? 'Overturn & Approve' : 'Approve'}
                      </button>

                    </div>

                  </div>

                )}

              </div>

            )

          })}

        </div>

      )}

    </div>
  )

}

export default ModerationPanel
