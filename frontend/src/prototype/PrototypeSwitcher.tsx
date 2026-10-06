import { useNavigate, useLocation } from 'react-router-dom'
import { House, MapTrifold, ShieldCheck } from '@phosphor-icons/react'

interface PrototypeSwitcherProps {
  current?: 'Landing' | 'Map'
}

/**
 * PrototypeSwitcher — Sleek bottom floating navigation pill in DEV mode
 * to switch between the chosen Landing Page and Map Workspace designs.
 */
export default function PrototypeSwitcher({ current }: PrototypeSwitcherProps) {
  const navigate = useNavigate()
  const location = useLocation()

  if (!import.meta.env.DEV) {
    return null
  }

  const isMap = current === 'Map' || location.pathname.startsWith('/prototype/map')

  return (
    <aside
      aria-label="Prototype Navigation"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 rounded-full bg-slate-900/95 px-3 py-1.5 text-xs text-white shadow-2xl backdrop-blur-md border border-slate-700/80 select-none animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px] pl-1 pr-1.5 border-r border-slate-700">
        Perimeter
      </span>

      <button
        type="button"
        onClick={() => navigate('/')}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-all cursor-pointer ${
          !isMap
            ? 'bg-rose-500 text-white shadow-xs'
            : 'text-slate-300 hover:text-white hover:bg-slate-800'
        }`}
      >
        <House size={14} weight="bold" />
        <span>Landing Page</span>
      </button>

      <button
        type="button"
        onClick={() => navigate('/prototype/map')}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-all cursor-pointer ${
          isMap
            ? 'bg-rose-500 text-white shadow-xs'
            : 'text-slate-300 hover:text-white hover:bg-slate-800'
        }`}
      >
        <MapTrifold size={14} weight="bold" />
        <span>Map UI (Left Dock)</span>
      </button>

      <button
        type="button"
        onClick={() => navigate('/admin')}
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer border-l border-slate-700 ml-1"
        title="ไปที่หน้า Admin Panel"
      >
        <ShieldCheck size={14} weight="bold" />
        <span>Admin</span>
      </button>
    </aside>
  )
}
