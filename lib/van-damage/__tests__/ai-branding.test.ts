import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const customerSources = [
  '../../../components/van-damage/InspectionExperience.tsx',
  '../../../components/van-damage/SlackSettingsClient.tsx',
  '../../../components/website-ai/PasteDetailsPanel.tsx',
  '../../../components/website-ai/AiAutofillClient.tsx',
  '../../../components/website/builder/AiImagesPanel.tsx',
  '../../../app/(dashboard)/dashboard/damage-ai/page.tsx',
  '../../../app/(dashboard)/website/ai-premium-design/page.tsx',
]

test('customer-facing AI copy does not expose provider branding', async () => {
  const combined = (await Promise.all(
    customerSources.map((path) => readFile(new URL(path, import.meta.url), 'utf8'))
  )).join('\n')
  const provider = ['Gem', 'ini'].join('')
  const imageModel = ['Ima', 'gen'].join('')
  for (const phrase of [
    `${provider} AI`,
    `Powered by ${provider}`,
    `${provider} damage`,
    `${provider}-analyzed`,
    `${provider} / ${imageModel}`,
    `${imageModel} 4 Ultra`,
  ]) {
    assert.equal(combined.toLocaleLowerCase().includes(phrase.toLocaleLowerCase()), false, phrase)
  }
})
