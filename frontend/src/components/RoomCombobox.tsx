/**
 * RoomCombobox — one field that is both a dropdown and a search box (#153).
 *
 * Click (or ArrowDown) opens the list of rooms; typing narrows it to rooms that match
 * by room code (LC3-105), room number (105) or Thai name, closest match first.
 * Enter picks the highlighted room (the closest one by default), click picks any; Escape or
 * leaving the field closes the list and keeps the last picked room.
 * Follows the WAI-ARIA combobox pattern so screen readers and tests can use
 * role="combobox" / "listbox" / "option".
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import type { Room } from '../types/room'
import { roomOptionLabel, searchRooms } from '../services/roomSearch'

interface RoomComboboxProps {
  id: string
  rooms: Room[]
  /** room_code of the picked room. */
  value: string
  onChange: (roomCode: string) => void
  /** room_code shown with "(ห้องปัจจุบัน)". */
  currentRoomCode?: string
}

export default function RoomCombobox({ id, rooms, value, onChange, currentRoomCode }: RoomComboboxProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  // null = not typing: the field shows the picked room instead of the query.
  const [query, setQuery] = useState<string | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)

  const selected = rooms.find((r) => r.code === value)
  const matches = useMemo(
    () => (query ? searchRooms(rooms, query) : rooms),
    [rooms, query],
  )

  function openList() {
    const selectedIdx = query ? 0 : Math.max(0, rooms.findIndex((r) => r.code === value))
    setActiveIdx(selectedIdx)
    setOpen(true)
  }

  function close() {
    setOpen(false)
    setQuery(null)
  }

  function pick(room: Room) {
    onChange(room.code)
    close()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) openList()
      else setActiveIdx((i) => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && matches[activeIdx]) {
        e.preventDefault()
        pick(matches[activeIdx])
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        close()
      }
    }
  }

  // Keep the highlighted room visible when moving through a long list with the arrow keys.
  useEffect(() => {
    if (!open) return
    document.getElementById(`${listId}-opt-${activeIdx}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, activeIdx, listId])

  const selectedLabel = selected ? roomOptionLabel(selected) : value
  // While the list is open the field is a search box (empty, picked room as placeholder),
  // so typing starts a new search instead of appending to the room name.
  const displayValue = open ? (query ?? '') : selectedLabel
  const activeId = open && matches[activeIdx] ? `${listId}-opt-${activeIdx}` : undefined

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        value={displayValue}
        placeholder={open ? selectedLabel : 'พิมพ์เลขห้องหรือชื่อห้อง เช่น 105'}
        onClick={() => {
          if (!open) openList()
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setActiveIdx(0)
          setOpen(true)
        }}
        onKeyDown={handleKeyDown}
        onBlur={close}
        className="input-boxed pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? 'ปิดรายการห้อง' : 'เปิดรายการห้อง'}
        // Keep focus in the input so onBlur does not close the list first.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (open) close()
          else {
            inputRef.current?.focus()
            openList()
          }
        }}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-3"
      >
        <CaretDown size={14} weight="bold" className={open ? 'rotate-180' : ''} />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="รายการห้อง"
          className="dropdown absolute left-0 right-0 mt-1 max-h-64 overflow-y-auto py-1"
        >
          {matches.length === 0 ? (
            <li className="px-3.5 py-2.5 text-button text-ink-3">
              ไม่พบห้องที่ตรงกับ "{query?.trim()}"
            </li>
          ) : (
            matches.map((room, idx) => (
              <li
                key={room.id}
                id={`${listId}-opt-${idx}`}
                role="option"
                aria-selected={room.code === value}
                // Pick on mousedown so the input's blur cannot close the list first.
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(room)
                }}
                onMouseEnter={() => setActiveIdx(idx)}
                className={`cursor-pointer px-3.5 py-2 text-button text-ink ${
                  idx === activeIdx ? 'bg-surface-2' : ''
                } ${room.code === value ? 'font-bold' : ''}`}
              >
                {roomOptionLabel(room)}
                {room.code === currentRoomCode && <span className="text-ink-3"> (ห้องปัจจุบัน)</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
