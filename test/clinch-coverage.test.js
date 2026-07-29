import { describe, it, expect } from 'vitest'
import { clinchHeadline, clinchBadge } from '../src/utils/clinch.js'

describe('clinchHeadline — every status branch', () => {
  it('won-group', () => {
    expect(clinchHeadline({ team: 'Argentina', group: 'A', status: 'won-group' })).toContain('have WON Group A')
  })
  it('runner-up', () => {
    expect(clinchHeadline({ team: 'Argentina', group: 'A', status: 'runner-up' })).toContain('as Group A RUNNERS-UP')
  })
  it('top2', () => {
    expect(clinchHeadline({ team: 'Argentina', group: 'A', status: 'top2' })).toContain('top two of Group A')
  })
  it('eliminated', () => {
    expect(clinchHeadline({ team: 'Argentina', group: 'A', status: 'eliminated' })).toContain('ELIMINATED from Group A')
  })
  it('default (unknown status)', () => {
    expect(clinchHeadline({ team: 'Argentina', group: 'A', status: 'mystery' })).toBe('Argentina (Group A): mystery')
  })
})

describe('clinchBadge — every status branch', () => {
  it('won-group', () => {
    expect(clinchBadge('won-group')).toMatchObject({ cls: 'c-won', text: 'Won group' })
  })
  it('runner-up', () => {
    expect(clinchBadge('runner-up')).toMatchObject({ cls: 'c-silver', text: 'Group runner-up' })
  })
  it('top2', () => {
    expect(clinchBadge('top2')).toMatchObject({ cls: 'c-in', text: 'Through' })
  })
  // No 'third' status exists here — Copa advances only the top two, so a
  // best-third verdict leaking in from a sibling must not render as a badge.
  it("third (a sibling's status) has no badge", () => {
    expect(clinchBadge('third')).toBeNull()
  })
  it('eliminated', () => {
    expect(clinchBadge('eliminated')).toMatchObject({ cls: 'c-out', text: 'Eliminated' })
  })
  it('null for an unknown/null status', () => {
    expect(clinchBadge(null)).toBeNull()
    expect(clinchBadge('whatever')).toBeNull()
  })
})
