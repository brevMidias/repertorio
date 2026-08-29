'use client'

import { ListMusic, Volume2, type LucideIcon } from 'lucide-react'

import type { AppView } from '@/lib/types'

const NAV_ITEMS: { view: AppView; label: string; Icon: LucideIcon }[] = [
  { view: 'repertoire', label: 'Repertório', Icon: ListMusic },
  { view: 'stage', label: 'Modo palco', Icon: Volume2 },
]

type MainNavProps = {
  view: AppView
  onChange: (view: AppView) => void
}

/** Duas abas cabem na tela mais estreita, então a navegação fica sempre visível. */
export function MainNav({ view, onChange }: MainNavProps) {
  return (
    <nav className="main-nav" aria-label="Seções do aplicativo">
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
