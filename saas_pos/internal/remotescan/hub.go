package remotescan

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"github.com/fasthttp/websocket"
)

// Session pairs one desktop and one phone connection via a short-lived token.
type Session struct {
	Token     string
	TenantID  string
	Desktop   *websocket.Conn
	Phone     *websocket.Conn
	CreatedAt time.Time
	mu        sync.Mutex
}

// Hub is the in-memory registry of active scanner sessions.
// Designed for very low memory: one map entry per active session (~200 bytes).
type Hub struct {
	mu       sync.RWMutex
	sessions map[string]*Session // token → session
}

var DefaultHub = NewHub()

func NewHub() *Hub {
	h := &Hub{sessions: make(map[string]*Session)}
	go h.cleanup()
	return h
}

const sessionTTL = 15 * time.Minute
const maxSessions = 50 // hard cap per server

// Create registers a new session and returns its token.
func (h *Hub) Create(tenantID string) (string, error) {
	b := make([]byte, 16) // 128-bit token
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := hex.EncodeToString(b)

	h.mu.Lock()
	defer h.mu.Unlock()

	// Evict expired before checking cap
	now := time.Now()
	for k, s := range h.sessions {
		if now.Sub(s.CreatedAt) >= sessionTTL {
			h.closeSession(s)
			delete(h.sessions, k)
		}
	}
	if len(h.sessions) >= maxSessions {
		return "", errTooManySessions
	}

	h.sessions[token] = &Session{
		Token:     token,
		TenantID:  tenantID,
		CreatedAt: now,
	}
	return token, nil
}

// Get returns a session if it exists and has not expired.
func (h *Hub) Get(token string) *Session {
	h.mu.RLock()
	s := h.sessions[token]
	h.mu.RUnlock()
	if s == nil || time.Since(s.CreatedAt) >= sessionTTL {
		return nil
	}
	return s
}

// Remove deletes a session and closes its connections.
func (h *Hub) Remove(token string) {
	h.mu.Lock()
	s := h.sessions[token]
	if s != nil {
		h.closeSession(s)
		delete(h.sessions, token)
	}
	h.mu.Unlock()
}

func (h *Hub) closeSession(s *Session) {
	s.mu.Lock()
	if s.Desktop != nil {
		s.Desktop.Close()
		s.Desktop = nil
	}
	if s.Phone != nil {
		s.Phone.Close()
		s.Phone = nil
	}
	s.mu.Unlock()
}

// cleanup runs every 2 minutes to prune expired sessions.
func (h *Hub) cleanup() {
	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		h.mu.Lock()
		for k, s := range h.sessions {
			if now.Sub(s.CreatedAt) >= sessionTTL {
				h.closeSession(s)
				delete(h.sessions, k)
			}
		}
		h.mu.Unlock()
	}
}

// RelayToDesktop sends a barcode message from phone to desktop.
func (s *Session) RelayToDesktop(msg []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Desktop == nil {
		return errNoDesktop
	}
	return s.Desktop.WriteMessage(websocket.TextMessage, msg)
}

// RelayToPhone sends a message from desktop to phone.
func (s *Session) RelayToPhone(msg []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Phone == nil {
		return errNoPhone
	}
	return s.Phone.WriteMessage(websocket.TextMessage, msg)
}

var (
	errTooManySessions = &hubError{"too many active scanner sessions"}
	errNoDesktop       = &hubError{"desktop not connected"}
	errNoPhone         = &hubError{"phone not connected"}
)

type hubError struct{ msg string }

func (e *hubError) Error() string { return e.msg }
