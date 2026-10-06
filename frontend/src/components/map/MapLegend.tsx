import { useState } from 'react'
import { CaretDown, Palette } from '@phosphor-icons/react'
import type { LegendEntry } from './floorConfig'

export interface MapLegendProps {
  entries: LegendEntry[]
}

/** Desktop shows the key by default; on phones the map is small, so it starts collapsed. */
function prefersOpenLegend(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(min-width: 640px)').matches
}

/**
 * Colour key for the floor-plan room fills.
 *
 * The artwork only printed its legend on floor 1, and there it scrolled out of view as
 * soon as you zoomed in. Drawn here instead, it stays on screen and follows the floor.
 */
function MapLegend({ entries }: MapLegendProps) {
  const [isOpen, setIsOpen] = useState<boolean>(prefersOpenLegend)

  return (
    <div className="absolute bottom-6 left-4 z-10 sm:bottom-6 sm:left-6">
      <div className="rounded-2xl bg-white/95 shadow-2xl backdrop-blur-md border border-slate-100/80">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls="map-legend-items"
          onClick={() => setIsOpen((open) => !open)}
          className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-all duration-150 cursor-pointer"
        >
          <Palette size={18} weight="bold" aria-hidden="true" />
          <span>ประเภทพื้นที่</span>
          <CaretDown
            size={14}
            weight="bold"
            aria-hidden="true"
            className={
              isOpen
                ? 'ml-auto rotate-180 transition-transform duration-200'
                : 'ml-auto transition-transform duration-200'
            }
          />
        </button>

        <ul id="map-legend-items" hidden={!isOpen} className="px-3 pb-2.5 pt-0.5 space-y-1.5">
          {entries.map((entry) => (
            <li key={`${entry.fill}-${entry.label}`} className="flex items-center gap-2 text-xs text-slate-600">
              <span
                data-testid={`legend-swatch-${entry.fill}`}
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-full border border-slate-300"
                style={{ backgroundColor: entry.fill }}
              />
              <span>{entry.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default MapLegend
