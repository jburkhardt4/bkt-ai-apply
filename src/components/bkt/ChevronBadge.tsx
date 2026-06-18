// BKT AI-Apply — ChevronBadge
// Red notification pill with a stack of two staggered, pulsing chevrons + a
// count. Signals "matches awaiting review" on the Review Matches tab. The
// bkt-chevron-pulse keyframe lives in bkt.css and honors prefers-reduced-motion.
import { Icon } from './Icon'

interface ChevronBadgeProps {
  count: number
}

export function ChevronBadge({ count }: ChevronBadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: '#cb112d',
        color: '#fff',
        padding: '0 0.4rem',
        borderRadius: 9999,
        fontSize: 14,
        fontWeight: 600,
        lineHeight: 1.5,
      }}
    >
      <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span
          style={{
            display: 'flex',
            marginBottom: -3,
            animation: 'bkt-chevron-pulse 1.6s infinite',
            animationDelay: '0.4s',
          }}
        >
          <Icon name="chevron-up" size={10} strokeWidth={2.6} color="#fff" />
        </span>
        <span style={{ display: 'flex', animation: 'bkt-chevron-pulse 1.6s infinite' }}>
          <Icon name="chevron-up" size={10} strokeWidth={2.6} color="#fff" />
        </span>
      </span>
      <span className="bkt-num">{count}</span>
    </span>
  )
}
