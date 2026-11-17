import { getCategoryLabel, getCategoryPinColor } from '../services/roomDisplay'

/**
 * Room-category label as a neutral chip with a dot in the category's map-pin colour, so
 * the colour links the label to the pins on the floor plan without tinting the whole pill
 * (docs/design/uber-designmd.md: black and white carry the interface, category colour is data).
 */
export default function CategoryBadge({ category, className = '' }: { category: string; className?: string }) {
  return (
    <span className={`chip w-fit ${className}`}>
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: getCategoryPinColor(category) }}
      />
      <span>{getCategoryLabel(category)}</span>
    </span>
  )
}
