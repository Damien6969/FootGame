/**
 * Configuration globale de la Coupe des communes.
 * 
 * Vous pouvez modifier directement les valeurs de ce fichier pour configurer
 * les paramètres initiaux par défaut du tournoi.
 */
export const CUP_CONFIG = {
  /**
   * Seed globale par défaut utilisée pour le tirage au sort et les simulations
   * de la première saison lors d'une nouvelle partie ou d'un reset.
   */
  defaultSeed: 'tournoi-2026' as string,

  /**
   * Année de démarrage par défaut de la simulation.
   */
  defaultStartYear: 2026 as number,

  /**
   * Nombre maximum de fusions autorisées lors de chaque transition d'intersaison.
   */
  maxFusionsPerSeason: 30 as number,
  /** Probabilité annuelle de sécession pour chaque commune éligible. */
  secessionProbability: 0.12 as number,
}
