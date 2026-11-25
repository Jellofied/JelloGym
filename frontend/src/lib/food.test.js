// Food (docs/LIFE_MODULES.md 6a/6b): the plain tier — entries, derived totals, goals and the
// suggestion — plus the saved items and their snapshot logging, and the sync registration.
import { describe, expect, it } from 'vitest'
import * as Server from '../../../api/sync-stamps.js'
import {
  addFood, addSavedFood, dayFood, editSavedFood, foodGoals, foodGoalsMet, foodPoints, foodRows,
  logSavedFood, readFoodEntry, recentFoods, removeFood, removeSavedFood, restoreFood, savedFoodsOf,
} from './food.js'
import { highestStamp, mergeStates, resetIdsOf, STAMPED_MAPS } from './sync-merge.js'

const at = n => new Date(Date.parse('2026-11-14T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const D = '2026-11-14'
const base = (over = {}) => ({ unit: 'kg', week: {}, dayPlan: {}, workouts: [], bodyweight: [], _ts: 0, ...over })

describe('food entries', () => {
  it('logs calories and protein; junk and zeroes are refused', () => {
    const S = base()
    const id = addFood(S, { d: D, kcal: 620, protein: 34, label: 'Oats' }, { id: 'f1', now: 5 })
    expect(id).toBe('f1')
    expect(readFoodEntry(S.food.f1)).toEqual({ d: D, kcal: 620, protein: 34, label: 'Oats' })
    expect(addFood(base(), { d: D, kcal: 0, protein: 0 })).toBe('invalid')
    expect(addFood(base(), { d: 'nope', kcal: 100, protein: 1 })).toBe('invalid')
    expect(addFood(base(), { d: D, kcal: 30000, protein: 1 })).toBe('invalid')
  })
  it('totals are derived, removals are tombstones, and the Undo writes back', () => {
    const S = base()
    addFood(S, { d: D, kcal: 620, protein: 34 }, { id: 'a', now: 1 })
    addFood(S, { d: D, kcal: 100, protein: 6 }, { id: 'b', now: 2 })
    expect(dayFood(S, D)).toEqual({ kcal: 720, protein: 40 })
    removeFood(S, 'a', 3)
    expect(S.food.a).toEqual({ _ts: 3 })
    expect(dayFood(S, D)).toEqual({ kcal: 100, protein: 6 })
    restoreFood(S, 'a', { d: D, kcal: 620, protein: 34 }, 4)
    expect(dayFood(S, D).kcal).toBe(720)
    expect(restoreFood(S, 'a', { d: D, kcal: 1 })).toBe(false)
  })
  it('the goals read chosen, else the weigh-in suggestion, else the defaults', () => {
    expect(foodGoals(base())).toEqual({ kcal: 2200, protein: 140, suggested: true })
    expect(foodGoals(base({ unit: 'kg', bodyweight: [{ d: D, w: 80 }] }))).toEqual({ kcal: 2650, protein: 130, suggested: true })
    const chosen = foodGoals(base({ bodyweight: [{ d: D, w: 80 }], foodGoalKcal: 2500, foodGoalProtein: 180 }))
    expect(chosen).toEqual({ kcal: 2500, protein: 180, suggested: false })
  })
  it('foodGoalsMet answers null for days with nothing logged, and needs both halves', () => {
    const S = base({ bodyweight: [{ d: D, w: 80 }] })
    expect(foodGoalsMet(S, D)).toBe(null)
    addFood(S, { d: D, kcal: 2700, protein: 100 }, { id: 'a', now: 1 })
    expect(foodGoalsMet(S, D)).toBe(false)     // protein short of 130
    addFood(S, { d: D, kcal: 0, protein: 40 }, { id: 'b', now: 2 })
    expect(foodGoalsMet(S, D)).toBe(true)
  })
  it('the one-tap list is newest-first and deduped by content', () => {
    const S = base()
    addFood(S, { d: at(-2), kcal: 300, protein: 10, label: 'Yogurt' }, { id: 'a', now: 1 })
    addFood(S, { d: D, kcal: 300, protein: 10, label: 'Yogurt' }, { id: 'b', now: 5 })
    addFood(S, { d: D, kcal: 620, protein: 34 }, { id: 'c', now: 3 })
    expect(recentFoods(S).map(f => [f.kcal, f.label])).toEqual([[300, 'Yogurt'], [620, '']])
  })
  it('points and rows carry the same story', () => {
    const S = base({ food: { a: { d: '2026-11-12', kcal: 500, protein: 20, _ts: 1 } } })
    expect(foodPoints(S, 3, D)).toEqual([{ t: new Date('2026-11-12T12:00:00').getTime(), y: 500, d: '2026-11-12', note: '20 g protein' }])
    expect(foodRows(S)).toEqual([['2026-11-12', '500', '20', '']])
  })
})

describe('saved foods and meals (6b)', () => {
  it('validates, lists sorted, and edits keep the id', () => {
    const S = base()
    expect(addSavedFood(base(), { n: 'x', kcal: 'y', protein: 1 })).toBe('invalid')
    const id = addSavedFood(S, { n: 'Oats and whey', kcal: 420, protein: 28, serving: '1 bowl' }, { id: 's1', now: 1 })
    addSavedFood(S, { n: 'Apple', kcal: 95, protein: 0 }, { id: 's2', now: 2 })
    expect(savedFoodsOf(S).map(f => f.n)).toEqual(['Apple', 'Oats and whey'])
    expect(editSavedFood(S, 's1', { kcal: 450 })).toBe(true)
    expect(savedFoodsOf(S).find(f => f.id === 's1').kcal).toBe(450)
    expect(addSavedFood(base(), { n: '', kcal: 1 })).toBe('invalid')
    expect(addSavedFood(base(), { n: 'x', kcal: 'y', protein: 1 })).toBe('invalid')
  })
  it('logging a saved item snapshots its values; editing the item does not rewrite history', () => {
    const S = base()
    const sid = addSavedFood(S, { n: 'Oats', kcal: 400, protein: 30 }, { id: 's1', now: 1 })
    const fid = logSavedFood(S, sid, { d: D, now: 2 })
    expect(S.food[fid]).toMatchObject({ d: D, kcal: 400, protein: 30, label: 'Oats', fid: 's1' })
    editSavedFood(S, 's1', { kcal: 500 }, { now: 3 })
    expect(S.food[fid].kcal).toBe(400)          // the history keeps what was eaten
    removeSavedFood(S, 's1', 4)
    expect(logSavedFood(S, 's1')).toBe('invalid')
    expect(savedFoodsOf(S)).toEqual([])
  })
})

describe('food across devices', () => {
  it('is registered on both sides, never stamped as a setting', () => {
    expect(STAMPED_MAPS).toContain('food')
    expect(STAMPED_MAPS).toContain('savedFoods')
    expect(Server.STAMPED_MAPS).toEqual(STAMPED_MAPS)
    const doc = { _ts: 5, food: { a: { d: D, kcal: 600, protein: 30, _ts: 77 } }, savedFoods: { s: { n: 'x', kcal: 1, protein: 1, _ts: 70 } } }
    expect(Server.highestStamp(doc)).toBe(77)
    expect(highestStamp(doc)).toBe(77)
    const cur = { _ts: 10, unit: 'kg', workouts: [], food: { a: { d: D, kcal: 600, protein: 30, _ts: 9 } } }
    const next = { _ts: 11, unit: 'kg', workouts: [] }
    Server.stampPut(cur, next, { overRead: true, now: 20 })
    expect(next.food).toEqual(cur.food)
    expect(next.edited?.food).toBeUndefined()
  })
  it('two devices eating on the same day keep both meals; a removal stays a removal', () => {
    const a = base({ _ts: 100, food: { x: { d: D, kcal: 300, protein: 10, _ts: 90 } } })
    const b = base({ _ts: 200, food: { y: { d: D, kcal: 200, protein: 5, _ts: 20 } } })
    for (const m of [mergeStates(a, b), mergeStates(b, a)]) expect(dayFood(m, D)).toEqual({ kcal: 500, protein: 15 })
    const gone = base({ _ts: 300, food: { x: { _ts: 250 } } })
    expect(dayFood(mergeStates(gone, mergeStates(a, b)), D).kcal).toBe(200)   // a's meal stays removed
  })
  it('a reset wipes food by names', () => {
    const before = base({ _ts: 1000, food: { x: { d: D, kcal: 300, protein: 1, _ts: 900 } } })
    const reset = base({ _ts: 2000, resetAt: 2000, resetIds: resetIdsOf(before) })
    expect(reset.resetIds.food).toEqual(['x'])
  })
  it('merging an old state never invents the keys', () => {
    expect('food' in mergeStates({ _ts: 1, workouts: [] }, { _ts: 2, workouts: [] })).toBe(false)
  })
})
