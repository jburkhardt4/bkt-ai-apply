// BKT AI-Apply — Icon
// Thin wrapper over lucide-react that accepts the design system's
// kebab-case icon names (e.g. "layout-dashboard"), so component code
// stays 1:1 with the design-system kit.
import type { CSSProperties, ComponentType } from 'react'
import * as LucideIcons from 'lucide-react'

interface LucideProps {
  size?: number | string
  strokeWidth?: number | string
  color?: string
  style?: CSSProperties
  'aria-hidden'?: boolean
}

const registry = LucideIcons as unknown as Record<string, ComponentType<LucideProps>>

export interface IconProps {
  /** kebab-case lucide name, e.g. "circle-check" */
  name: string
  size?: number
  strokeWidth?: number
  color?: string
  style?: CSSProperties
}

export function Icon({ name, size = 16, strokeWidth = 1.8, color, style }: IconProps) {
  const pascal = name
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
  const Cmp = registry[pascal] ?? registry[`${pascal}Icon`]
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
        color: color ?? 'currentColor',
        ...style,
      }}
    >
      {Cmp ? <Cmp size={size} strokeWidth={strokeWidth} /> : null}
    </span>
  )
}
