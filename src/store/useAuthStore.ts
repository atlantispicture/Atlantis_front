import { create } from 'zustand'
import * as api from '@/lib/api'
import { useMemoryStore } from './useMemoryStore'
import { useSocialStore } from './useSocialStore'
import { useVisitStore } from './useVisitStore'

type ServerState = 'unknown' | 'offline' | 'online'

interface AuthState {
  /** 서버 연결 여부 — 꺼져 있어도 앱은 로컬 모드로 계속 쓸 수 있어야 한다 */
  server: ServerState
  handle: string | null
  loggingIn: boolean
  error: string | null

  checkServer: () => Promise<void>
  login: (email: string, password: string) => Promise<boolean>
  signup: (body: {
    email: string
    password: string
    handle: string
    displayName?: string
  }) => Promise<boolean>
  logout: () => void
}

/**
 * 로그인이 확정된 뒤 서버 데이터를 끌어온다.
 *
 * 각 스토어가 마운트 시점에 한 번만 불러오면, 로그인 전에 마운트된 화면은
 * 영원히 빈 상태로 남는다 (친구 목록이 그랬다). 로그인 성공을 한 곳에서
 * 잡아 필요한 것들을 모아 다시 채운다.
 */
async function afterLogin() {
  await Promise.all([
    useVisitStore.getState().pullFromServer(),
    useSocialStore.getState().loadFriends(),
    useSocialStore.getState().loadProfile(),
    useMemoryStore.getState().syncFromServer(),
  ])
}

export const useAuthStore = create<AuthState>((set) => ({
  server: 'unknown',
  handle: api.getHandle(),
  loggingIn: false,
  error: null,

  checkServer: async () => {
    const ok = await api.ping()
    set({ server: ok ? 'online' : 'offline' })

    // 토큰이 남아 있으면 아직 유효한지 확인한다 (만료 시 api 가 알아서 비운다)
    if (ok && api.isLoggedIn()) {
      try {
        const m = await api.me()
        set({ handle: m.handle })
        await afterLogin()
      } catch {
        set({ handle: null })
      }
    }
  },

  login: async (email, password) => {
    set({ loggingIn: true, error: null })
    try {
      const res = await api.login(email, password)
      set({ handle: res.handle, server: 'online', loggingIn: false })
      await afterLogin()
      return true
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : '로그인 실패'
      set({ error: msg, loggingIn: false })
      return false
    }
  },

  signup: async (body) => {
    set({ loggingIn: true, error: null })
    try {
      const res = await api.signup(body)
      set({ handle: res.handle, server: 'online', loggingIn: false })
      await afterLogin()
      return true
    } catch (e) {
      const msg = e instanceof api.ApiError ? e.message : '가입 실패'
      set({ error: msg, loggingIn: false })
      return false
    }
  },

  logout: () => {
    api.setSession(null)
    set({ handle: null })
  },
}))
