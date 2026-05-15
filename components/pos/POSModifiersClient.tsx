'use client'

import { useState } from 'react'
import { Plus, ChevronDown, ChevronRight, Edit2, Trash2, Layers } from 'lucide-react'

interface ModGroup {
  id:             string
  name:           string
  description?:   string | null
  selection_type: string
  min_required:   number
  max_allowed?:   number | null
  is_required:    boolean
  applies_to_all_products: boolean
  status:         string
  sort_order:     number
  pos_modifiers?: Modifier[]
}

interface Modifier {
  id:               string
  name:             string
  modifier_type:    string
  price_delta_cents: number
  is_default:       boolean
  status:           string
  sort_order:       number
}

interface Product {
  id:   string
  name: string
}

interface Props {
  tenantId:      string
  initialGroups: ModGroup[]
  products:      Product[]
}

const PRESET_TEMPLATES = [
  {
    name: 'Remove Ingredients',
    selection_type: 'multiple',
    min_required: 0,
    is_required: false,
    modifiers: [
      { name: 'No Onion', type: 'removal' },
      { name: 'No Tomato', type: 'removal' },
      { name: 'No Cilantro', type: 'removal' },
      { name: 'No Lettuce', type: 'removal' },
      { name: 'No Cheese', type: 'removal' },
    ],
  },
  {
    name: 'Add-ons',
    selection_type: 'multiple',
    min_required: 0,
    is_required: false,
    modifiers: [
      { name: 'Extra Cheese', type: 'addon', price: 150 },
      { name: 'Extra Meat', type: 'addon', price: 300 },
      { name: 'Add Avocado', type: 'addon', price: 200 },
      { name: 'Add Egg', type: 'addon', price: 150 },
    ],
  },
  {
    name: 'Sauces',
    selection_type: 'single',
    min_required: 0,
    is_required: false,
    modifiers: [
      { name: 'Sauce on Side', type: 'instruction' },
      { name: 'Extra Sauce', type: 'instruction' },
      { name: 'Light Sauce', type: 'instruction' },
      { name: 'No Sauce', type: 'removal' },
    ],
  },
  {
    name: 'Cooking Style',
    selection_type: 'single',
    min_required: 0,
    is_required: false,
    modifiers: [
      { name: 'Rare', type: 'preparation' },
      { name: 'Medium Rare', type: 'preparation' },
      { name: 'Medium', type: 'preparation' },
      { name: 'Well Done', type: 'preparation' },
    ],
  },
]

function formatDelta(cents: number) {
  if (cents === 0) return ''
  return `${cents > 0 ? '+' : ''}$${(cents / 100).toFixed(2)}`
}

