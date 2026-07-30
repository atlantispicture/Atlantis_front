import { useEffect, useState } from 'react'
import type { UserSummary } from '@/lib/api'
import { useSocialStore } from '@/store/useSocialStore'

function Avatar({ user }: { user: UserSummary }) {
  return user.avatarUrl ? (
    <img className="fr__avatar" src={user.avatarUrl} alt="" />
  ) : (
    <span className="fr__avatar fr__avatar--letter">{user.handle[0]?.toUpperCase()}</span>
  )
}

/**
 * 친구 — 검색해서 팔로우하고, 서로 팔로우하면 친구가 된다.
 * 친구가 된 사람만 추억에 '함께 간 사람'으로 태그할 수 있다.
 */
export default function FriendsModal({ onClose }: { onClose: () => void }) {
  const friends = useSocialStore((s) => s.friends)
  const results = useSocialStore((s) => s.results)
  const searching = useSocialStore((s) => s.searching)
  const loadFriends = useSocialStore((s) => s.loadFriends)
  const search = useSocialStore((s) => s.search)
  const toggleFollow = useSocialStore((s) => s.toggleFollow)

  const [q, setQ] = useState('')

  useEffect(() => {
    loadFriends()
  }, [loadFriends])

  // 입력이 멈춘 뒤에 검색 — 글자마다 요청하면 서버가 시달린다
  useEffect(() => {
    const t = setTimeout(() => search(q), 300)
    return () => clearTimeout(t)
  }, [q, search])

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal__card modal__card--wide" onClick={(e) => e.stopPropagation()}>
        <button className="modal__x" onClick={onClose} aria-label="닫기">
          ✕
        </button>

        <h2 className="fr__title">친구</h2>
        <p className="fr__hint">서로 팔로우하면 친구가 되고, 추억에 함께 간 사람으로 넣을 수 있어요.</p>

        <input
          className="fr__search"
          placeholder="핸들이나 이름으로 찾기"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {q.trim() && (
          <section className="fr__section">
            <h3>검색 결과{searching && <em> 찾는 중…</em>}</h3>
            {results.length === 0 && !searching ? (
              <p className="fr__empty">그런 사람이 없어요.</p>
            ) : (
              <ul className="fr__list">
                {results.map((u) => (
                  <li key={u.userId}>
                    <Avatar user={u} />
                    <span className="fr__who">
                      <b>{u.displayName}</b>
                      <em>@{u.handle}</em>
                    </span>
                    {u.mutual && <span className="fr__badge">친구</span>}
                    <button
                      className={`fr__btn ${u.following ? 'fr__btn--on' : ''}`}
                      onClick={() => toggleFollow(u)}
                    >
                      {u.following ? '팔로잉' : '팔로우'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="fr__section">
          <h3>내 친구 {friends.length > 0 && <em>{friends.length}</em>}</h3>
          {friends.length === 0 ? (
            <p className="fr__empty">
              아직 친구가 없어요. 위에서 찾아 팔로우하고,
              <br />
              상대가 맞팔하면 친구가 됩니다.
            </p>
          ) : (
            <ul className="fr__list">
              {friends.map((u) => (
                <li key={u.userId}>
                  <Avatar user={u} />
                  <span className="fr__who">
                    <b>{u.displayName}</b>
                    <em>@{u.handle}</em>
                  </span>
                  <span className="fr__badge">친구</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
