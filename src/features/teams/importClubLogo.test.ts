import { expect, it } from 'vitest'
import { importClubLogo } from './importClubLogo'

it('rejects unsupported files before attempting to decode an image', async () => {
  await expect(importClubLogo(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }))).rejects.toThrow(/PNG, JPG ou WebP/)
})

it('rejects images larger than 5 MiB before decoding', async () => {
  await expect(importClubLogo(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))).rejects.toThrow(/5 Mo/)
})
