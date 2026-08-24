// CivicPulse mark: a civic location pin, crossed by a live pulse/data
// line with small community "node" dots — civic services + real-time
// data + community, in the existing brand green (#3f7d58).
function LogoMark({ size = 34 }) {

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="11" fill="#3f7d58" />

      <path
        d="M20 9c-4.4 0-8 3.4-8 7.9 0 5.6 8 13.6 8 13.6s8-8 8-13.6C28 12.4 24.4 9 20 9z"
        fill="#ffffff"
        fillOpacity="0.16"
      />

      <path
        d="M7 21h5.2l2.4-5.4 3 9.6 2.6-8 2.2 3.8H33"
        stroke="#ffffff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle cx="12.2" cy="21" r="1.8" fill="#ffffff" />
      <circle cx="33" cy="21" r="1.8" fill="#ffffff" />
    </svg>
  )
}

// Full lockup: icon + wordmark. Pass iconOnly for tight spaces (e.g. a
// browser tab favicon context) where the text wouldn't fit.
function Logo({ size = 34, iconOnly = false, className = '' }) {

  return (
    <div className={`brand-logo ${className}`.trim()}>

      <LogoMark size={size} />

      {!iconOnly && (
        <span className="logo">
          Civic<span>Pulse</span>
        </span>
      )}

    </div>
  )
}

export default Logo
