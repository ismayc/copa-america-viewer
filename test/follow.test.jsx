import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { FollowProvider, useFollow } from '../src/context/follow.jsx'

const KEY = 'copa:followed'
const wrapper = ({ children }) => <FollowProvider>{children}</FollowProvider>

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('useFollow (with provider)', () => {
  it('starts empty and toggles a team on, persisting to localStorage', () => {
    const { result } = renderHook(() => useFollow(), { wrapper })
    expect(result.current.count).toBe(0)
    expect(result.current.isFollowed('Germany')).toBe(false)

    act(() => result.current.toggle('Germany'))
    expect(result.current.isFollowed('Germany')).toBe(true)
    expect(result.current.count).toBe(1)
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual(['Germany'])
  })

  it('toggles a team off again', () => {
    const { result } = renderHook(() => useFollow(), { wrapper })
    act(() => result.current.toggle('Denmark'))
    act(() => result.current.toggle('Denmark'))
    expect(result.current.isFollowed('Denmark')).toBe(false)
    expect(result.current.count).toBe(0)
  })

  it('clear() empties the set', () => {
    const { result } = renderHook(() => useFollow(), { wrapper })
    act(() => result.current.toggle('Spain'))
    act(() => result.current.toggle('France'))
    expect(result.current.count).toBe(2)
    act(() => result.current.clear())
    expect(result.current.count).toBe(0)
    expect(result.current.followed.size).toBe(0)
  })

  it('hydrates initial state from localStorage', () => {
    localStorage.setItem(KEY, JSON.stringify(['Argentina']))
    const { result } = renderHook(() => useFollow(), { wrapper })
    expect(result.current.isFollowed('Argentina')).toBe(true)
    expect(result.current.count).toBe(1)
  })

  it('falls back to an empty set when stored JSON is corrupt', () => {
    localStorage.setItem(KEY, '{not json')
    const { result } = renderHook(() => useFollow(), { wrapper })
    expect(result.current.count).toBe(0)
  })

  it('swallows localStorage write errors (quota / privacy mode)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    const { result } = renderHook(() => useFollow(), { wrapper })
    expect(() => act(() => result.current.toggle('Italy'))).not.toThrow()
    expect(result.current.isFollowed('Italy')).toBe(true)
    spy.mockRestore()
  })
})

describe('useFollow (no provider — inert fallback)', () => {
  it('returns inert defaults without a provider mounted', () => {
    const { result } = renderHook(() => useFollow())
    expect(result.current.count).toBe(0)
    expect(result.current.isFollowed('Germany')).toBe(false)
    expect(() => result.current.toggle('Germany')).not.toThrow()
    expect(() => result.current.clear()).not.toThrow()
  })
})
