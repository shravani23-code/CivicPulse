import { useEffect, useState } from 'react'
import { MessageSquare, AlertTriangle, RefreshCw } from 'lucide-react'
import { useAuth } from '../auth/useAuthContext'

// Citizen's SMS status-update preference. Consent is opt-in and can be
// withdrawn at any time; the backend records when. The card never claims
// an SMS will arrive unless the backend says SMS sending is actually set
// up AND the number is verified.
function SmsPreferences() {

  const { authRequest } = useAuth()

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {

    let cancelled = false

    authRequest('/api/auth/me')
      .then(data => { if (!cancelled) { setProfile(data); setError('') } })
      .catch(fetchError => { if (!cancelled) setError(fetchError.message || 'Failed to load your SMS preference.') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }

  }, [authRequest, reloadKey])

  async function setConsent(consent) {

    if (saving) return

    if (!consent && !window.confirm('Stop SMS updates about your complaints? You will still see every update here in CivicPulse.')) return

    try {

      setSaving(true)
      setMessage('')

      const data = await authRequest('/api/auth/me/sms-consent', { method: 'PUT', json: { consent } })

      setProfile(current => ({ ...current, ...data }))
      setMessage(data.message)

    } catch (saveError) {

      setMessage(saveError.message || 'Failed to update your SMS preference.')

    } finally {

      setSaving(false)

    }

  }

  if (loading) {
    return (
      <div className="admin-card sms-card">
        <div className="panel-status" role="status">
          <RefreshCw size={16} className="spin" aria-hidden="true" />
          Loading SMS preference...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-card sms-card">
        <div className="panel-status error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" className="link-button" onClick={() => { setLoading(true); setReloadKey(key => key + 1) }}>Retry</button>
        </div>
      </div>
    )
  }

  const consent = Boolean(profile?.smsConsent)

  let note

  if (!profile?.hasMobile) {
    note = 'Add a mobile number when you next report a complaint to be able to turn on SMS updates.'
  } else if (!profile.smsUpdatesAvailable) {
    note = 'SMS sending has not been enabled by CivicPulse yet, so no SMS will be sent for now. Your choice is saved and will apply once it is.'
  } else if (!profile.mobileVerified) {
    note = 'Your number is not verified yet. SMS is only sent to verified numbers — verify it from the complaint form.'
  } else if (consent) {
    note = 'You will get a short SMS when a complaint is registered, reviewed, approved, not approved, in progress or resolved. SMS never includes addresses or descriptions.'
  }

  return (
    <div className="admin-card sms-card">

      <div className="sms-card-row">

        <div>
          <h2 className="notifications-title">
            <MessageSquare size={20} />
            SMS updates
          </h2>
          <p>
            {profile?.hasMobile ? <>Number on file: <strong>{profile.mobileMasked}</strong>{profile.mobileVerified ? ' (verified)' : ' (not verified)'}</> : 'No mobile number on file.'}
          </p>
        </div>

        <label className="sms-toggle">
          <input
            type="checkbox"
            checked={consent}
            disabled={saving || (!consent && !profile?.hasMobile)}
            onChange={event => setConsent(event.target.checked)}
          />
          <span>{saving ? 'Saving...' : consent ? 'On' : 'Off'}</span>
        </label>

      </div>

      {note && <small className="field-hint">{note}</small>}

      {consent && profile?.smsConsentAt && (
        <small className="field-hint">Turned on {new Date(profile.smsConsentAt).toLocaleString()}. You can turn it off at any time.</small>
      )}

      {message && <small className="field-hint" role="status">{message}</small>}

    </div>
  )

}

export default SmsPreferences
