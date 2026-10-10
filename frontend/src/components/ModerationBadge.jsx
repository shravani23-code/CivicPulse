// Small pill shown next to a complaint's operational status when it has
// not (yet) been accepted into the processing workflow. Complaints
// without a moderationStatus predate moderation and count as approved,
// so nothing is rendered for them.
const LABELS = {
  needs_review: 'Under Review',
  rejected: 'Not Accepted'
}

function ModerationBadge({ status }) {

  if (!LABELS[status]) return null

  return (
    <span className={`moderation-badge ${status === 'rejected' ? 'rejected' : 'review'}`}>
      {LABELS[status]}
    </span>
  )

}

export default ModerationBadge
