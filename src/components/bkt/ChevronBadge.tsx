// BKT AI-Apply — ChevronBadge
// Red notification pill with a stack of two staggered, pulsing chevrons + a
// count. Signals "matches awaiting review" on nav items with unread actions.
// The bkt-chevron-pulse keyframe lives in bkt.css and honors prefers-reduced-motion.
// Animation runs while count > 0; the parent is responsible for not rendering
// this component when count reaches 0 so the badge disappears entirely.
import { Icon } from './Icon'

interface ChevronBadgeProps {
  count: number
}

export function ChevronBadge({ count }: ChevronBadgeProps) {
  const animate = count > 0
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
        transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out',
      }}
    >
      <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* top chevron — 0.4s delay creates the flowing stagger */}
        <span
          style={{
            display: 'flex',
            marginBottom: -3,
            animation: animate ? 'bkt-chevron-pulse 1.6s ease-in-out infinite' : undefined,
            animationDelay: animate ? '0.4s' : undefined,
          }}
        >
          <Icon name="chevron-up" size={10} strokeWidth={2.6} color="#fff" />
        </span>
        {/* bottom chevron — leads the pulse at 0s delay */}
        <span
          style={{
            display: 'flex',
            animation: animate ? 'bkt-chevron-pulse 1.6s ease-in-out infinite' : undefined,
          }}
        >
          <Icon name="chevron-up" size={10} strokeWidth={2.6} color="#fff" />
        </span>
      </span>
      <span className="bkt-num">{count}</span>
    </span>
  )
}
