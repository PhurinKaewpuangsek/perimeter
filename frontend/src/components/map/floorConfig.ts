export interface LegendEntry {
  /** A room fill used in the floor-plan artwork. */
  fill: string
  label: string
}

export interface FloorConfig {
  floor: number
  label: string
  asset: string
  width: number
  height: number
  /** What the artwork's room colours mean — only the colours this floor actually uses. */
  legend: LegendEntry[]
}

/** The artwork's room category colour key matching the floor plan fills. */
const LECTURE_ROOM: LegendEntry = { fill: '#EDE9FE', label: 'ห้องบรรยาย' }
const SEMINAR_ROOM: LegendEntry = { fill: '#FAE8FF', label: 'ห้องสัมมนา' }
const OFFICE: LegendEntry = { fill: '#FEF3C7', label: 'ห้องพักอาจารย์ / สำนักงาน' }
const LABORATORY: LegendEntry = { fill: '#ECFCCB', label: 'ห้องปฏิบัติการ' }
const RESEARCH_ROOM: LegendEntry = { fill: '#D1FAE5', label: 'ห้องวิจัย' }
const MEETING_ROOM: LegendEntry = { fill: '#CCFBF1', label: 'ห้องประชุม' }
const FACILITY: LegendEntry = { fill: '#EFEEEE', label: 'สิ่งอำนวยความสะดวก' }

export const FLOOR_CONFIGS: FloorConfig[] = [
  {
    floor: 1,
    label: '1st Floor',
    asset: '/maps/lc3/floor-1.svg',
    width: 1217,
    height: 742,
    legend: [LECTURE_ROOM, SEMINAR_ROOM, OFFICE, LABORATORY, RESEARCH_ROOM, FACILITY],
  },
  {
    floor: 2,
    label: '2nd Floor',
    asset: '/maps/lc3/floor-2.svg',
    width: 1070,
    height: 528,
    legend: [LECTURE_ROOM, SEMINAR_ROOM, OFFICE, LABORATORY, MEETING_ROOM, FACILITY],
  },
]

export function getFloorConfig(floor: number): FloorConfig {
  const config = FLOOR_CONFIGS.find((entry) => entry.floor === floor)
  if (!config) {
    throw new Error(`No floor configuration found for floor ${floor}`)
  }
  return config
}
