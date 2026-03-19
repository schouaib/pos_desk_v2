import { useState, useEffect, useRef, useCallback, Fragment } from 'preact/compat'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

export default function Chat() {
  const { t } = useI18n()
  const [conversations, setConversations] = useState([])
  const [selectedTenant, setSelectedTenant] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loadingConvos, setLoadingConvos] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)
  const pollRef = useRef(null)

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.listChatConversations()
      setConversations(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingConvos(false)
    }
  }, [])

  const loadMessages = useCallback(async (tenantId) => {
    if (!tenantId) return
    setLoadingMsgs(true)
    try {
      const res = await api.listChatMessages(tenantId, { page: 1, limit: 50 })
      setMessages((res.items || []).reverse())
      // Mark as read
      api.markChatRead(tenantId).catch(() => {})
      // Update unread in conversation list
      setConversations(prev => prev.map(c =>
        c.tenant_id === tenantId ? { ...c, unread_count: 0 } : c
      ))
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingMsgs(false)
    }
  }, [])

  useEffect(() => {
    loadConversations()
    pollRef.current = setInterval(() => {
      loadConversations()
      if (selectedTenant) loadMessages(selectedTenant)
    }, 60000)
    return () => clearInterval(pollRef.current)
  }, [loadConversations, loadMessages, selectedTenant])

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'instant' })
    }
  }, [messages])

  function selectTenant(tenantId) {
    setSelectedTenant(tenantId)
    loadMessages(tenantId)
  }

  async function handleSend(e) {
    e.preventDefault()
    const content = text.trim()
    if (!content || sending || !selectedTenant) return
    setSending(true)
    try {
      const msg = await api.sendChatMessage(selectedTenant, { content })
      setMessages(prev => [...prev, msg])
      setText('')
      // Update conversation list preview
      setConversations(prev => prev.map(c =>
        c.tenant_id === selectedTenant ? { ...c, last_message: content, last_at: new Date().toISOString() } : c
      ))
    } catch (err) {
      alert(err.message)
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

  const selectedConvo = conversations.find(c => c.tenant_id === selectedTenant)

  return (
    <Layout currentPath="/chat">
      <h1 class="text-xl font-bold mb-4">{t('chatPage')}</h1>

      <div class="flex gap-4 h-[calc(100vh-8rem)]">
        {/* Conversation list */}
        <div class="w-72 shrink-0 bg-base-100 rounded-xl border border-base-300 flex flex-col overflow-hidden">
          <div class="p-3 border-b border-base-300">
            <h2 class="text-sm font-semibold">{t('conversations')}</h2>
          </div>
          <div class="flex-1 overflow-y-auto">
            {loadingConvos && (
              <div class="flex justify-center py-8">
                <span class="loading loading-spinner loading-sm text-primary" />
              </div>
            )}
            {!loadingConvos && conversations.length === 0 && (
              <p class="text-center text-sm text-base-content/40 py-8">{t('noConversations')}</p>
            )}
            {conversations.map(c => {
              const hasUnread = c.unread_count > 0
              return (
                <button
                  key={c.tenant_id}
                  onClick={() => selectTenant(c.tenant_id)}
                  class={`w-full text-left px-3 py-2.5 border-b border-base-200 transition-colors hover:bg-base-200
                    ${selectedTenant === c.tenant_id ? 'bg-primary/10' : ''}
                    ${hasUnread && selectedTenant !== c.tenant_id ? 'bg-warning/5' : ''}`}
                >
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2 min-w-0">
                      {hasUnread && <span class="w-2 h-2 rounded-full bg-error shrink-0" />}
                      <span class={`text-sm truncate ${hasUnread ? 'font-bold' : 'font-medium'}`}>{c.tenant_name}</span>
                    </div>
                    {hasUnread && (
                      <span class="badge badge-error badge-xs text-[10px] px-1.5 shrink-0">{c.unread_count}</span>
                    )}
                  </div>
                  <p class={`text-xs truncate mt-0.5 ${hasUnread ? 'text-base-content/80 font-medium' : 'text-base-content/50'}`}>{c.last_message}</p>
                  <p class="text-[10px] text-base-content/35 mt-0.5">{formatTime(c.last_at)}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Chat area */}
        <div class="flex-1 flex flex-col bg-base-100 rounded-xl border border-base-300 overflow-hidden">
          {!selectedTenant ? (
            <div class="flex-1 flex items-center justify-center text-base-content/30">
              <div class="text-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
                <p class="text-sm">{t('selectConversation')}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div class="px-4 py-3 border-b border-base-300 flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary text-sm font-bold">
                  {selectedConvo?.tenant_name?.[0]?.toUpperCase() || '?'}
                </div>
                <span class="font-semibold text-sm">{selectedConvo?.tenant_name || 'Tenant'}</span>
              </div>

              {/* Messages */}
              <div class="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMsgs && (
                  <div class="flex justify-center py-8">
                    <span class="loading loading-spinner loading-md text-primary" />
                  </div>
                )}
                {!loadingMsgs && messages.length === 0 && (
                  <p class="text-center text-sm text-base-content/40 py-8">{t('noMessages')}</p>
                )}
                {(() => {
                  let unreadDividerShown = false
                  return messages.map(msg => {
                    const isMine = msg.sender_role === 'super_admin'
                    const showDivider = !isMine && !msg.read && !unreadDividerShown
                    if (showDivider) unreadDividerShown = true
                    return (
                      <Fragment key={msg.id}>
                        {showDivider && (
                          <div class="divider text-error text-xs font-medium my-1">{t('newMessages')}</div>
                        )}
                        <div class={`chat ${isMine ? 'chat-end' : 'chat-start'}`}>
                          <div class="chat-header text-xs text-base-content/50 mb-0.5">
                            {isMine ? t('you') : selectedConvo?.tenant_name || 'Tenant'}
                            <time class="ms-2 opacity-60">{formatTime(msg.created_at)}</time>
                          </div>
                          <div class={`chat-bubble text-sm ${isMine ? 'chat-bubble-primary' : ''}`}>
                            {msg.content}
                          </div>
                          {isMine && (
                            <div class="chat-footer text-[10px] opacity-50 mt-0.5">
                              {msg.read ? t('read') : t('sent')}
                            </div>
                          )}
                        </div>
                      </Fragment>
                    )
                  })
                })()}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <form onSubmit={handleSend} class="p-3 border-t border-base-300 flex gap-2">
                <input
                  type="text"
                  class="input input-bordered input-sm flex-1"
                  placeholder={t('typeMessage')}
                  value={text}
                  onInput={e => setText(e.target.value)}
                  maxLength={1000}
                />
                <button type="submit" class="btn btn-primary btn-sm" disabled={!text.trim() || sending}>
                  {sending ? <span class="loading loading-spinner loading-xs" /> : t('send')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}
