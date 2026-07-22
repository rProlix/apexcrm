import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TransitBlueprintOutline } from '@/components/van-damage/FordTransit2019DamageMap'
import {
  DEFAULT_TRANSIT_CONFIGURATION,
  TRANSIT_VIEW_ORDER,
  getTransitViewRegions,
} from '../transit-blueprint'
import { createTransitGeometry } from '../transit-geometry'

// The repository preserves JSX for Next's compiler; expose React for this direct Node renderer.
Object.assign(globalThis, { React })

test('every production outline and its interactive regions render from the same geometry', () => {
  const configuration = DEFAULT_TRANSIT_CONFIGURATION
  const geometry = createTransitGeometry(configuration)
  const regions = getTransitViewRegions(configuration)

  for (const view of TRANSIT_VIEW_ORDER) {
    const markup = renderToStaticMarkup(
      React.createElement(
        'svg',
        { viewBox: '0 0 800 400' },
        React.createElement(TransitBlueprintOutline, {
          view,
          glassId: 'test-glass',
          configuration,
          geometry,
        }),
        ...regions[view].map((region) =>
          React.createElement('path', {
            key: region.id,
            d: region.path,
            'data-region-id': region.id,
          })
        )
      )
    )

    assert.match(markup, /viewBox="0 0 800 400"/)
    assert.ok(markup.includes(`data-region-id="${regions[view][0].id}"`))
    assert.ok(!markup.includes('NaN'))
    assert.ok(!markup.includes('undefined'))
  }
})

test('cargo and passenger side renderings remain visibly different', () => {
  const cargo = DEFAULT_TRANSIT_CONFIGURATION
  const passenger = { ...cargo, cargoConfiguration: 'passenger' as const }
  const cargoMarkup = renderToStaticMarkup(
    React.createElement(TransitBlueprintOutline, {
      view: 'passenger',
      glassId: 'cargo-glass',
      configuration: cargo,
      geometry: createTransitGeometry(cargo),
    })
  )
  const passengerMarkup = renderToStaticMarkup(
    React.createElement(TransitBlueprintOutline, {
      view: 'passenger',
      glassId: 'passenger-glass',
      configuration: passenger,
      geometry: createTransitGeometry(passenger),
    })
  )
  assert.notEqual(cargoMarkup, passengerMarkup)
  assert.ok(passengerMarkup.includes('passenger-glass'))
})
