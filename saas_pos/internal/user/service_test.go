package user

import (
	"os"
	"testing"

	"saas_pos/internal/testutil"
	"saas_pos/pkg/jwt"
)

func TestMain(m *testing.M) {
	testutil.Setup()
	code := m.Run()
	testutil.Teardown()
	os.Exit(code)
}

// ── Suite T ──────────────────────────────────────────────────────────────────

func TestUser_CreateAdmin(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	u, err := Create(tenantID, CreateInput{
		Name:     "Admin User",
		Email:    "admin@test.local",
		Password: "Admin1234!",
		Role:     RoleTenantAdmin,
	})
	testutil.AssertNoError(t, err)
	testutil.AssertNotEmpty(t, u.ID.Hex(), "user ID")
	testutil.AssertEqual(t, u.Role, RoleTenantAdmin, "role")
	testutil.AssertEqual(t, u.Email, "admin@test.local", "email")
	testutil.AssertTrue(t, u.Active, "user should be active by default")
}

func TestUser_CreateCashier(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	perms := jwt.Permissions{
		Sales: jwt.ModulePerms{View: true, Add: true},
	}
	u, err := Create(tenantID, CreateInput{
		Name:        "Cashier User",
		Email:       "cashier@test.local",
		Password:    "Cashier1234!",
		Role:        RoleCashier,
		Permissions: perms,
	})
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, u.Role, RoleCashier, "role")
	testutil.AssertTrue(t, u.Permissions.Sales.View, "sales view permission")
	testutil.AssertTrue(t, u.Permissions.Sales.Add, "sales add permission")
}

func TestUser_DuplicateEmail(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	_, err := Create(tenantID, CreateInput{
		Name:     "First User",
		Email:    "dup@test.local",
		Password: "Pass1234!",
		Role:     RoleTenantAdmin,
	})
	testutil.AssertNoError(t, err)

	_, err = Create(tenantID, CreateInput{
		Name:     "Second User",
		Email:    "dup@test.local",
		Password: "Pass1234!",
		Role:     RoleCashier,
	})
	testutil.AssertError(t, err)
	testutil.AssertErrorContains(t, err, "email already in use")
}

func TestUser_MaxUsersLimit(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenantWithLimits(t, 0, 2, 0)

	_, err := Create(tenantID, CreateInput{
		Name: "User1", Email: "u1@test.local", Password: "Pass1234!", Role: RoleTenantAdmin,
	})
	testutil.AssertNoError(t, err)

	_, err = Create(tenantID, CreateInput{
		Name: "User2", Email: "u2@test.local", Password: "Pass1234!", Role: RoleCashier,
	})
	testutil.AssertNoError(t, err)

	// Third user should exceed limit
	_, err = Create(tenantID, CreateInput{
		Name: "User3", Email: "u3@test.local", Password: "Pass1234!", Role: RoleCashier,
	})
	testutil.AssertError(t, err)
	testutil.AssertErrorContains(t, err, "user limit reached")
}

func TestUser_Login(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	_, err := Create(tenantID, CreateInput{
		Name: "Login User", Email: "login@test.local", Password: "Pass1234!", Role: RoleTenantAdmin,
	})
	testutil.AssertNoError(t, err)

	token, u, err := Login(LoginInput{
		Email:    "login@test.local",
		Password: "Pass1234!",
	})
	testutil.AssertNoError(t, err)
	testutil.AssertNotEmpty(t, token, "JWT token")
	testutil.AssertEqual(t, u.Email, "login@test.local", "login email")
}

func TestUser_LoginWrongPassword(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	_, err := Create(tenantID, CreateInput{
		Name: "WP User", Email: "wrong@test.local", Password: "Pass1234!", Role: RoleTenantAdmin,
	})
	testutil.AssertNoError(t, err)

	_, _, err = Login(LoginInput{
		Email:    "wrong@test.local",
		Password: "WrongPassword1!",
	})
	testutil.AssertError(t, err)
	testutil.AssertErrorContains(t, err, "invalid credentials")
}

func TestUser_SetInactive(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	u, err := Create(tenantID, CreateInput{
		Name: "Inactive User", Email: "inactive@test.local", Password: "Pass1234!", Role: RoleTenantAdmin,
	})
	testutil.AssertNoError(t, err)

	err = SetActive(tenantID, u.ID.Hex(), false)
	testutil.AssertNoError(t, err)

	// Verify user is inactive
	fetched, err := GetByID(tenantID, u.ID.Hex())
	testutil.AssertNoError(t, err)
	testutil.AssertFalse(t, fetched.Active, "user should be inactive")

	// Login should fail for inactive user
	_, _, err = Login(LoginInput{
		Email:    "inactive@test.local",
		Password: "Pass1234!",
	})
	testutil.AssertError(t, err)
	testutil.AssertErrorContains(t, err, "disabled")
}

func TestUser_ResetPassword(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	u, err := Create(tenantID, CreateInput{
		Name: "Reset User", Email: "reset@test.local", Password: "OldPass1234!", Role: RoleTenantAdmin,
	})
	testutil.AssertNoError(t, err)

	// Reset password (admin action, no old password needed)
	err = ChangePassword(tenantID, u.ID.Hex(), "NewPass1234!")
	testutil.AssertNoError(t, err)

	// Login with new password should succeed
	_, _, err = Login(LoginInput{
		Email:    "reset@test.local",
		Password: "NewPass1234!",
	})
	testutil.AssertNoError(t, err)

	// Login with old password should fail
	_, _, err = Login(LoginInput{
		Email:    "reset@test.local",
		Password: "OldPass1234!",
	})
	testutil.AssertError(t, err)
}

func TestUser_ChangePassword(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	u, err := Create(tenantID, CreateInput{
		Name: "Change User", Email: "change@test.local", Password: "OldPass1234!", Role: RoleCashier,
	})
	testutil.AssertNoError(t, err)

	// ChangePassword sets the new password directly
	err = ChangePassword(tenantID, u.ID.Hex(), "Changed1234!")
	testutil.AssertNoError(t, err)

	// Login with changed password
	_, _, err = Login(LoginInput{
		Email:    "change@test.local",
		Password: "Changed1234!",
	})
	testutil.AssertNoError(t, err)
}

func TestUser_UpdatePermissions(t *testing.T) {
	testutil.CleanAll()
	tenantID := testutil.CreateTenant(t)

	u, err := Create(tenantID, CreateInput{
		Name: "Perms User", Email: "perms@test.local", Password: "Pass1234!", Role: RoleCashier,
		Permissions: jwt.Permissions{
			Sales: jwt.ModulePerms{View: true},
		},
	})
	testutil.AssertNoError(t, err)
	testutil.AssertTrue(t, u.Permissions.Sales.View, "initial sales view")
	testutil.AssertFalse(t, u.Permissions.Products.View, "initial products view should be false")

	// Update permissions to grant products view
	updated, err := Update(tenantID, u.ID.Hex(), UpdateInput{
		Name: "Perms User Updated",
		Role: RoleCashier,
		Permissions: jwt.Permissions{
			Sales:    jwt.ModulePerms{View: true, Add: true},
			Products: jwt.ModulePerms{View: true, Edit: true},
		},
	})
	testutil.AssertNoError(t, err)
	testutil.AssertEqual(t, updated.Name, "Perms User Updated", "updated name")
	testutil.AssertTrue(t, updated.Permissions.Sales.Add, "updated sales add")
	testutil.AssertTrue(t, updated.Permissions.Products.View, "updated products view")
	testutil.AssertTrue(t, updated.Permissions.Products.Edit, "updated products edit")
}
