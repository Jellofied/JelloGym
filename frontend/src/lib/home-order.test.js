import { describe, it, expect } from 'vitest'
import { HOME_CARD_IDS, homeCardVisible, homeCardsVisible, orderHomeCards } from './home-order.js'

const base = { } // a profile that never chose anything: defaults from lib/modules.js

describe('homeCardVisible', () => {
  it('hides the life cards until the profile asks, and shows the core ones before it ever chose', () => {
    expect(homeCardVisible(base, 'water')).toBe(false)
    expect(homeCardVisible(base, 'habits')).toBe(false)
    expect(homeCardVisible(base, 'level')).toBe(false) // Levels ships off
    expect(homeCardVisible(base, 'body')).toBe(true)
    expect(homeCardVisible(base, 'streak')).toBe(true)
  })
  it('a life module on shows its card, off hides it again', () => {
    const S = { modules: { water: true } }
    expect(homeCardVisible(S, 'water')).toBe(true)
    expect(homeCardVisible({ modules: { water: false } }, 'water')).toBe(false)
  })
  it('the weight card follows its own Look & Home switch inside the Body module', () => {
    expect(homeCardVisible({ showWeightCard: false }, 'body')).toBe(false)
    expect(homeCardVisible({ showWeightCard: true }, 'body')).toBe(true)
  })
  it('Levels takes the streak card\'s seat; the weekly-sets line keeps it when Motivation is off', () => {
    expect(homeCardVisible({ modules: { levels: true } }, 'streak')).toBe(false)
    expect(homeCardVisible({ modules: { levels: false } }, 'streak')).toBe(true)
    expect(homeCardVisible({ modules: { motivation: false } }, 'streak')).toBe(false)
    expect(homeCardVisible({ modules: { motivation: false }, homeMuscleSets: true }, 'streak')).toBe(true)
  })
})

describe('homeCardsVisible', () => {
  it('lists the ids in the default order, only those on', () => {
    const S = { modules: { water: true, sleep: true, levels: false } }
    const ids = homeCardsVisible(S)
    expect(ids).toContain('water')
    expect(ids).toContain('sleep')
    expect(ids.indexOf('water')).toBeLessThan(ids.indexOf('sleep'))
    expect(ids.indexOf('sleep')).toBeLessThan(ids.indexOf('body'))
  })
})

describe('orderHomeCards', () => {
  const visible = ['level', 'water', 'habits', 'body', 'streak']

  it('leaves the default order alone with no saved order, or a malformed one', () => {
    expect(orderHomeCards(visible, null)).toEqual(visible)
    expect(orderHomeCards(visible, undefined)).toEqual(visible)
    expect(orderHomeCards(visible, [])).toEqual(visible)
    expect(orderHomeCards(visible, 'water')).toEqual(visible)
    expect(orderHomeCards(visible, 7)).toEqual(visible)
  })
  it('does not touch the caller\'s list', () => {
    const before = [...visible]
    orderHomeCards(visible, ['body', 'level', 'water', 'habits', 'streak'])
    expect(visible).toEqual(before)
  })
  it('puts the cards where the user left them', () => {
    expect(orderHomeCards(visible, ['body', 'streak', 'level', 'water', 'habits']))
      .toEqual(['body', 'streak', 'level', 'water', 'habits'])
  })
  it('ignores ids it is not shown (a module switched off since the last move)', () => {
    expect(orderHomeCards(visible, ['food', 'body', 'level', 'water', 'habits', 'streak']))
      .toEqual(['body', 'level', 'water', 'habits', 'streak'])
  })
  it('a card the saved order never mentions lands after the ones it lists, in default order between them', () => {
    // 'habits' switched off before the move, now back on: last among the user's cards, and in
    // default order beside the other unlisted one (habits before streak).
    const out = orderHomeCards(['level', 'water', 'habits', 'body', 'streak'], ['body', 'level', 'water'])
    expect(out).toEqual(['body', 'level', 'water', 'habits', 'streak'])
  })
  it('an id nobody knows sorts last and survives', () => {
    expect(orderHomeCards(['level', 'ghost', 'body'], ['body', 'level'])).toEqual(['body', 'level', 'ghost'])
  })
  it('every registry id passes the switch with room for the next card', () => {
    for (const id of HOME_CARD_IDS) expect(typeof homeCardVisible(base, id)).toBe('boolean')
  })
})
