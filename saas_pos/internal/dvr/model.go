package dvr

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// EventType identifies the POS event that triggered the DVR clip.
const (
	EventSale       = "sale"
	EventReturn     = "return"
	EventAvoir      = "avoir"
	EventCaisseClose = "caisse_close"
)

// Event is a DVR clip record linked to a POS event.
type Event struct {
	ID            primitive.ObjectID `bson:"_id,omitempty"    json:"id"`
	TenantID      string             `bson:"tenant_id"        json:"-"`
	EventType     string             `bson:"event_type"       json:"event_type"`     // sale|return|avoir|caisse_close
	EventRef      string             `bson:"event_ref"        json:"event_ref"`      // e.g. VTE-000001, RET-000001, AV-000001
	EventID       string             `bson:"event_id"         json:"event_id"`       // ObjectID hex of the source record
	CameraChannel int                `bson:"camera_channel"   json:"camera_channel"`
	ClipStart     time.Time          `bson:"clip_start"       json:"clip_start"`
	ClipEnd       time.Time          `bson:"clip_end"         json:"clip_end"`
	ClipPath      string             `bson:"clip_path"        json:"clip_path"`   // local file path once downloaded
	Status        string             `bson:"status"           json:"status"`      // pending|downloading|done|failed
	Error         string             `bson:"error,omitempty"  json:"error,omitempty"`
	CashierID     string             `bson:"cashier_id"       json:"cashier_id"`
	CashierEmail  string             `bson:"cashier_email"    json:"cashier_email"`
	Amount        float64            `bson:"amount,omitempty" json:"amount,omitempty"` // sale total for reference
	CreatedAt     time.Time          `bson:"created_at"       json:"created_at"`
}

// ClipRequest holds the parameters needed to trigger a DVR clip extraction.
type ClipRequest struct {
	TenantID      string
	EventType     string
	EventRef      string
	EventID       string
	CameraChannel int
	EventTime     time.Time
	CashierID     string
	CashierEmail  string
	Amount        float64
}
