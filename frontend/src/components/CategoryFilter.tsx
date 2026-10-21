import { CATEGORY_FILTERS } from '../services/filterRooms.ts'

interface CategoryFilterProps {
  value: string
  onChange: (categoryKey: string) => void
}

/** Room-category chips: the active one is the black primary pill, the rest are grey tertiary pills. */
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
            className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-tertiary'}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
