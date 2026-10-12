import { useState } from 'react'

/** Drop the logo image at public/logo.png (or .svg → change the src); falls back to the name. */
export function Logo() {
  const [failed, setFailed] = useState(false)
  return (
    <div className="logo">
      {!failed && <img src="/logo.png" alt="Dawit Demissie" height={32} onError={() => setFailed(true)} />}
      {failed && <strong>Dawit Demissie</strong>}
    </div>
  )
}
