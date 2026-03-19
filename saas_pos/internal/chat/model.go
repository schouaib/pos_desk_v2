package chat

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Message struct {
	ID         primitive.ObjectID `bson:"_id" json:"id"`
	TenantID   primitive.ObjectID `bson:"tenant_id" json:"tenant_id"`
	SenderRole string             `bson:"sender_role" json:"sender_role"` // "super_admin" or "tenant_admin"
	SenderID   primitive.ObjectID `bson:"sender_id" json:"sender_id"`
	SenderName string             `bson:"sender_name" json:"sender_name"`
	Content    string             `bson:"content" json:"content"`
	Read       bool               `bson:"read" json:"read"`
	CreatedAt  time.Time          `bson:"created_at" json:"created_at"`
}

type SendInput struct {
	Content string `json:"content"`
}

type Conversation struct {
	TenantID      primitive.ObjectID `bson:"_id" json:"tenant_id"`
	TenantName    string             `bson:"tenant_name" json:"tenant_name"`
	LastMessage   string             `bson:"last_message" json:"last_message"`
	LastAt        time.Time          `bson:"last_at" json:"last_at"`
	UnreadCount   int                `json:"unread_count"`
}

type MessagesResult struct {
	Items []Message `json:"items"`
	Total int64     `json:"total"`
	Page  int       `json:"page"`
	Limit int       `json:"limit"`
	Pages int       `json:"pages"`
}
