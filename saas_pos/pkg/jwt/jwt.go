package jwt

import (
	"errors"
	"time"

	"saas_pos/internal/config"
	"saas_pos/pkg/features"

	"github.com/golang-jwt/jwt/v5"
)

// ModulePerms holds per-action access flags for one module.
// movement/loss: products only. validate: purchases only. pay: purchases & suppliers. earnings: sales only.
type ModulePerms struct {
	View     bool `json:"view"     bson:"view"`
	Add      bool `json:"add"      bson:"add"`
	Edit     bool `json:"edit"     bson:"edit"`
	Delete   bool `json:"delete"   bson:"delete"`
	Movement bool `json:"movement" bson:"movement"`
	Loss     bool `json:"loss"     bson:"loss"`
	Validate bool `json:"validate" bson:"validate"`
	Pay      bool `json:"pay"      bson:"pay"`
	Earnings    bool `json:"earnings"     bson:"earnings"`
	UserSummary bool `json:"user_summary" bson:"user_summary"`
	Adjustment   bool `json:"adjustment"    bson:"adjustment"`
	Alert        bool `json:"alert"         bson:"alert"`
	Export       bool `json:"export"        bson:"export"`
	Return       bool `json:"return"        bson:"return"`
	Archive      bool `json:"archive"       bson:"archive"`
	PriceHistory bool `json:"price_history" bson:"price_history"`
	Valuation    bool `json:"valuation"     bson:"valuation"`
}

// Permissions maps every module to its per-action flags.
type Permissions struct {
	Products   ModulePerms `json:"products"   bson:"products"`
	Categories ModulePerms `json:"categories" bson:"categories"`
	Brands     ModulePerms `json:"brands"     bson:"brands"`
	Units      ModulePerms `json:"units"      bson:"units"`
	Purchases  ModulePerms `json:"purchases"  bson:"purchases"`
	Suppliers  ModulePerms `json:"suppliers"  bson:"suppliers"`
	Sales      ModulePerms `json:"sales"      bson:"sales"`
	Expenses   ModulePerms `json:"expenses"   bson:"expenses"`
	Retraits   ModulePerms `json:"retraits"   bson:"retraits"`
	Folders    ModulePerms `json:"folders"    bson:"folders"`
	Favorites  ModulePerms `json:"favorites"  bson:"favorites"`
}

type Claims struct {
	ID           string                `json:"id"`
	Email        string                `json:"email"`
	Role         string                `json:"role"`
	TenantID     string                `json:"tenant_id,omitempty"`
	Permissions  Permissions           `json:"permissions,omitempty"`
	Features     features.PlanFeatures `json:"features,omitempty"`
	SessionToken string                `json:"session_token"`
	jwt.RegisteredClaims
}

func Generate(id, email, role, tenantID, sessionToken string, perms Permissions, feats features.PlanFeatures) (string, error) {
	claims := Claims{
		ID:           id,
		Email:        email,
		Role:         role,
		TenantID:     tenantID,
		Permissions:  perms,
		Features:     feats,
		SessionToken: sessionToken,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(config.App.JWTExpiresIn)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(config.App.JWTSecret))
}

func Parse(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(config.App.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}
