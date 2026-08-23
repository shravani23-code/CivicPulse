import { useEffect, useState, useRef } from 'react'

// Animates a number counting up from its previous value to `value`
// whenever `value` changes. Pure rAF easing, no dependency needed.
export function useCountUp(value, duration = 800) {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    const target = Number(value) || 0
    const from = fromRef.current
    const start = performance.now()
    let frameId

    function tick(now) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(from + (target - from) * eased))

      if (progress < 1) {
        frameId = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
      }
    }

    frameId = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frameId)
  }, [value, duration])

  return display
}
