import { useState } from 'react'
import type { Club } from './types'
import { ClubBadge } from './ClubBadge'
import { CLUB_PALETTES, SAMPLE_CRESTS, getClubIdentity, identityStyle, isHexColor, type ClubIdentity } from './clubIdentity'
import { importClubLogo } from './importClubLogo'

export function ClubIdentityEditor({ club, onSave }: { club: Club; onSave: (identity: ClubIdentity) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ClubIdentity>(() => getClubIdentity(club))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const valid = isHexColor(draft.primaryColor) && isHexColor(draft.secondaryColor)
  const preview = getClubIdentity({ id: club.id, identity: draft })

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true); setError(''); setSuccess(false)
    try {
      await onSave({ ...draft, primaryColor: draft.primaryColor.toLowerCase(), secondaryColor: draft.secondaryColor.toLowerCase() })
      setOpen(false); setSuccess(true)
    } catch (err) { setError(err instanceof Error ? err.message : 'Impossible d’enregistrer l’identité du club.') }
    finally { setBusy(false) }
  }

  return <div className="club-identity-control">
    <button type="button" className="club-identity-button" aria-expanded={open} aria-controls={`club-identity-${club.id}`}
      disabled={busy} onClick={() => {
        if (!open) { setDraft(getClubIdentity(club)); setError(''); setSuccess(false) }
        setOpen(!open)
      }}>Personnaliser le club</button>
    {success && <span role="status" className="club-identity-success">Identité enregistrée</span>}
    {open && <form id={`club-identity-${club.id}`} className="club-identity-editor" onSubmit={save}>
      <div className="club-identity-editor-heading"><h3>Identité du club</h3><p>Logo et couleurs, visibles sur les fiches et les listes.</p></div>
      <fieldset disabled={busy}>
        <legend>Logo du club</legend>
        <label className="club-logo-upload">Importer un logo
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async event => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            setBusy(true); setError('')
            try { const logo = await importClubLogo(file); setDraft(current => ({ ...current, logo })) }
            catch (err) { setError(err instanceof Error ? err.message : 'Import impossible.') }
            finally { setBusy(false) }
          }} />
        </label>
        <p className="club-identity-help">PNG, JPG ou WebP · 5 Mo maximum. L’image est ajustée automatiquement, avec sa transparence.</p>
        <div className="club-crest-options">
          {SAMPLE_CRESTS.map(sample => <button type="button" key={sample.name} aria-label={`Écusson ${sample.name}`}
            aria-pressed={draft.logo === sample.logo} onClick={() => setDraft({ ...draft, logo: sample.logo })}>
            <img src={sample.logo} alt="" />{sample.name}
          </button>)}
          {draft.logo && <button type="button" onClick={() => { const { logo: _logo, ...colors } = draft; setDraft(colors) }}>Retirer le logo</button>}
        </div>
        <small className="club-identity-help">Écussons fictifs pour essayer la personnalisation.</small>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Couleurs du club</legend>
        <div className="club-color-fields">
          {(['primaryColor', 'secondaryColor'] as const).map((key, index) => {
            const label = index === 0 ? 'principale' : 'secondaire'
            return <div className="club-color-field" key={key}>
              <label htmlFor={`club-${key}`}>Couleur {label}</label>
              <div><input type="color" id={`club-${key}`} value={preview[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />
                <input aria-label={`Code couleur ${label}`} type="text" maxLength={7} value={draft[key]}
                  spellCheck={false} aria-invalid={!isHexColor(draft[key])} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></div>
            </div>
          })}
        </div>
        <div className="club-palette-options">{CLUB_PALETTES.map(palette => <button key={palette.name} type="button"
          onClick={() => setDraft({ ...draft, primaryColor: palette.primaryColor, secondaryColor: palette.secondaryColor })}>
          <span style={{ background: palette.primaryColor }} /><span style={{ background: palette.secondaryColor }} />{palette.name}
        </button>)}</div>
        {!valid && <p className="club-identity-help">Entrez un code de la forme #123ABC pour chaque couleur.</p>}
      </fieldset>
      <div className="club-identity-preview club-identity-hero" style={identityStyle(preview)}>
        <ClubBadge club={{ ...club, identity: preview }} size="lg" decorative={false} />
        <div><small>Aperçu</small><strong>{club.name}</strong><span>Le contraste du texte s’adapte automatiquement.</span></div>
      </div>
      {error && <p role="alert" className="club-identity-error">{error}</p>}
      <div className="club-identity-actions">
        <button type="submit" disabled={busy || !valid}>{busy ? 'Préparation…' : 'Enregistrer l’identité'}</button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)}>Annuler</button>
        <button type="button" disabled={busy} onClick={() => setDraft(getClubIdentity({ id: club.id }))}>Identité par défaut</button>
      </div>
    </form>}
  </div>
}
