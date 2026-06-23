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
        background: 'var(--destructive)', // Using BKT design token
        color: 'var(--destructive-foreground)', // Using BKT design token
        padding: '0 0.4rem',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.5,
        transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out',
      }}
    >
      <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* top chevron — 0.4s stagger behind the bottom one creates the upward "wave". */}
        <span
          className={animate ? 'bkt-chevron-flow' : undefined}
          style={{
            display: 'flex',
            marginBottom: -6,
            animationDelay: animate ? '0.4s' : undefined,
          }}
        >
          <Icon name="chevron-up" size={10} strokeWidth={2.6} color="currentColor" />
        </span>
        {/* bottom chevron — leads the pulse at 0s delay */}
        <span
          className={animate ? 'bkt-chevron-flow' : undefined}
          style={{ display: 'flex' }}
        >
          <Icon name="chevron-up" size={10} strokeWidth={2.6} color="currentColor" />
        </span>
      </span>
      <span className="bkt-num">{count}</span>
    </span>
  )
}