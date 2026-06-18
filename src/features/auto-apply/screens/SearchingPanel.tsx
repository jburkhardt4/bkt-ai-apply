// BKT AI-Apply — SearchingPanel
// The "we're searching for your best matches" progress state, shown in the
// Your Jobs list area while a prospector run kicked off from Play/Resume is in
// flight. Indeterminate bar (no granular progress signal from the search), so
// it animates until results refetch. Honors prefers-reduced-motion via bkt.css.
import type { CSSProperties } from 'react'

interface SearchingPanelProps {
  style?: CSSProperties
}

export function SearchingPanel({ style }: SearchingPanelProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 10,
        padding: '52px 24px',
        ...style,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-strong)' }}>
        We&apos;re searching for your best job matches
      </h3>
      <p
        style={{
          margin: 0,
          maxWidth: 460,
          color: 'var(--text-muted)',
          font: '400 var(--text-base)/1.5 var(--font-body)',
        }}
      >
        This can take up to an hour depending on your criteria. Our AI keeps scanning
        multiple sources and will update this page as soon as matches are found.
      </p>
      <div
        aria-hidden="true"
        style={{
          marginTop: 10,
          width: 'min(320px, 70%)',
          height: 6,
          borderRadius: 'var(--radius-pill)',
          background: 'var(--bkt-slate-100, rgba(0,0,0,0.06))',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '30%',
            height: '100%',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--primary)',
            animation: 'bkt-indeterminate 1.4s var(--ease-standard, ease) infinite',
          }}
        />
      </div>
    </div>
  )
}