export function POSModifiersClient({ tenantId, initialGroups, products }: Props) {
  const [groups, setGroups] = useState<ModGroup[]>(initialGroups)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupType, setNewGroupType] = useState<'single' | 'multiple'>('multiple')
  const [newGroupRequired, setNewGroupRequired] = useState(false)
  const [addingModToGroup, setAddingModToGroup] = useState<string | null>(null)
  const [newModName, setNewModName] = useState('')
  const [newModType, setNewModType] = useState('addon')
  const [newModPrice, setNewModPrice] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [installingPresets, setInstallingPresets] = useState(false)

  const toggle = (id: string) => setExpanded((p) => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s })

  const createGroup = async () => {
    if (!newGroupName.trim()) return
    setLoading('group'); setError(null)
    try {
      const res = await fetch('/api/pos/modifier-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName, selection_type: newGroupType, is_required: newGroupRequired }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setGroups((p) => [...p, { ...data.group, pos_modifiers: [] }])
      setShowNewGroup(false); setNewGroupName('')
    } catch { setError('Network error') } finally { setLoading(null) }
  }

  const createModifier = async (groupId: string) => {
    if (!newModName.trim()) return
    setLoading(`mod-${groupId}`); setError(null)
    try {
      const res = await fetch('/api/pos/modifiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modifier_group_id:  groupId,
          name:               newModName,
          modifier_type:      newModType,
          price_delta_cents:  newModPrice ? Math.round(parseFloat(newModPrice) * 100) : 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setGroups((p) => p.map((g) => g.id === groupId ? { ...g, pos_modifiers: [...(g.pos_modifiers ?? []), data.modifier] } : g))
      setAddingModToGroup(null); setNewModName(''); setNewModPrice('')
    } catch { setError('Network error') } finally { setLoading(null) }
  }

  const archiveGroup = async (groupId: string) => {
    if (!confirm('Archive this modifier group?')) return
    await fetch(`/api/pos/modifier-groups/${groupId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    setGroups((p) => p.filter((g) => g.id !== groupId))
  }

  const installPresets = async () => {
    setInstallingPresets(true); setError(null)
    try {
      for (const preset of PRESET_TEMPLATES) {
        const gRes = await fetch('/api/pos/modifier-groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:           preset.name,
            selection_type: preset.selection_type,
            is_required:    preset.is_required,
            min_required:   preset.min_required,
          }),
        })
        const gData = await gRes.json()
        if (!gRes.ok || !gData.group?.id) continue

        const newGroup: ModGroup = { ...gData.group, pos_modifiers: [] }
        for (const m of preset.modifiers) {
          const mRes = await fetch('/api/pos/modifiers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              modifier_group_id:  gData.group.id,
              name:               m.name,
              modifier_type:      m.type,
              price_delta_cents:  'price' in m ? m.price : 0,
            }),
          })
          const mData = await mRes.json()
          if (mData.modifier) newGroup.pos_modifiers!.push(mData.modifier)
        }
        setGroups((p) => [...p, newGroup])
      }
    } catch { setError('Failed to install presets') } finally { setInstallingPresets(false) }
  }

  const activeGroups = groups.filter((g) => g.status !== 'archived')

  return (
    <div className="min-h-screen bg-zinc-950 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Modifiers</h1>
            <p className="text-sm text-zinc-400 mt-1">{activeGroups.length} modifier groups</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={installPresets}
              disabled={installingPresets}
              className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-xl text-sm hover:border-violet-500 transition-colors disabled:opacity-50"
            >
              <Layers className="w-4 h-4" />
              {installingPresets ? 'Installing…' : 'Install Presets'}
            </button>
            <button
              onClick={() => setShowNewGroup(!showNewGroup)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> New Group
            </button>
          </div>
        </div>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>}

        {showNewGroup && (
          <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3">
            <h3 className="text-sm font-semibold text-zinc-200">New Modifier Group</h3>
            <input type="text" placeholder="Group name (e.g. Toppings, Sauces…)" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500" />
            <div className="flex gap-3 text-sm text-zinc-400">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="stype" value="multiple" checked={newGroupType === 'multiple'} onChange={() => setNewGroupType('multiple')} className="accent-violet-500" />
                Multiple select
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="stype" value="single" checked={newGroupType === 'single'} onChange={() => setNewGroupType('single')} className="accent-violet-500" />
                Single select
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={newGroupRequired} onChange={(e) => setNewGroupRequired(e.target.checked)} className="accent-violet-500" />
                Required
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowNewGroup(false)} className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-lg text-sm">Cancel</button>
              <button onClick={createGroup} disabled={loading === 'group' || !newGroupName.trim()}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50">
                {loading === 'group' ? 'Creating…' : 'Create Group'}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {activeGroups.map((group) => {
            const isOpen = expanded.has(group.id)
            const mods = (group.pos_modifiers ?? []).filter((m) => m.status !== 'archived')

            return (
              <div key={group.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-800 transition-colors"
                  onClick={() => toggle(group.id)}
                >
                  <div className="flex items-center gap-3">
                    {isOpen ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-zinc-100">{group.name}</p>
                        {group.is_required && <span className="text-xs bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full">Required</span>}
                        <span className="text-xs text-zinc-500">{group.selection_type}</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{mods.length} modifiers</p>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); archiveGroup(group.id) }}
                    className="p-2 text-zinc-600 hover:text-red-400 transition-colors rounded-lg hover:bg-zinc-700">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-zinc-800 p-4 space-y-2">
                    {mods.map((mod) => (
                      <div key={mod.id} className="flex items-center justify-between px-3 py-2 bg-zinc-800 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full flex-none ${
                            mod.modifier_type === 'removal' ? 'bg-red-400' :
                            mod.modifier_type === 'instruction' ? 'bg-blue-400' :
                            mod.modifier_type === 'preparation' ? 'bg-orange-400' : 'bg-green-400'
                          }`} />
                          <p className="text-sm text-zinc-200">{mod.name}</p>
                          <span className="text-xs text-zinc-500 capitalize">{mod.modifier_type}</span>
                        </div>
                        <span className="text-sm text-violet-400">{formatDelta(mod.price_delta_cents)}</span>
                      </div>
                    ))}

                    {addingModToGroup === group.id ? (
                      <div className="flex flex-col gap-2 pt-2">
                        <div className="flex gap-2">
                          <input type="text" placeholder="Modifier name" value={newModName} onChange={(e) => setNewModName(e.target.value)}
                            className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500" />
                          <select value={newModType} onChange={(e) => setNewModType(e.target.value)}
                            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100">
                            <option value="addon">Add-on</option>
                            <option value="removal">Removal</option>
                            <option value="substitution">Substitution</option>
                            <option value="instruction">Instruction</option>
                            <option value="preparation">Preparation</option>
                          </select>
                          <input type="number" placeholder="+/- price" value={newModPrice} onChange={(e) => setNewModPrice(e.target.value)}
                            className="w-24 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setAddingModToGroup(null); setNewModName(''); setNewModPrice('') }}
                            className="px-3 py-2 bg-zinc-700 text-zinc-400 rounded-lg text-sm">Cancel</button>
                          <button onClick={() => createModifier(group.id)} disabled={loading === `mod-${group.id}` || !newModName.trim()}
                            className="px-3 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50">
                            {loading === `mod-${group.id}` ? 'Adding…' : 'Add'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setAddingModToGroup(group.id); setNewModName(''); setNewModPrice('') }}
                        className="flex items-center gap-2 text-sm text-zinc-500 hover:text-violet-400 transition-colors pt-1">
                        <Plus className="w-3 h-3" /> Add modifier
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {activeGroups.length === 0 && (
            <div className="text-center py-16 text-zinc-600">
              <Layers className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No modifier groups yet.</p>
              <p className="text-sm mt-1">Create a group or install restaurant presets above.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
