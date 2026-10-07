/**
 * Note effective selon l'âge : croissance jusqu'au pic, deux saisons d'apogée,
 * puis déclin avec un socle de 40 % de la note maximale.
 * Courbe partagée par la progression annuelle et les perspectives du mercato.
 */
export function computeStatAtAge(peakStat: number, age: number, peakAge: number): number {
  if (age === peakAge || age === peakAge + 1) {
    return peakStat
  }

  if (age < peakAge) {
    const startRatio = 0.62
    const minAge = 16
    const t = Math.max(0, Math.min(1, (age - minAge) / Math.max(1, peakAge - minAge)))
    const progressCurve = t * (2 - t)
    const ratio = startRatio + (1 - startRatio) * progressCurve
    return Math.min(peakStat, Math.max(1, Math.round(peakStat * ratio)))
  }

  const delta = age - (peakAge + 1)
  const declineRate = 0.032 * delta + 0.007 * delta * delta
  const ratio = Math.max(0.40, 1 - declineRate)
  return Math.min(peakStat, Math.max(2, Math.round(peakStat * ratio)))
}
