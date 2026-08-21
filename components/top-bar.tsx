'use client'

import { Menu, Music2, X } from 'lucide-react'

import { CEREMONY } from '@/lib/config'

type TopBarProps = {
  menuOpen: boolean
  onToggleMenu: () => void
}

export function TopBar({ menuOpen, onToggleMenu }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <Music2 size={19} />
        </span>
        <div>
          <strong>PRIME</strong>
          <small>repertório de cerimônia</small>
        </div>
      </div>

      <p className="event-label">
        <span>{CEREMONY.label}</span>
        <b>{CEREMONY.date}</b>
      </p>

      <button
        type="button"
        className="icon-button mobile-menu"
        onClick={onToggleMenu}
        aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={menuOpen}
        aria-controls="main-nav"
      >
        {menuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>
    </header>
  )
}
