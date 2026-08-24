const TABS = ['All', 'Pending', 'In Progress', 'Resolved']

// Shared status filter tabs — used by both the Admin Dashboard and
// My Complaints so "Resolved" is always a clearly separated view rather
// than a value buried in a dropdown.
function StatusTabs({ value, onChange, counts = {} }) {

  return (
    <div className="status-tabs" role="tablist" aria-label="Filter by status">

      {TABS.map(tab => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={value === tab}
          className={`status-tab${value === tab ? ' active' : ''}`}
          onClick={() => onChange(tab)}
        >
          {tab}
          {typeof counts[tab] === 'number' && (
            <span className="status-tab-count">{counts[tab]}</span>
          )}
        </button>
      ))}

    </div>
  )
}

export default StatusTabs
