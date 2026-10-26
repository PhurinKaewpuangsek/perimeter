/**
 * ClosurePanel — the "ทางปิดชั่วคราว" tab of /staff (#147).
 *
 * Staff close a room or one or more walkways for a time window with a reason, see what is
 * closed now or scheduled, and reopen it. Writes go through PUT /api/graph/closures; the
 * route API (GET /api/route) and the map read the result from GET /api/graph.
 * Kept out of AdminPage.tsx so that file does not grow further (docs/codebase-map.md).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Room } from '../types/room'
import type { ClosureChange } from '../types/graph'
import type { ClosureListItem } from '../services/closureModel'
import { useGraph } from '../hooks/useGraph'
import type { UseGraphResult } from '../hooks/useGraph'
import type { MapOverlaySegment } from './map/MapContainer'
import { updateClosures } from '../services/adminService'
import {
  buildWalkways,
  formatWindow,
  fromBangkokInputValue,
  listClosures,
  roomNodeFor,
  searchWalkways,
  toBangkokInputValue,
  windowError,
} from '../services/closureModel'
import { MAX_CLOSURE_REASON_LENGTH } from '../types/graph'
import RoomCombobox from './RoomCombobox'

type Target = 'room' | 'walkway'

/** Module-level so its identity is stable: a new function each render would re-run effects. */
const systemNow = () => new Date()

export interface ClosurePanelProps {
  rooms: Room[]
  /** The graph and its reload, from useGraph() in the page. */
  graphState: UseGraphResult
  /** Floor shown on the map; the walkway list follows it. */
  floor: number
  onFloorChange: (floor: number) => void
  /** Segments to draw on the 2D map: walkways picked in the form and those already closed. */
  onOverlayChange: (segments: MapOverlaySegment[]) => void
  /** Clock, injectable for tests. Pass a stable function (not an inline arrow). */
  now?: () => Date
}

