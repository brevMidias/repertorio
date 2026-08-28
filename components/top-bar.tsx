'use client'

import { Menu, X } from 'lucide-react'

type TopBarProps = {
  menuOpen: boolean
  onToggleMenu: () => void
}

/**
 * Barra superior. Existe só para abrigar o botão do menu no mobile: no desktop
 * a navegação já aparece inteira, então o CSS esconde a barra por lá.
 */
export function TopBar({ menuOpen, onToggleMenu }: TopBarProps) {
  return (
    <header className="topbar">
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
