'use client'

import { ListMusic, ShieldCheck, Volume2, type LucideIcon } from 'lucide-react'

import type { AppView } from '@/lib/types'

const NAV_ITEMS: { view: AppView; label: string; Icon: LucideIcon }[] = [
  { view: 'repertoire', label: 'Repertório', Icon: ListMusic },
  { view: 'stage', label: 'Modo palco', Icon: Volume2 },
  { view: 'prep', label: 'Preparação', Icon: ShieldCheck },
]

type MainNavProps = {
  view: AppView
  open: boolean
  onChange: (view: AppView) => void
}

export function MainNav({ view, open, onChange }: MainNavProps) {
  return (
    <nav id="main-nav" className={`main-nav${open ? ' open' : ''}`} aria-label="Seções do aplicativo">
      {NAV_ITEMS.map(({ view: item, label, Icon }) => (
        <button
          key={item}
          type="button"
          className={view === item ? 'active' : undefined}
          aria-current={view === item ? 'page' : undefined}
          onClick={() => onChange(item)}
        >
          <Icon size={18} aria-hidden="true" />
          {label}
        </button>
      ))}
    </nav>
  )
}
