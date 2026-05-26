import { describe, expect, it } from 'vitest'
import {
  formatContainerTitle,
  getChestGridClass,
  getChestWindowClass
} from '../src/renderer/src/components/ChestGrid/minecraftChestUtils'

describe('minecraftChestUtils', () => {
  it('formats known container titles', () => {
    expect(formatContainerTitle('minecraft:chest')).toBe('Chest')
    expect(formatContainerTitle('minecraft:barrel')).toBe('Barrel')
  })

  it('formats unknown container ids', () => {
    expect(formatContainerTitle('minecraft:custom_container')).toBe('Custom Container')
  })

  it('selects hopper grid layout', () => {
    expect(getChestGridClass('minecraft:hopper', 5)).toContain('mc-chest-grid--hopper')
    expect(getChestWindowClass('minecraft:hopper', 5)).toContain('mc-chest-window--compact')
  })
})
