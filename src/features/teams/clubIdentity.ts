import type { CSSProperties } from 'react'
import type { Club } from './types'

export type ClubIdentity = Readonly<{ primaryColor: string; secondaryColor: string; logo?: string }>
export const CLUB_PALETTES = [
  { name: 'Bleu & or', primaryColor: '#1d4ed8', secondaryColor: '#fbbf24' },
  { name: 'Bordeaux & ivoire', primaryColor: '#9f1239', secondaryColor: '#fff1d6' },
  { name: 'Vert & blanc', primaryColor: '#047857', secondaryColor: '#f1f5f9' },
  { name: 'Violet & lilas', primaryColor: '#6d28d9', secondaryColor: '#ddd6fe' },
  { name: 'Marine & cuivre', primaryColor: '#164e63', secondaryColor: '#fb923c' },
  { name: 'Rouge & marine', primaryColor: '#dc2626', secondaryColor: '#172554' },
] as const
export const SAMPLE_CRESTS = [
  { name: 'Étoile', logo: '/club-logos/etoile.svg' },
  { name: 'Montagne', logo: '/club-logos/montagne.svg' },
  { name: 'Vagues', logo: '/club-logos/vagues.svg' },
] as const

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}
export function isClubLogo(value: unknown): value is string {
  return typeof value === 'string' && (SAMPLE_CRESTS.some(s => s.logo === value) ||
    (value.length <= 400_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)))
}
export function isClubIdentity(value: unknown): value is ClubIdentity {
  if (!value || typeof value !== 'object') return false
  const identity = value as ClubIdentity
  return isHexColor(identity.primaryColor) && isHexColor(identity.secondaryColor) &&
    (identity.logo === undefined || isClubLogo(identity.logo))
}
export function getClubIdentity(club: Pick<Club, 'id'> & { identity?: ClubIdentity }): ClubIdentity {
  if (isClubIdentity(club.identity)) return club.identity
  let hash = 0
  for (const char of club.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const { primaryColor, secondaryColor } = CLUB_PALETTES[hash % CLUB_PALETTES.length]
  return { primaryColor, secondaryColor }
}
function channels(color: string): number[] {
  return [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16))
}
function luminance(color: string): number {
  const rgb = channels(color).map(c => {
    const v = c / 255
    return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4
  })
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
}
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05)
}
function mix(a: string, b: string, amount: number): string {
  const other = channels(b)
  return '#' + channels(a).map((c, i) => Math.round(c * (1 - amount) + other[i] * amount).toString(16).padStart(2, '0')).join('')
}
function onColor(color: string): string {
  return contrastRatio(color, '#ffffff') >= contrastRatio(color, '#000000') ? '#ffffff' : '#000000'
}
export function identityStyle(identity: ClubIdentity): CSSProperties & Record<`--club-${string}`, string> {
  const { primaryColor, secondaryColor } = identity
  const surface = mix('#131d33', primaryColor, .08)
  let accent = primaryColor
  for (let step = 1; contrastRatio(accent, surface) < 4.5 && step <= 20; step++) {
    accent = mix(primaryColor, '#ffffff', step / 20)
  }
  return {
    '--club-primary': primaryColor, '--club-secondary': secondaryColor,
    '--club-on-primary': onColor(primaryColor), '--club-on-secondary': onColor(secondaryColor),
    '--club-accent': accent, '--club-surface': surface,
  }
}
