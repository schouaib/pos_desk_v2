package user

import (
	"time"

	"saas_pos/pkg/jwt"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

const (
	RoleTenantAdmin = "tenant_admin"
	RoleCashier     = "cashier"
)

type User struct {
	ID                 primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	TenantID           primitive.ObjectID `bson:"tenant_id"     json:"tenant_id"`
	Name               string             `bson:"name"          json:"name"`
	Email              string             `bson:"email"         json:"email"`
	Password           string             `bson:"password"      json:"-"`
	Role               string             `bson:"role"          json:"role"` // tenant_admin | cashier
	Permissions        jwt.Permissions    `bson:"permissions"   json:"permissions"`
	Active             bool               `bson:"active"        json:"active"`
	MustChangePassword bool               `bson:"must_change_password" json:"must_change_password"`
	CreatedAt          time.Time          `bson:"created_at"    json:"created_at"`
	UpdatedAt          time.Time          `bson:"updated_at"    json:"updated_at"`
}

type CreateInput struct {
	Name        string          `json:"name"`
	Email       string          `json:"email"`
	Password    string          `json:"password"`
	Role        string          `json:"role"`
	Permissions jwt.Permissions `json:"permissions"`
}

type UpdateInput struct {
	Name        string          `json:"name"`
	Role        string          `json:"role"`
	Permissions jwt.Permissions `json:"permissions"`
}

type LoginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	CfToken  string `json:"cf_token"`
}

type ListResult struct {
	Items []User `json:"items"`
	Total int64  `json:"total"`
	Page  int    `json:"page"`
	Limit int    `json:"limit"`
	Pages int    `json:"pages"`
}
