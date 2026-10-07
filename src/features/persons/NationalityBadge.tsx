import { PERSON_IDENTITY_CONFIG } from '../../config/personIdentity'
import type { Person } from './types'
import './nationality.css'

const countries = new Intl.DisplayNames(['fr'], { type: 'region' })
const flags = new Set(Object.keys(PERSON_IDENTITY_CONFIG.familyCountryWeights))

function countryLabel(code: string): string {
  return /^[A-Z]{2}$/.test(code) ? countries.of(code) ?? code : code
}

export function NationalityBadge({ person, compact = false }: {
  person: Pick<Person, 'nationality' | 'secondNationality'>
  compact?: boolean
}) {
  const codes = [...new Set([person.nationality, person.secondNationality].filter((code): code is string => Boolean(code)))]
  const label = `${codes.length > 1 ? 'Nationalités' : 'Nationalité'} : ${codes.map(countryLabel).join(' et ')}`
  return <span className={`nationality-badge${compact ? ' nationality-badge--compact' : ''}`} role="img" aria-label={label} title={label}>
    {codes.map(code => <span className="nationality-badge__country" key={code} aria-hidden="true">
      {flags.has(code) && <img src={`${import.meta.env.BASE_URL}flags/${code.toLowerCase()}.svg`} alt="" width="20" height="15" />}
      {(!compact || !flags.has(code)) && <span>{code}</span>}
    </span>)}
  </span>
}