export function ClosurePanel({
  rooms,
  graphState,
  floor,
  onFloorChange,
  onOverlayChange,
  now = systemNow,
}: ClosurePanelProps) {
  const { graph, loading, error, reload } = graphState
  const [target, setTarget] = useState<Target>('room')
  const [roomCode, setRoomCode] = useState('')
  const [walkwayQuery, setWalkwayQuery] = useState('')
  const [selectedWalkways, setSelectedWalkways] = useState<Set<string>>(new Set())
  const [previewWalkway, setPreviewWalkway] = useState<string | null>(null)
  const [fromValue, setFromValue] = useState(() => toBangkokInputValue(now()))
  const [untilValue, setUntilValue] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reopening, setReopening] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  /** The closure being edited; saving overwrites its window and reason (same PUT). */
  const [editing, setEditing] = useState<ClosureListItem | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Only rooms with a node in the routing graph can be closed.
  const closableRooms = useMemo(
    () =>
      graph
        ? rooms.filter((r) => r.code && roomNodeFor(graph, r)).sort((a, b) => a.code.localeCompare(b.code))
        : [],
    [graph, rooms],
  )
  const walkways = useMemo(() => (graph ? buildWalkways(graph, rooms, floor) : []), [graph, rooms, floor])
  const walkwayMatches = useMemo(() => searchWalkways(walkways, walkwayQuery), [walkways, walkwayQuery])
  const closures = useMemo(() => (graph ? listClosures(graph, rooms, now()) : []), [graph, rooms, now])

  // Picked walkways (accent) and every walkway closed now or later (dashed) on the 2D map.
  // Reported only when it changes, so a parent re-render can never loop back into here.
  const lastOverlayKey = useRef<string | null>(null)
  useEffect(() => {
    const closedIds = new Set(closures.filter((c) => c.kind === 'walkway').map((c) => c.elementId))
    const segments: MapOverlaySegment[] = walkways
      .filter((w) => selectedWalkways.has(w.elementId) || closedIds.has(w.elementId) || w.elementId === previewWalkway)
      .map((w) => ({
        id: w.elementId,
        floor: w.floor,
        x1: w.x1,
        y1: w.y1,
        x2: w.x2,
        y2: w.y2,
        tone: selectedWalkways.has(w.elementId)
          ? 'selected'
          : w.elementId === previewWalkway
            ? 'preview'
            : 'closed',
      }))
    const key = segments.map((seg) => `${seg.id}:${seg.tone}`).join(',')
    if (key === lastOverlayKey.current) return
    lastOverlayKey.current = key
    onOverlayChange(segments)
  }, [walkways, selectedWalkways, previewWalkway, closures, onOverlayChange])

  // Clear the map overlay when the tab closes.
  useEffect(() => () => onOverlayChange([]), [onOverlayChange])

  /** Back to an empty form, as when the tab opens. */
  function resetForm() {
    setRoomCode('')
    setWalkwayQuery('')
    setSelectedWalkways(new Set())
    setFromValue(toBangkokInputValue(now()))
    setUntilValue('')
    setReason('')
    setEditing(null)
    setFormError(null)
  }

  /** Loads a listed closure into the form so staff can change its time or reason. */
  function startEdit(item: ClosureListItem) {
    if (!graph) return
    setNotice(null)
    setFormError(null)
    setEditing(item)
    setTarget(item.kind)
    if (item.kind === 'room') {
      const node = graph.nodes.find((n) => n.elementId === item.elementId)
      setRoomCode(rooms.find((r) => r.id === node?.locationId)?.code ?? '')
    } else {
      onFloorChange(item.floor)
      setWalkwayQuery('')
      setSelectedWalkways(new Set([item.elementId]))
    }
    const { closedFrom, closedUntil, closedReason } = item.closure
    setFromValue(toBangkokInputValue(closedFrom ? new Date(closedFrom) : now()))
    setUntilValue(closedUntil ? toBangkokInputValue(new Date(closedUntil)) : '')
    setReason(closedReason ?? '')
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  function toggleWalkway(id: string) {
    setSelectedWalkways((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleClose(e: React.FormEvent) {
    e.preventDefault()
    if (!graph) return
    setFormError(null)
    setNotice(null)

    let elementIds: string[]
    let what: string
    if (editing) {
      elementIds = [editing.elementId]
      what = editing.label
    } else if (target === 'room') {
      const room = closableRooms.find((r) => r.code === roomCode)
      const node = room && roomNodeFor(graph, room)
      if (!room || !node) {
        setFormError('กรุณาเลือกห้องที่จะปิด')
        return
      }
      elementIds = [node.elementId]
      what = room.roomNumber ? `ห้อง ${room.roomNumber}` : room.code
    } else {
      elementIds = [...selectedWalkways]
      if (elementIds.length === 0) {
        setFormError('กรุณาเลือกทางเดินอย่างน้อย 1 ช่วง')
        return
      }
      what = `ทางเดิน ${elementIds.length} ช่วง`
    }

    const closedFrom = fromBangkokInputValue(fromValue)
    const closedUntil = fromBangkokInputValue(untilValue)
    const timeError = windowError(closedFrom, closedUntil, now())
    if (timeError) {
      setFormError(timeError)
      return
    }

    const trimmedReason = reason.trim()
    const changes: ClosureChange[] = elementIds.map((element_id) => ({
      element_id,
      closed: true,
      ...(closedFrom ? { closed_from: closedFrom } : {}),
      ...(closedUntil ? { closed_until: closedUntil } : {}),
      ...(trimmedReason ? { closed_reason: trimmedReason } : {}),
    }))

    setSaving(true)
    try {
      await updateClosures(changes)
      const done = editing ? `แก้ไขการปิด ${what} แล้ว` : `ปิด${what}แล้ว`
      resetForm()
      try {
        await reload()
        setNotice(done)
      } catch {
        setNotice(`${done} แต่โหลดรายการล่าสุดไม่สำเร็จ กรุณารีเฟรชหน้า`)
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function handleReopen(elementId: string, label: string) {
    setListError(null)
    setNotice(null)
    setReopening(elementId)
    try {
      await updateClosures([{ element_id: elementId, closed: false }])
      if (editing?.elementId === elementId) resetForm()
      try {
        await reload()
        setNotice(`ยกเลิกการปิด ${label} แล้ว`)
      } catch {
        setNotice(`ยกเลิกการปิด ${label} แล้ว แต่โหลดรายการล่าสุดไม่สำเร็จ กรุณารีเฟรชหน้า`)
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'ยกเลิกการปิดไม่สำเร็จ')
    } finally {
      setReopening(null)
    }
  }

  if (loading && !graph) {
    return (
      <div role="status" className="flex flex-col items-center justify-center py-12 text-center text-ink-3">
        <div className="h-6 w-6 border-2 border-ink border-t-transparent rounded-full animate-spin mb-2" />
        <p className="text-xs">กำลังโหลดผังทางเดิน...</p>
      </div>
    )
  }

  if (!graph) {
    return (
      <div className="card border-ink p-3 text-button text-ink space-y-2">
        <p>โหลดผังทางเดินไม่สำเร็จ{error ? `: ${error.message}` : ''}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => reload()}>
          ลองใหม่
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {notice && (
        <div role="status" className="card p-3 text-button text-ink">
          {notice}
        </div>
      )}

      {/* ── Close form ─────────────────────────────────────────────── */}
      <form ref={formRef} onSubmit={handleClose} className="card p-4 space-y-3 scroll-mt-4" aria-label="ปิดชั่วคราว">
        <h3 className="font-display text-h3-sm font-bold text-ink">
          {editing ? 'แก้ไขการปิด' : 'ปิดชั่วคราว'}
        </h3>
        {editing && (
          <p className="text-xs text-ink-2">
            กำลังแก้ไข <span className="font-bold text-ink">{editing.label}</span> · บันทึกแล้วเวลาและเหตุผลเดิมจะถูกแทนที่
          </p>
        )}

        {!editing && (
          <div className="flex w-full rounded-full bg-surface-2 p-1" role="group" aria-label="ประเภทที่จะปิด">
            {(['room', 'walkway'] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={target === t}
                onClick={() => {
                  setTarget(t)
                  setFormError(null)
                }}
                className={`btn btn-sm flex-1 ${target === t ? 'btn-primary' : 'btn-ghost'}`}
              >
                {t === 'room' ? 'ปิดห้อง' : 'ปิดทางเดิน'}
              </button>
            ))}
          </div>
        )}

        {editing ? null : target === 'room' ? (
          <div>
            <label className="label" htmlFor="closure-room">
              ห้อง
            </label>
            <RoomCombobox id="closure-room" rooms={closableRooms} value={roomCode} onChange={setRoomCode} />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2" role="group" aria-label="ชั้น">
              {[1, 2].map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={floor === f}
                  onClick={() => onFloorChange(f)}
                  className={`btn btn-sm ${floor === f ? 'btn-primary' : 'btn-secondary'}`}
                >
                  ชั้น {f}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={walkwayQuery}
              onChange={(e) => setWalkwayQuery(e.target.value)}
              placeholder="ค้นหาด้วยเลขห้องใกล้เคียง เช่น 104"
              aria-label="ค้นหาทางเดิน"
              className="input-boxed"
            />
            <p className="text-xs text-ink-3">
              เลือกแล้ว {selectedWalkways.size} ช่วง
              {/* Phones show the panel full width over the map, so the map hint is for wider screens. */}
              <span className="hidden sm:inline">
                {' '}
                · ชี้ที่รายการเพื่อดูตำแหน่งบนแผนที่ · เส้นน้ำเงิน = ที่เลือก, เส้นประ = ปิดอยู่
              </span>
            </p>
            <ul className="max-h-56 overflow-y-auto thin-scrollbar border border-line-soft divide-y divide-line-soft" aria-label="รายการทางเดิน">
              {walkwayMatches.length === 0 ? (
                <li className="p-3 text-button text-ink-3">ไม่พบทางเดินที่ตรงกับ "{walkwayQuery.trim()}"</li>
              ) : (
                walkwayMatches.map((w) => (
                  <li
                    key={w.elementId}
                    onMouseEnter={() => setPreviewWalkway(w.elementId)}
                    onMouseLeave={() => setPreviewWalkway(null)}
                    onFocus={() => setPreviewWalkway(w.elementId)}
                    onBlur={() => setPreviewWalkway(null)}
                  >
                    <label className="flex items-center gap-2 px-3 py-2 text-button text-ink cursor-pointer hover:bg-surface-2">
                      <input
                        type="checkbox"
                        checked={selectedWalkways.has(w.elementId)}
                        onChange={() => toggleWalkway(w.elementId)}
                      />
                      <span className="flex-1">{w.label}</span>
                      {w.closure.closed && <span className="chip">ปิดอยู่</span>}
                    </label>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2.5">
          <div>
            <label className="label" htmlFor="closure-from">
              เริ่มปิด
            </label>
            <input
              id="closure-from"
              type="datetime-local"
              value={fromValue}
              onChange={(e) => setFromValue(e.target.value)}
              className="input-boxed"
            />
          </div>
          <div>
            <label className="label" htmlFor="closure-until">
              เปิดอีกครั้ง
            </label>
            <input
              id="closure-until"
              type="datetime-local"
              value={untilValue}
              onChange={(e) => setUntilValue(e.target.value)}
              className="input-boxed"
            />
          </div>
          <p className="-mt-1 text-xs text-ink-3">เวลาประเทศไทย · ว่าง "เปิดอีกครั้ง" = ปิดจนกว่าจะยกเลิก</p>
          <div>
            <label className="label" htmlFor="closure-reason">
              เหตุผล
            </label>
            <input
              id="closure-reason"
              type="text"
              value={reason}
              maxLength={MAX_CLOSURE_REASON_LENGTH}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น ปรับปรุงห้อง, ซ่อมพื้น"
              className="input-boxed"
            />
          </div>
        </div>

        {formError && (
          <p role="alert" className="card border-ink p-3 text-button text-ink">
            {formError}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {editing && (
            <button type="button" onClick={resetForm} disabled={saving} className="btn btn-secondary">
              ยกเลิกการแก้ไข
            </button>
          )}
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving
              ? 'กำลังบันทึก...'
              : editing
                ? 'บันทึกการแก้ไข'
                : target === 'room'
                  ? 'บันทึกการปิดห้อง'
                  : `ปิดทางเดินที่เลือก (${selectedWalkways.size})`}
          </button>
        </div>
      </form>

      {/* ── Closed now / scheduled ─────────────────────────────────── */}
      <section className="card p-4 space-y-3" aria-label="ที่ปิดอยู่หรือกำหนดไว้">
        <h3 className="font-display text-h3-sm font-bold text-ink">ที่ปิดอยู่ / กำหนดไว้ ({closures.length})</h3>
        {listError && (
          <p role="alert" className="card border-ink p-3 text-button text-ink">
            {listError}
          </p>
        )}
        {closures.length === 0 ? (
          <p className="text-button text-ink-3">ยังไม่มีห้องหรือทางเดินที่ปิด</p>
        ) : (
          <ul className="space-y-2">
            {closures.map((c) => (
              <li key={c.elementId} className={`card p-3 ${editing?.elementId === c.elementId ? 'border-ink' : ''}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="chip">{c.kind === 'room' ? 'ห้อง' : `ทางเดิน · ชั้น ${c.floor}`}</span>
                    <span className="chip">{c.activeNow ? 'ปิดอยู่ตอนนี้' : 'กำหนดไว้'}</span>
                  </div>
                  <p className="mt-1 text-button font-bold text-ink">{c.label}</p>
                  <p className="text-xs text-ink-2">{formatWindow(c.closure)}</p>
                  {c.closure.closedReason && (
                    <p className="text-xs text-ink-2 break-words">เหตุผล: {c.closure.closedReason}</p>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={reopening === c.elementId}
                    onClick={() => startEdit(c)}
                    aria-label={`แก้ไขเวลา ${c.label}`}
                    className="btn btn-secondary btn-sm"
                  >
                    แก้ไขเวลา/เหตุผล
                  </button>
                  <button
                    type="button"
                    disabled={reopening === c.elementId}
                    onClick={() => handleReopen(c.elementId, c.label)}
                    className="btn btn-secondary btn-sm"
                  >
                    {reopening === c.elementId ? 'กำลังยกเลิก...' : 'ยกเลิกการปิด'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/**
 * The tab as mounted by /staff: loads the graph only once the tab is opened, so the rest of
 * the staff console does not pay for it.
 */
export default function ClosureTab(props: Omit<ClosurePanelProps, 'graphState'>) {
  const graphState = useGraph()
  return <ClosurePanel {...props} graphState={graphState} />
}
