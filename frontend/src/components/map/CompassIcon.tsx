export interface CompassIconProps {
  /** Heading angle in degrees (clockwise from top). Defaults to -41.4° (True North of LC3 campus) */
  heading?: number
  size?: number
  className?: string
}

/**
 * Google Maps Street View & 3D Navigation Compass Widget
 *
 * Exact match to Google Maps Street View / 3D rotation compass:
 * - Outer dark circular base disc (#202124)
 * - Inner subtle contrast disc (#35373a)
 * - Counter-clockwise left rotation arrow (#dadce0)
 * - Clockwise right rotation arrow (#dadce0)
 * - Dynamic central dual-ended diamond compass needle rotating with heading:
 *   - North pointer: Google Red (#ea4335 left facet, #d93025 right facet)
 *   - South pointer: White / Silver (#ffffff left facet, #dadce0 right facet)
 */
export function CompassIcon({ heading = -41.4, size = 22, className = '' }: CompassIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {/* Outer dark disc */}
      <circle cx="24" cy="24" r="23" fill="#202124" />

      {/* Inner subtle circle */}
      <circle cx="24" cy="24" r="11" fill="#35373a" />

      {/* Left rotation arrow (counter-clockwise) */}
      <path
        d="M 9.16 14.73 A 17.5 17.5 0 0 0 8.55 32.22"
        stroke="#dadce0"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <polygon
        points="9.97,34.86 5.37,32.22 10.30,29.57"
        fill="#dadce0"
      />

      {/* Right rotation arrow (clockwise) */}
      <path
        d="M 38.84 14.73 A 17.5 17.5 0 0 1 39.45 32.22"
        stroke="#dadce0"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <polygon
        points="38.03,34.86 42.63,32.22 37.70,29.57"
        fill="#dadce0"
      />

      {/* Center compass needle (rotates with heading) */}
      <g
        style={{
          transform: `rotate(${heading}deg)`,
          transformOrigin: '24px 24px',
          transition: 'transform 150ms ease-out',
        }}
      >
        {/* North pointer (Google Red) */}
        <polygon points="24,9 20,24 24,24" fill="#ea4335" />
        <polygon points="24,9 28,24 24,24" fill="#d93025" />

        {/* South pointer (White / Silver) */}
        <polygon points="24,39 20,24 24,24" fill="#ffffff" />
        <polygon points="24,39 28,24 24,24" fill="#dadce0" />
      </g>
    </svg>
  )
}

export default CompassIcon
