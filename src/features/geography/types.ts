export type Commune = Readonly<{
  id: string
  name: string
  population: number
  departmentId: string
  regionId: string
  zoneId: string
  conferenceId: string
  coordinates?: readonly [number, number]
}>

export type GeographyDataset = Readonly<{
  version: string
  sourceLabel: string
  sourceUrl: string
  communes: readonly Commune[]
}>
