package folder

import (
	"context"
	"errors"
	"time"

	"saas_pos/internal/database"
	"saas_pos/internal/tenant"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func col() *mongo.Collection {
	return database.Col("folder_requests")
}

// RequestFolder creates a pending folder request from a tenant admin.
func RequestFolder(tenantID string, input RequestInput) (*FolderRequest, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	// Get tenant name for display
	var t struct {
		Name     string             `bson:"name"`
		ParentID primitive.ObjectID `bson:"parent_id"`
	}
	if err := database.Col("tenants").FindOne(ctx, bson.M{"_id": tid}).Decode(&t); err != nil {
		return nil, errors.New("tenant not found")
	}

	// Use root tenant ID for the request
	rootID := tid
	if !t.ParentID.IsZero() {
		rootID = t.ParentID
	}

	now := time.Now()
	req := FolderRequest{
		ID:         primitive.NewObjectID(),
		TenantID:   rootID,
		TenantName: t.Name,
		FolderName: input.FolderName,
		Status:     StatusPending,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	if _, err := col().InsertOne(ctx, req); err != nil {
		return nil, err
	}
	return &req, nil
}

// ListPending returns all pending folder requests (super admin view).
func ListPending() ([]FolderRequest, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cursor, err := col().Find(ctx, bson.M{"status": StatusPending},
		options.Find().SetSort(bson.M{"created_at": -1}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var requests []FolderRequest
	if err := cursor.All(ctx, &requests); err != nil {
		return nil, err
	}
	return requests, nil
}

// ListByTenant returns all folder requests for a tenant group.
func ListByTenant(tenantID string) ([]FolderRequest, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tid, err := primitive.ObjectIDFromHex(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant_id")
	}

	// Find root
	var t struct {
		ParentID primitive.ObjectID `bson:"parent_id"`
	}
	_ = database.Col("tenants").FindOne(ctx, bson.M{"_id": tid}).Decode(&t)
	rootID := tid
	if !t.ParentID.IsZero() {
		rootID = t.ParentID
	}

	cursor, err := col().Find(ctx, bson.M{"tenant_id": rootID},
		options.Find().SetSort(bson.M{"created_at": -1}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var requests []FolderRequest
	if err := cursor.All(ctx, &requests); err != nil {
		return nil, err
	}
	return requests, nil
}

// Approve creates a new linked tenant (folder) from an approved request.
func Approve(requestID string) (*FolderRequest, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	rid, err := primitive.ObjectIDFromHex(requestID)
	if err != nil {
		return nil, errors.New("invalid request_id")
	}

	var req FolderRequest
	if err := col().FindOne(ctx, bson.M{"_id": rid}).Decode(&req); err != nil {
		return nil, errors.New("request not found")
	}
	if req.Status != StatusPending {
		return nil, errors.New("request already processed")
	}

	// Get parent tenant to copy plan info
	var parent tenant.Tenant
	if err := database.Col("tenants").FindOne(ctx, bson.M{"_id": req.TenantID}).Decode(&parent); err != nil {
		return nil, errors.New("parent tenant not found")
	}

	// Create new tenant as a folder (child) — copies plan, settings, and store info
	now := time.Now()
	child := tenant.Tenant{
		ID:               primitive.NewObjectID(),
		Name:             parent.Name,
		Email:            parent.Email + "+" + req.FolderName,
		Phone:            parent.Phone,
		Address:          parent.Address,
		LogoURL:          parent.LogoURL,
		BrandColor:       parent.BrandColor,
		Currency:         parent.Currency,
		DefaultSalePrice: parent.DefaultSalePrice,
		RC:               parent.RC,
		NIF:              parent.NIF,
		NIS:              parent.NIS,
		NART:             parent.NART,
		CompteRIB:        parent.CompteRIB,
		ParentID:         req.TenantID,
		FolderName:       req.FolderName,
		PlanID:           parent.PlanID,
		Features:         parent.Features,
		MaxUsers:         parent.MaxUsers,
		MaxProducts:      parent.MaxProducts,
		MaxSalesMonth:    parent.MaxSalesMonth,
		Active:           true,
		SubscribedAt:     parent.SubscribedAt,
		PlanExpiresAt:    parent.PlanExpiresAt,
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	if _, err := database.Col("tenants").InsertOne(ctx, child); err != nil {
		return nil, err
	}

	// Copy all users from parent to child (so they can access the new folder)
	userCursor, err := database.Col("users").Find(ctx, bson.M{"tenant_id": req.TenantID})
	if err == nil {
		defer userCursor.Close(ctx)
		var docs []interface{}
		for userCursor.Next(ctx) {
			var raw bson.M
			if err := userCursor.Decode(&raw); err == nil {
				raw["_id"] = primitive.NewObjectID()
				raw["tenant_id"] = child.ID
				raw["created_at"] = now
				raw["updated_at"] = now
				docs = append(docs, raw)
			}
		}
		if len(docs) > 0 {
			database.Col("users").InsertMany(ctx, docs)
		}
	}

	// Update request status
	req.Status = StatusApproved
	req.ResultID = child.ID
	req.UpdatedAt = now
	col().UpdateOne(ctx, bson.M{"_id": rid}, bson.M{"$set": bson.M{
		"status":    StatusApproved,
		"result_id": child.ID,
		"updated_at": now,
	}})

	return &req, nil
}

// Reject marks a folder request as rejected.
func Reject(requestID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rid, err := primitive.ObjectIDFromHex(requestID)
	if err != nil {
		return errors.New("invalid request_id")
	}

	res, err := col().UpdateOne(ctx,
		bson.M{"_id": rid, "status": StatusPending},
		bson.M{"$set": bson.M{"status": StatusRejected, "updated_at": time.Now()}},
	)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return errors.New("request not found or already processed")
	}
	return nil
}

// CopyData copies products, suppliers, and/or clients from one folder (tenant) to another.
func CopyData(targetTenantID string, input CopyInput) (*CopyResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	targetID, err := primitive.ObjectIDFromHex(targetTenantID)
	if err != nil {
		return nil, errors.New("invalid target tenant_id")
	}
	sourceID, err := primitive.ObjectIDFromHex(input.SourceFolderID)
	if err != nil {
		return nil, errors.New("invalid source_folder_id")
	}

	// Verify both tenants are in the same folder group
	var target, source struct {
		ParentID primitive.ObjectID `bson:"parent_id"`
	}
	database.Col("tenants").FindOne(ctx, bson.M{"_id": targetID}).Decode(&target)
	database.Col("tenants").FindOne(ctx, bson.M{"_id": sourceID}).Decode(&source)

	targetRoot := targetID
	if !target.ParentID.IsZero() {
		targetRoot = target.ParentID
	}
	sourceRoot := sourceID
	if !source.ParentID.IsZero() {
		sourceRoot = source.ParentID
	}
	if targetRoot != sourceRoot {
		return nil, errors.New("folders are not in the same group")
	}

	result := &CopyResult{}

	if input.CopyProducts {
		n, _ := copyCollection(ctx, "products", sourceID, targetID)
		result.Products = n
	}
	if input.CopySuppliers {
		n, _ := copyCollection(ctx, "suppliers", sourceID, targetID)
		result.Suppliers = n
	}
	if input.CopyClients {
		n, _ := copyCollection(ctx, "clients", sourceID, targetID)
		result.Clients = n
	}

	return result, nil
}

func copyCollection(ctx context.Context, colName string, sourceID, targetID primitive.ObjectID) (int64, error) {
	c := database.Col(colName)
	cursor, err := c.Find(ctx, bson.M{"tenant_id": sourceID})
	if err != nil {
		return 0, err
	}
	defer cursor.Close(ctx)

	now := time.Now()
	var docs []interface{}
	for cursor.Next(ctx) {
		var raw bson.M
		if err := cursor.Decode(&raw); err == nil {
			raw["_id"] = primitive.NewObjectID()
			raw["tenant_id"] = targetID
			raw["created_at"] = now
			raw["updated_at"] = now
			// Reset stock quantities for products
			if colName == "products" {
				raw["stock"] = 0
				raw["sold"] = 0
			}
			docs = append(docs, raw)
		}
	}
	if len(docs) == 0 {
		return 0, nil
	}
	res, err := c.InsertMany(ctx, docs)
	if err != nil {
		return 0, err
	}
	return int64(len(res.InsertedIDs)), nil
}

// SwitchFolder re-authenticates a user for a different folder (linked tenant).
// Returns the target tenant ID if the user has access.
func ValidateSwitch(userEmail, currentTenantID, targetTenantID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	currentOID, _ := primitive.ObjectIDFromHex(currentTenantID)
	targetOID, err := primitive.ObjectIDFromHex(targetTenantID)
	if err != nil {
		return errors.New("invalid target_folder_id")
	}

	// Verify both are in the same group
	var current, target struct {
		ParentID primitive.ObjectID `bson:"parent_id"`
		Active   bool               `bson:"active"`
	}
	if err := database.Col("tenants").FindOne(ctx, bson.M{"_id": currentOID}).Decode(&current); err != nil {
		return errors.New("current tenant not found")
	}
	if err := database.Col("tenants").FindOne(ctx, bson.M{"_id": targetOID}).Decode(&target); err != nil {
		return errors.New("target folder not found")
	}
	if !target.Active {
		return errors.New("target folder is disabled")
	}

	currentRoot := currentOID
	if !current.ParentID.IsZero() {
		currentRoot = current.ParentID
	}
	targetRoot := targetOID
	if !target.ParentID.IsZero() {
		targetRoot = target.ParentID
	}
	if currentRoot != targetRoot {
		return errors.New("folder not in your group")
	}

	// Verify user exists in the target tenant
	count, _ := database.Col("users").CountDocuments(ctx, bson.M{
		"tenant_id": targetOID,
		"email":     userEmail,
		"active":    true,
	})
	if count == 0 {
		return errors.New("no access to this folder")
	}

	return nil
}

// GetFolders returns a lightweight list of folders for the switcher.
func GetFolders(tenantID string) ([]FolderInfo, error) {
	tenants, err := tenant.ListLinked(tenantID)
	if err != nil {
		return nil, err
	}

	folders := make([]FolderInfo, len(tenants))
	for i, t := range tenants {
		name := t.FolderName
		if name == "" {
			name = "Main"
		}
		folders[i] = FolderInfo{
			ID:         t.ID,
			Name:       t.Name,
			FolderName: name,
			Active:     t.Active,
		}
	}
	return folders, nil
}
