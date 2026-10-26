import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Room } from '../../types/room'
import type { Graph } from '../../types/graph'
import type { UseGraphResult } from '../../hooks/useGraph'

const updateClosures = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('../../services/adminService', () => ({ updateClosures }))

import { ClosurePanel } from '../ClosurePanel'

const room = (id: string, code: string, roomNumber: string, x: number): Room => ({
  id,
  code,
  roomNumber,
  nameThai: `ห้องบรรยาย ${roomNumber}`,
  building: 'LC3',
  floor: 1,
  category: 'lecture_room',
  coordinates: { x, y: 100 },
  landmarks: [],
  aliases: [],
})
const rooms = [room('LC3-F1-R104', 'LC3-104', '104', 100), room('LC3-F1-R105', 'LC3-105', '105', 300)]

const baseGraph = (): Graph => ({
  graphId: 'LC3',
  nodes: [
    { elementId: 'NODE#LC3_104', nodeId: 'LC3_104', floor: 1, x: 100, y: 110, nodeType: 'room', locationId: 'LC3-F1-R104', closed: false },
    { elementId: 'NODE#LC3_105', nodeId: 'LC3_105', floor: 1, x: 300, y: 110, nodeType: 'room', locationId: 'LC3-F1-R105', closed: false },
    { elementId: 'NODE#J1', nodeId: 'J1', floor: 1, x: 105, y: 150, nodeType: 'junction', closed: false },
    { elementId: 'NODE#J2', nodeId: 'J2', floor: 1, x: 295, y: 150, nodeType: 'junction', closed: false },
  ],
  edges: [
    { elementId: 'EDGE#J1|J2', from: 'J1', to: 'J2', edgeType: 'walk', distance: 190, closed: false },
    { elementId: 'EDGE#LC3_104|J1', from: 'LC3_104', to: 'J1', edgeType: 'walk', distance: 40, closed: false },
  ],
})

// Fixed clock: 28 Oct 2026, 09:00 Bangkok. Stable identity, as ClosurePanel requires.
const NOW = new Date('2026-10-28T09:00:00+07:00')
const now = () => NOW

function setup(graph: Graph | null = baseGraph(), overrides: Partial<UseGraphResult> = {}) {
  const reload = vi.fn(async () => {})
  const onOverlayChange = vi.fn()
  const onFloorChange = vi.fn()
  const graphState: UseGraphResult = { graph, loading: false, error: null, reload, ...overrides }
  const user = userEvent.setup()
  const utils = render(
    <ClosurePanel
      rooms={rooms}
      graphState={graphState}
      floor={1}
      onFloorChange={onFloorChange}
      onOverlayChange={onOverlayChange}
      now={now}
    />,
  )
  return { user, reload, onOverlayChange, onFloorChange, ...utils }
}

const form = () => within(screen.getByRole('form', { name: 'ปิดชั่วคราว' }))

