import { describe, expect, it } from 'vitest'
import {
  departmentLabel,
  regionLabel,
  getRegionName,
  getRegionIdForDepartment,
  getRegionNameForDepartment,
} from './territoryLabels'

describe('territory labels', () => {
  it('renders official department names with their code', () => {
    expect(departmentLabel('01')).toBe('Ain (01)')
    expect(departmentLabel('2A')).toBe('Corse-du-Sud (2A)')
    expect(departmentLabel('974')).toBe('La Réunion (974)')
  })

  it('renders region names with their code', () => {
    expect(regionLabel('84')).toBe('Auvergne-Rhône-Alpes (84)')
    expect(regionLabel('04')).toBe('La Réunion (04)')
  })

  it('maps departments to regions correctly', () => {
    expect(getRegionName('11')).toBe('Île-de-France')
    expect(getRegionIdForDepartment('75')).toBe('11')
    expect(getRegionNameForDepartment('75')).toBe('Île-de-France')
    expect(getRegionNameForDepartment('33')).toBe('Nouvelle-Aquitaine')
    expect(getRegionNameForDepartment('29')).toBe('Bretagne')
    expect(getRegionNameForDepartment('69')).toBe('Auvergne-Rhône-Alpes')
  })
})
