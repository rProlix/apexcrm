'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DraggableWidgetProps {
  id:         string
  children:   React.ReactNode
  onRemove?:  () => void
  editMode:   boolean
}

export function DraggableWidget({ id, children, onRemove, editMode }: DraggableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity:    isDragging ? 0.4 : 1,
    zIndex:     isDragging ? 50 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className="relative group/drag">
      {editMode && (
        <>
          {/* Drag handle */}
          <button
            {...listeners}
            {...attributes}
            className={cn(
              'absolute top-2 left-2 z-10 h-6 w-6 rounded-lg',
              'flex items-center justify-center',
              'bg-graphite-700 border border-white/10',
              'text-white/30 hover:text-gold-400 hover:border-gold-500/30',
              'cursor-grab active:cursor-grabbing transition-colors duration-150',
              'opacity-0 group-hover/drag:opacity-100'
            )}
          >
            <GripVertical className="h-3.5 w-3.5" strokeWidth={2} />
          </button>

          {/* Remove button */}
          {onRemove && (
            <button
              onClick={onRemove}
              className={cn(
                'absolute top-2 right-2 z-10 h-6 w-6 rounded-lg',
                'flex items-center justify-center',
                'bg-red-500/10 border border-red-500/20',
                'text-red-400 hover:bg-red-500/20',
                'transition-colors duration-150',
                'opacity-0 group-hover/drag:opacity-100'
              )}
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          )}

          {/* Edit mode overlay border */}
          <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-white/10 pointer-events-none" />
        </>
      )}
      {children}
    </div>
  )
}
