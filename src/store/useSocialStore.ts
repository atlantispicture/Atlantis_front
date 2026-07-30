import { create } from 'zustand'
import * as api from '@/lib/api'

interface SocialState {
  profile: api.UserSummary | null
  friends: api.UserSummary[]
  results: api.UserSummary[]
  searching: boolean
  saving: boolean
  error: string | null

  loadProfile: () => Promise<void>
  saveProfile: (body: { displayName?: string; avatarUrl?: string | null }) => Promise<boolean>
  loadFriends: () => Promise<void>
  search: (q: string) => Promise<void>
  toggleFollow: (u: api.UserSummary) => Promise<void>
  reset: () => void
}

/**
 * 프로필 · 친구 상태.
 *
 * 서버가 있어야만 의미가 있는 영역이라(로컬 모드에선 친구가 성립하지 않는다)
 * 로그인 전에는 아무것도 불러오지 않고 조용히 비어 있는다.
 */
export const useSocialStore = create<SocialState>((set, get) => ({
  profile: null,
  friends: [],
  results: [],
  searching: false,
  saving: false,
  error: null,

  loadProfile: async () => {
    if (!api.isLoggedIn()) return
    try {
      set({ profile: await api.getProfile() })
    } catch {
      /* 로그인 만료 등 — api 가 토큰을 비운다 */
    }
  },

  saveProfile: async (body) => {
    set({ saving: true, error: null })
    try {
      set({ profile: await api.updateProfile(body), saving: false })
      return true
    } catch (e) {
      set({ error: e instanceof api.ApiError ? e.message : '저장 실패', saving: false })
      return false
    }
  },

  loadFriends: async () => {
    if (!api.isLoggedIn()) return
    try {
      set({ friends: await api.listFriends() })
    } catch {
      /* 무시 — 친구 목록은 부가 기능 */
    }
  },

  search: async (q) => {
    if (!q.trim() || !api.isLoggedIn()) return set({ results: [] })
    set({ searching: true })
    try {
      set({ results: await api.searchUsers(q.trim()), searching: false })
    } catch {
      set({ results: [], searching: false })
    }
  },

  /**
   * 팔로우/언팔로우. 목록을 즉시 바꾸고(낙관적) 실패하면 되돌린다 —
   * 버튼이 응답을 기다리며 굳어 있으면 답답하다.
   */
  toggleFollow: async (u) => {
    const wasFollowing = u.following
    const patch = (following: boolean) =>
      set((s) => ({
        results: s.results.map((r) => (r.userId === u.userId ? { ...r, following } : r)),
      }))

    patch(!wasFollowing)
    try {
      if (wasFollowing) await api.unfollowUser(u.handle)
      else await api.followUser(u.handle)
      await get().loadFriends() // 맞팔 여부가 바뀌었을 수 있다
    } catch {
      patch(wasFollowing)
    }
  },

  reset: () => set({ profile: null, friends: [], results: [], error: null }),
}))
