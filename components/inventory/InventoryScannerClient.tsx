'use client'

// components/inventory/InventoryScannerClient.tsx
// Barcode scanner with camera support (via @zxing/browser) and manual fallback.
// Falls back gracefully to manual entry if camera is unavailable.

import { useState, useEffect, useRef, useCallback } from 'react'
import { Scan, Keyboard, Camera, CheckCircle, AlertTriangle, RefreshCw, X } from 'lucide-react'
import type { ScanAction, InventoryItem, ScanResult } from '@/lib/inventory/types'

interface Props {
  tenantId:           string
  defaultBarcodeMode: string
}

interface ScanHistoryEntry {
  barcode:   string
  action:    ScanAction
  message:   string
  ok:        boolean
  timestamp: string
  item_name: string | null
}

const ACTIONS: { value: ScanAction; label: string }[] = [
  { value: 'lookup',  label: 'Lookup' },
  { value: 'restock', label: 'Restock' },
  { value: 'consume', label: 'Consume' },
  { value: 'count',   label: 'Set Count' },
  { value: 'create_item', label: 'Create Item' },
  { value: 'link_item',   label: 'Link to Item' },
]

export function InventoryScannerClient({ tenantId, defaultBarcodeMode }: Props) {
  const [mode, setMode]           = useState<'camera' | 'manual'>(
    defaultBarcodeMode === 'manual' ? 'manual' : 'camera'
  )
  const [barcode, setBarcode]     = useState('')
  const [action, setAction]       = useState<ScanAction>('lookup')
  const [quantity, setQuantity]   = useState(1)
  const [scanning, setScanning]   = useState(false)
  const [result, setResult]       = useState<ScanResult | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [history, setHistory]     = useState<ScanHistoryEntry[]>([])
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError]   = useState<string | null>(null)
  const videoRef  = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<unknown>(null)

  // Load ZXing dynamically to avoid SSR issues
  async function startCamera() {
    setCameraError(null)
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader

      const devices = await BrowserMultiFormatReader.listVideoInputDevices()
      if (devices.length === 0) {
        setCameraError('No camera found on this device')
        setMode('manual')
        return
      }

      if (!videoRef.current) return

      setCameraActive(true)
      await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result) {
          const text = result.getText()
          setBarcode(text)
          void handleScan(text)
          void stopCamera()
        }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera unavailable'
      setCameraError(`Camera error: ${msg}`)
      setMode('manual')
    }
  }

  async function stopCamera() {
    setCameraActive(false)
    if (readerRef.current) {
      try {
        const r = readerRef.current as { reset?: () => void }
        r.reset?.()
      } catch { /* ignore */ }
      readerRef.current = null
    }
  }

  useEffect(() => {
    return () => { void stopCamera() }
  }, [])

  const handleScan = useCallback(async (barcodeOverride?: string) => {
    const code = (barcodeOverride ?? barcode).trim()
    if (!code) { setError('Please enter or scan a barcode'); return }

    setScanning(true)
    setError(null)
    setResult(null)

    try {
      const res  = await fetch('/api/inventory/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: code, action, quantity }),
      })
      const data: ScanResult = await res.json()
      setResult(data)
      setHistory((prev) => [{
        barcode:   code,
        action,
        message:   data.message,
        ok:        data.ok,
        timestamp: new Date().toLocaleTimeString(),
        item_name: data.item?.name ?? null,
      }, ...prev.slice(0, 9)])
      if (data.ok) setBarcode('')
    } catch {
      setError('Scan failed — check connection')
    } finally {
      setScanning(false)
    }
  }, [barcode, action, quantity])

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Scan className="w-6 h-6 text-teal-400" />
          Barcode Scanner
        </h1>
        <p className="text-sm text-zinc-400 mt-1">Scan or manually enter barcodes to manage inventory</p>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-xl border border-surface-border bg-graphite-800/50 p-1 gap-1">
        <button
          onClick={() => { setMode('camera'); void startCamera() }}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'camera' ? 'bg-teal-500 text-white' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Camera className="w-4 h-4" /> Camera
        </button>
        <button
          onClick={() => { setMode('manual'); void stopCamera() }}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'manual' ? 'bg-teal-500 text-white' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Keyboard className="w-4 h-4" /> Manual
        </button>
      </div>

      {/* Camera view */}
      {mode === 'camera' && (
        <div className="rounded-2xl border border-surface-border bg-graphite-800/50 overflow-hidden">
          {cameraError ? (
            <div className="p-6 text-center">
              <AlertTriangle className="w-8 h-8 text-orange-400 mx-auto mb-2" />
              <p className="text-sm text-orange-400">{cameraError}</p>
              <button
                onClick={() => setMode('manual')}
                className="mt-3 text-xs text-teal-400 underline"
              >
                Switch to manual entry
              </button>
            </div>
          ) : (
            <div className="relative">
              <video
                ref={videoRef}
                className="w-full aspect-video object-cover"
                playsInline
                muted
              />
              {!cameraActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-graphite-900/80">
                  <button
                    onClick={() => void startCamera()}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-teal-500 text-white font-medium"
                  >
                    <Camera className="w-5 h-5" /> Start Camera
                  </button>
                </div>
              )}
              {cameraActive && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-32 border-2 border-teal-400 rounded-lg opacity-70" />
                </div>
              )}
              {cameraActive && (
                <button
                  onClick={() => void stopCamera()}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Manual barcode input */}
      <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-5 space-y-4">
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Barcode / SKU</label>
          <div className="flex gap-2">
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleScan() }}
              placeholder="Scan or type barcode..."
              autoFocus={mode === 'manual'}
              className="flex-1 rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2.5 text-sm outline-none focus:border-teal-400/50 font-mono"
            />
            {barcode && (
              <button onClick={() => setBarcode('')} className="px-3 text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Action</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as ScanAction)}
              className="w-full rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none"
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Quantity</label>
            <input
              type="number"
              min={0}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(parseFloat(e.target.value) || 1)}
              className="w-full rounded-xl border border-surface-border bg-graphite-800 text-white px-3 py-2 text-sm outline-none"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={() => void handleScan()}
          disabled={scanning || !barcode.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-medium transition-colors disabled:opacity-50"
        >
          {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Scan className="w-4 h-4" />}
          {scanning ? 'Processing...' : 'Submit'}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className={`rounded-2xl border p-4 ${
          result.ok
            ? 'border-green-400/30 bg-green-400/10'
            : 'border-red-400/30 bg-red-400/10'
        }`}>
          <div className="flex items-start gap-3">
            {result.ok
              ? <CheckCircle className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
              : <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            }
            <div>
              <p className={`text-sm font-medium ${result.ok ? 'text-green-300' : 'text-red-300'}`}>
                {result.message}
              </p>
              {result.item && (
                <div className="mt-2 text-xs text-zinc-300 space-y-1">
                  <p><span className="text-zinc-400">Item:</span> {result.item.name}</p>
                  <p><span className="text-zinc-400">Type:</span> {result.item.item_type}</p>
                  <p><span className="text-zinc-400">Qty:</span> {result.item.current_quantity} {result.item.unit}</p>
                  {result.item.reorder_point > 0 && result.item.current_quantity <= result.item.reorder_point && (
                    <p className="text-orange-400 font-medium">⚠ Below reorder point ({result.item.reorder_point} {result.item.unit})</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scan History */}
      {history.length > 0 && (
        <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Scan History</h2>
          <div className="space-y-2">
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-surface-border/30 last:border-0">
                {h.ok
                  ? <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  : <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                }
                <span className="font-mono text-xs text-zinc-400 w-28 shrink-0">{h.barcode}</span>
                <span className="text-xs text-zinc-300 flex-1 truncate">{h.item_name ?? h.message}</span>
                <span className="text-xs text-zinc-500 shrink-0">{h.timestamp}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
