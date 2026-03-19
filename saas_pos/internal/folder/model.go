package folder

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

const (
	StatusPending  = "pending"
	StatusApproved = "approved"
	StatusRejected = "rejected"
)

// FolderRequest represents a tenant's request to create a new folder.
type FolderRequest struct {
	ID         primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	TenantID   primitive.ObjectID `bson:"tenant_id"     json:"tenant_id"`
	TenantName string             `bson:"tenant_name"   json:"tenant_name"`
	FolderName string             `bson:"folder_name"   json:"folder_name"`
	Status     string             `bson:"status"        json:"status"` // pending | approved | rejected
	ResultID   primitive.ObjectID `bson:"result_id,omitempty" json:"result_id,omitempty"` // created tenant ID after approval
	CreatedAt  time.Time          `bson:"created_at"    json:"created_at"`
	UpdatedAt  time.Time          `bson:"updated_at"    json:"updated_at"`
}

type RequestInput struct {
	FolderName string `json:"folder_name"`
}

type CopyInput struct {
	SourceFolderID string `json:"source_folder_id"`
	CopyProducts   bool   `json:"copy_products"`
	CopySuppliers  bool   `json:"copy_suppliers"`
	CopyClients    bool   `json:"copy_clients"`
}

type CopyResult struct {
	Products  int64 `json:"products"`
	Suppliers int64 `json:"suppliers"`
	Clients   int64 `json:"clients"`
}

// FolderInfo is a lightweight view for the folder switcher.
type FolderInfo struct {
	ID         primitive.ObjectID `json:"id"`
	Name       string             `json:"name"`
	FolderName string             `json:"folder_name"`
	Active     bool               `json:"active"`
}
