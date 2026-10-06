import { CATEGORY_FILTERS } from '../services/filterRooms.ts'

interface CategoryFilterProps {
  value: string
  onChange: (categoryKey: string) => void
}

export default function CategoryFilter({ value, onChange }: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="กรองตามประเภทห้อง">
      {CATEGORY_FILTERS.map((option) => {
        const isActive = option.key === value

        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            aria-pressed={isActive}
            className={
              isActive
                ? 'rounded-full bg-slate-900 border border-slate-900 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 transition-all duration-200 cursor-pointer'
                : 'rounded-full border border-slate-200 bg-slate-100 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200/80 hover:border-slate-300 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 transition-all duration-200 cursor-pointer'
            }
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}



