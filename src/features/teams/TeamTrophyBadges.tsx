import { useOptionalCupApp } from '../../app/CupAppContext'

type Props = {
  teamId: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  showLabels?: boolean
}

export function TeamTrophyBadges({ teamId, size = 'sm', showLabels = false }: Props) {
  const appContext = useOptionalCupApp()
  const record = appContext?.teamRecords?.get(teamId)

  if (
    !record ||
    (record.nationalTitles === 0 &&
      record.conferenceTitles === 0 &&
      record.regionTitles === 0 &&
      record.departmentTitles === 0)
  ) {
    return null
  }

  return (
    <span
      className={`team-trophy-badges-wrap size-${size}`}
      onClick={(e) => e.stopPropagation()}
    >
      {record.nationalTitles > 0 && (
        <span className={`trophy-pill trophy-pill--national trophy-pill--${size}`} title={`${record.nationalTitles} titre(s) de champion de France`} aria-label={`${record.nationalTitles} titre(s) de champion de France`}>
          <span className="trophy-emoji">🏆</span>
          <span className="trophy-count">{record.nationalTitles}</span>
          {showLabels && <span className="trophy-text">Champion</span>}
        </span>
      )}
      {record.conferenceTitles > 0 && (
        <span className={`trophy-pill trophy-pill--conference trophy-pill--${size}`} title={`${record.conferenceTitles} titre(s) de conférence`} aria-label={`${record.conferenceTitles} titre(s) de conférence`}>
          <span className="trophy-emoji">👑</span>
          <span className="trophy-count">{record.conferenceTitles}</span>
          {showLabels && <span className="trophy-text">Conférence</span>}
        </span>
      )}
      {record.regionTitles > 0 && (
        <span className={`trophy-pill trophy-pill--region trophy-pill--${size}`} title={`${record.regionTitles} titre(s) régional/régionaux`} aria-label={`${record.regionTitles} titre(s) régional/régionaux`}>
          <span className="trophy-emoji">🌟</span>
          <span className="trophy-count">{record.regionTitles}</span>
          {showLabels && <span className="trophy-text">Région</span>}
        </span>
      )}
      {record.departmentTitles > 0 && (
        <span className={`trophy-pill trophy-pill--dept trophy-pill--${size}`} title={`${record.departmentTitles} titre(s) départemental/départementaux`} aria-label={`${record.departmentTitles} titre(s) départemental/départementaux`}>
          <span className="trophy-emoji">🏅</span>
          <span className="trophy-count">{record.departmentTitles}</span>
          {showLabels && <span className="trophy-text">Département</span>}
        </span>
      )}
    </span>
  )
}
