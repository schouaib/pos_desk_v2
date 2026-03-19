package chat

import (
	"context"
	"errors"
	"math"
	"strings"
	"time"

	"saas_pos/internal/database"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func col() *mongo.Collection {
	return database.Col("chat_messages")
}

const maxTenantMessagesPerDay = 20

func SendMessage(tenantID, senderID, senderRole, senderName, content string) (*Message, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	content = strings.TrimSpace(content)
	if content == "" {
		return nil, errors.New("message content is required")
	}

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	sid, err := primitive.ObjectIDFromHex(senderID)
	if err != nil {
		return nil, errors.New("invalid sender_id")
	}

	// Rate limit: tenants can send max 20 messages per day (admin unlimited)
	if senderRole != "super_admin" {
		startOfDay := time.Now().Truncate(24 * time.Hour)
		count, err := col().CountDocuments(ctx, bson.M{
			"tenant_id":   tid,
			"sender_role": bson.M{"$ne": "super_admin"},
			"created_at":  bson.M{"$gte": startOfDay},
		})
		if err != nil {
			return nil, err
		}
		if count >= maxTenantMessagesPerDay {
			return nil, errors.New("daily_message_limit")
		}
	}

	now := time.Now()
	msg := Message{
		ID:         primitive.NewObjectID(),
		TenantID:   tid,
		SenderRole: senderRole,
		SenderID:   sid,
		SenderName: senderName,
		Content:    content,
		Read:       false,
		CreatedAt:  now,
	}

	if _, err = col().InsertOne(ctx, msg); err != nil {
		return nil, err
	}
	return &msg, nil
}

func ListMessages(tenantID string, page, limit int) (*MessagesResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	if limit < 1 || limit > 100 {
		limit = 50
	}
	if page < 1 {
		page = 1
	}
	skip := int64((page - 1) * limit)

	filter := bson.M{"tenant_id": tid}

	total, err := col().CountDocuments(ctx, filter)
	if err != nil {
		return nil, err
	}

	cursor, err := col().Find(ctx, filter,
		options.Find().
			SetSort(bson.M{"created_at": -1}).
			SetSkip(skip).
			SetLimit(int64(limit)),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	items := []Message{}
	if err = cursor.All(ctx, &items); err != nil {
		return nil, err
	}

	pages := int(math.Ceil(float64(total) / float64(limit)))
	if pages == 0 {
		pages = 1
	}
	return &MessagesResult{Items: items, Total: total, Page: page, Limit: limit, Pages: pages}, nil
}

func MarkAsRead(tenantID, readerRole string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return errors.New("invalid tenant_id")
	}

	// Mark messages sent by the OTHER role as read
	var senderRole string
	if readerRole == "super_admin" {
		senderRole = "tenant"
	} else {
		senderRole = "super_admin"
	}

	_, err = col().UpdateMany(ctx,
		bson.M{"tenant_id": tid, "sender_role": senderRole, "read": false},
		bson.M{"$set": bson.M{"read": true}},
	)
	return err
}

func UnreadCount(tenantID, readerRole string) (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return 0, errors.New("invalid tenant_id")
	}

	var senderRole string
	if readerRole == "super_admin" {
		senderRole = "tenant"
	} else {
		senderRole = "super_admin"
	}

	count, err := col().CountDocuments(ctx, bson.M{
		"tenant_id":   tid,
		"sender_role": senderRole,
		"read":        false,
	})
	return count, err
}

// ListConversations returns all tenants that have chat messages (for super admin)
func ListConversations() ([]Conversation, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pipeline := mongo.Pipeline{
		// Group by tenant_id
		{{Key: "$group", Value: bson.D{
			{Key: "_id", Value: "$tenant_id"},
			{Key: "last_message", Value: bson.D{{Key: "$last", Value: "$content"}}},
			{Key: "last_at", Value: bson.D{{Key: "$max", Value: "$created_at"}}},
			{Key: "unread_count", Value: bson.D{{Key: "$sum", Value: bson.D{
				{Key: "$cond", Value: bson.A{
					bson.D{{Key: "$and", Value: bson.A{
						bson.D{{Key: "$ne", Value: bson.A{"$sender_role", "super_admin"}}},
						bson.D{{Key: "$eq", Value: bson.A{"$read", false}}},
					}}},
					1,
					0,
				}},
			}}}},
		}}},
		// Lookup tenant name
		{{Key: "$lookup", Value: bson.D{
			{Key: "from", Value: "tenants"},
			{Key: "localField", Value: "_id"},
			{Key: "foreignField", Value: "_id"},
			{Key: "as", Value: "tenant"},
		}}},
		{{Key: "$unwind", Value: bson.D{
			{Key: "path", Value: "$tenant"},
			{Key: "preserveNullAndEmptyArrays", Value: true},
		}}},
		{{Key: "$addFields", Value: bson.D{
			{Key: "tenant_name", Value: bson.D{{Key: "$ifNull", Value: bson.A{"$tenant.name", "Unknown"}}}},
		}}},
		{{Key: "$project", Value: bson.D{
			{Key: "tenant", Value: 0},
		}}},
		// Sort by last message time
		{{Key: "$sort", Value: bson.D{{Key: "last_at", Value: -1}}}},
	}

	cursor, err := col().Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var convos []Conversation
	if err = cursor.All(ctx, &convos); err != nil {
		return nil, err
	}
	if convos == nil {
		convos = []Conversation{}
	}
	return convos, nil
}

// TotalUnreadForAdmin returns total unread messages across all tenants for super admin
func TotalUnreadForAdmin() (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	count, err := col().CountDocuments(ctx, bson.M{
		"sender_role": bson.M{"$ne": "super_admin"},
		"read":        false,
	})
	return count, err
}
