import { Copy, Check } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'

// Copies `value` to the clipboard, briefly swaps the icon to a checkmark,
// and shows a toast — used anywhere a complaint ID is displayed.
function CopyButton({ value, label = 'Copy complaint ID' }) {

  const [copied, setCopied] = useState(false)

  async function handleCopy() {

    try {

      await navigator.clipboard.writeText(value)

      setCopied(true)
      toast.success('Copied!')

      setTimeout(() => setCopied(false), 1500)

    } catch {

      toast.error('Could not copy to clipboard.')

    }

  }

  return (
    <button
      type="button"
      className="copy-button"
      onClick={handleCopy}
      aria-label={label}
      title={label}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  )
}

export default CopyButton
