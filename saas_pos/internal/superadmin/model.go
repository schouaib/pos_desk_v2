package superadmin

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

const RoleSuperAdmin = "super_admin"

type SuperAdmin struct {
	ID                 primitive.ObjectID `bson:"_id,omitempty"           json:"id"`
	Name               string             `bson:"name"                    json:"name"`
	Email              string             `bson:"email"                   json:"email"`
	Password           string             `bson:"password"                json:"-"`
	Active             bool               `bson:"active"                  json:"active"`
	MustChangePassword bool               `bson:"must_change_password"    json:"must_change_password"`
	CreatedAt          time.Time          `bson:"created_at"              json:"created_at"`
	UpdatedAt          time.Time          `bson:"updated_at"              json:"updated_at"`
}

type RegisterInput struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	CfToken  string `json:"cf_token"`
}

type LoginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	CfToken  string `json:"cf_token"`
}

type ListResult struct {
	Items []SuperAdmin `json:"items"`
	Total int64        `json:"total"`
	Page  int          `json:"page"`
	Limit int          `json:"limit"`
	Pages int          `json:"pages"`
}
