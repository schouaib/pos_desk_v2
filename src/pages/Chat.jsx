import { useState, useEffect, useRef, useCallback } from 'preact/compat'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

export default function Chat() {
  const { t } = useI18n()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const bottomRef = useRef(null)
  const pollRef = useRef(null)

  const loadMessages = useCallback(async (p = 1) => {
    try {
      const res = await api.listChatMessages({ page: p, limit: 50 })
      // Messages come newest-first, reverse for display
      setMessages((res.items || []).reverse())
      setTotalPages(res.pages || 1)
      setPage(p)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    loadMessages()
    // Mark as read on open
    api.markChatRead().catch(() => {})
    // Poll every 60 seconds
    pollRef.current = setInterval(() => {
      if (!active) return
      loadMessages()
      api.markChatRead().catch(() => {})
    }, 60000)
    return () => { active = false; clearInterval(pollRef.current) }
  }, [loadMessages])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    setError('')
    try {
      const msg = await api.sendChatMessage({ content })
      setMessages(prev => [...prev, msg])
      setText('')
    } catch (err) {
      setError(err.message === 'daily_message_limit' ? t('dailyMessageLimit') : err.message)
    } finally {
      setSending(false)
    }
  }

  function formatTime(dateStr) {
    const d = new Date(dateStr)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (isToday) return time
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time
  }

  return (
    <Layout currentPath="/chat">
      <div class="flex flex-col h-[calc(100vh-7rem)] md:h-[calc(100vh-3rem)]">
        {/* Header */}
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          </div>
          <div>
            <h1 class="text-2xl font-bold">{t('chatWithAdmin')}</h1>
            <p class="text-xs text-base-content/70">{t('chatSubtitle')}</p>
          </div>
        </div>

        {/* Messages area */}
        <div class="flex-1 overflow-y-auto bg-base-100 rounded-xl border border-base-300 p-4 space-y-3">
          {loading && (
            <div class="flex justify-center py-8">
              <span class="loading loading-spinner loading-md text-primary" />
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div class="text-center text-base-content/70 py-12">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
              <p class="text-sm">{t('noMessages')}</p>
              <p class="text-xs mt-1">{t('startConversation')}</p>
            </div>
          )}

          {messages.map(msg => {
            const isMine = msg.sender_role !== 'super_admin'
            return (
              <div key={msg.id} class={`chat ${isMine ? 'chat-end' : 'chat-start'}`}>
                <div class="chat-header text-xs text-base-content/70 mb-0.5">
                  {isMine ? t('you') : t('adminLabel')}
                  <time class="ms-2 opacity-60">{formatTime(msg.created_at)}</time>
                </div>
                <div class={`chat-bubble text-sm ${isMine ? 'chat-bubble-primary' : ''}`}>
                  {msg.content}
                </div>
                {isMine && (
                  <div class="chat-footer text-xs opacity-50 mt-0.5">
                    {msg.read ? t('read') : t('sent')}
                  </div>
                )}
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Error */}
        {error && (
          <div class="mt-2 px-3 py-2 rounded-lg bg-error/10 text-error text-xs flex items-center justify-between">
            <span>{error}</span>
            <button class="btn btn-ghost btn-xs" onClick={() => setError('')}>✕</button>
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSend} class="mt-3 flex gap-2">
          <input
            type="text"
            class="input input-bordered flex-1"
            placeholder={t('typeMessage')}
            value={text}
            onInput={e => setText(e.target.value)}
            maxLength={1000}
          />
          <button type="submit" class="btn btn-primary" disabled={!text.trim() || sending}>
            {sending ? <span class="loading loading-spinner loading-sm" /> : t('send')}
          </button>
        </form>
      </div>
    </Layout>
  )
}