describe('ClosurePanel', () => {
  beforeEach(() => updateClosures.mockClear())

  it('closes a room with a window and reason, then refreshes the graph', async () => {
    const { user, reload } = setup()
    await user.click(form().getByRole('combobox'))
    await user.type(form().getByRole('combobox'), '105{Enter}')
    await user.type(form().getByLabelText('เปิดอีกครั้ง'), '2026-10-29T12:00')
    await user.type(form().getByLabelText('เหตุผล'), 'ปรับปรุงห้อง')
    await user.click(form().getByRole('button', { name: 'บันทึกการปิดห้อง' }))

    expect(updateClosures).toHaveBeenCalledWith([
      {
        element_id: 'NODE#LC3_105',
        closed: true,
        closed_from: '2026-10-28T09:00:00+07:00',
        closed_until: '2026-10-29T12:00:00+07:00',
        closed_reason: 'ปรับปรุงห้อง',
      },
    ])
    expect(reload).toHaveBeenCalled()
    expect(await screen.findByText('ปิดห้อง 105แล้ว')).toBeInTheDocument()
    // The form is empty again, ready for the next closure.
    expect(form().getByRole('combobox')).toHaveValue('')
    expect(form().getByLabelText('เปิดอีกครั้ง')).toHaveValue('')
    expect(form().getByLabelText('เหตุผล')).toHaveValue('')
    expect(form().getByLabelText('เริ่มปิด')).toHaveValue('2026-10-28T09:00')
  })

  it('asks for a room before saving', async () => {
    const { user } = setup()
    await user.click(form().getByRole('button', { name: 'บันทึกการปิดห้อง' }))
    expect(form().getByRole('alert')).toHaveTextContent('กรุณาเลือกห้องที่จะปิด')
    expect(updateClosures).not.toHaveBeenCalled()
  })

  it('rejects a window that ends before it starts, without calling the API', async () => {
    const { user } = setup()
    await user.click(form().getByRole('combobox'))
    await user.type(form().getByRole('combobox'), '104{Enter}')
    await user.type(form().getByLabelText('เปิดอีกครั้ง'), '2026-10-28T08:00')
    await user.click(form().getByRole('button', { name: 'บันทึกการปิดห้อง' }))
    expect(form().getByRole('alert')).toHaveTextContent('เวลาเริ่มต้องไม่หลังเวลาสิ้นสุด')
    expect(updateClosures).not.toHaveBeenCalled()
  })

  it('closes several walkways picked by search in one request and highlights them', async () => {
    const { user, onOverlayChange } = setup()
    await user.click(form().getByRole('button', { name: 'ปิดทางเดิน' }))
    await user.type(form().getByLabelText('ค้นหาทางเดิน'), '104')
    const list = within(form().getByRole('list', { name: 'รายการทางเดิน' }))
    await user.click(list.getByLabelText('ทางเดิน ห้อง 104 ↔ ห้อง 105'))
    await user.click(list.getByLabelText('ทางเดินหน้าห้อง 104'))

    expect(onOverlayChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'EDGE#J1|J2', tone: 'selected' })]),
    )

    await user.click(form().getByRole('button', { name: 'ปิดทางเดินที่เลือก (2)' }))
    const sent = (updateClosures.mock.calls[0] as unknown as [Array<{ element_id: string }>])[0]
    expect(sent.map((c) => c.element_id).sort()).toEqual(['EDGE#J1|J2', 'EDGE#LC3_104|J1'])
  })

  it('shows the API error and keeps the form', async () => {
    updateClosures.mockRejectedValueOnce(new Error('closed_until is already in the past'))
    const { user } = setup()
    await user.click(form().getByRole('combobox'))
    await user.type(form().getByRole('combobox'), '104{Enter}')
    await user.click(form().getByRole('button', { name: 'บันทึกการปิดห้อง' }))
    expect(await form().findByRole('alert')).toHaveTextContent('closed_until is already in the past')
  })

  it('lists current closures and reopens one', async () => {
    const g = baseGraph()
    g.nodes[0] = { ...g.nodes[0], closed: true, closedUntil: '2026-10-29T12:00:00+07:00', closedReason: 'ซ่อมแอร์' }
    const { user, reload } = setup(g)
    const list = within(screen.getByRole('region', { name: 'ที่ปิดอยู่หรือกำหนดไว้' }))
    expect(list.getByText('ห้อง 104 · LC3-104')).toBeInTheDocument()
    expect(list.getByText('ปิดอยู่ตอนนี้')).toBeInTheDocument()
    expect(list.getByText('เหตุผล: ซ่อมแอร์')).toBeInTheDocument()

    await user.click(list.getByRole('button', { name: 'ยกเลิกการปิด' }))
    expect(updateClosures).toHaveBeenCalledWith([{ element_id: 'NODE#LC3_104', closed: false }])
    expect(reload).toHaveBeenCalled()
  })

  it('edits the window and reason of a listed closure in place', async () => {
    const g = baseGraph()
    g.edges[1] = {
      ...g.edges[1],
      closed: true,
      closedFrom: '2026-10-28T08:00:00+07:00',
      closedUntil: '2026-10-29T12:00:00+07:00',
      closedReason: 'ซ่อมพื้น',
    }
    const { user, reload, onFloorChange } = setup(g)
    const list = within(screen.getByRole('region', { name: 'ที่ปิดอยู่หรือกำหนดไว้' }))
    await user.click(list.getByRole('button', { name: /แก้ไขเวลา/ }))

    const editForm = form()
    expect(screen.getByRole('heading', { name: 'แก้ไขการปิด' })).toBeInTheDocument()
    expect(onFloorChange).toHaveBeenCalledWith(1)
    expect(editForm.getByLabelText('เริ่มปิด')).toHaveValue('2026-10-28T08:00')
    expect(editForm.getByLabelText('เปิดอีกครั้ง')).toHaveValue('2026-10-29T12:00')
    expect(editForm.getByLabelText('เหตุผล')).toHaveValue('ซ่อมพื้น')
    // Only this closure is edited: no room/walkway picker while editing.
    expect(editForm.queryByRole('list', { name: 'รายการทางเดิน' })).not.toBeInTheDocument()

    await user.clear(editForm.getByLabelText('เปิดอีกครั้ง'))
    await user.type(editForm.getByLabelText('เปิดอีกครั้ง'), '2026-10-30T18:00')
    await user.clear(editForm.getByLabelText('เหตุผล'))
    await user.type(editForm.getByLabelText('เหตุผล'), 'ซ่อมพื้นเพิ่ม')
    await user.click(editForm.getByRole('button', { name: 'บันทึกการแก้ไข' }))

    expect(updateClosures).toHaveBeenCalledWith([
      {
        element_id: 'EDGE#LC3_104|J1',
        closed: true,
        closed_from: '2026-10-28T08:00:00+07:00',
        closed_until: '2026-10-30T18:00:00+07:00',
        closed_reason: 'ซ่อมพื้นเพิ่ม',
      },
    ])
    expect(reload).toHaveBeenCalled()
    expect(await screen.findByText('แก้ไขการปิด ทางเดินหน้าห้อง 104 แล้ว')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ปิดชั่วคราว' })).toBeInTheDocument()
  })

  it('cancels an edit without saving', async () => {
    const g = baseGraph()
    g.nodes[0] = { ...g.nodes[0], closed: true, closedReason: 'ซ่อมแอร์' }
    const { user } = setup(g)
    const list = within(screen.getByRole('region', { name: 'ที่ปิดอยู่หรือกำหนดไว้' }))
    await user.click(list.getByRole('button', { name: /แก้ไขเวลา/ }))
    expect(form().getByLabelText('เหตุผล')).toHaveValue('ซ่อมแอร์')

    await user.click(form().getByRole('button', { name: 'ยกเลิกการแก้ไข' }))
    expect(updateClosures).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'ปิดชั่วคราว' })).toBeInTheDocument()
    expect(form().getByLabelText('เหตุผล')).toHaveValue('')
  })

  it('draws closed walkways dashed on the map even when not picked', () => {
    const g = baseGraph()
    g.edges[0] = { ...g.edges[0], closed: true }
    const { onOverlayChange } = setup(g)
    expect(onOverlayChange).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'EDGE#J1|J2', tone: 'closed' })])
  })

  it('offers a retry when the graph cannot load', async () => {
    const { user, reload } = setup(null, { error: new Error('network') })
    expect(screen.getByText(/โหลดผังทางเดินไม่สำเร็จ: network/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'ลองใหม่' }))
    expect(reload).toHaveBeenCalled()
  })
})
