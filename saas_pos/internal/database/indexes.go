package database

import (
	"context"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func EnsureIndexes() {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	createIndexes(ctx, Col("super_admins"), []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "email", Value: 1}},
			Options: options.Index().SetUnique(true).SetName("email_unique"),
		},
		{
			Keys:    bson.D{{Key: "active", Value: 1}},
			Options: options.Index().SetName("active"),
		},
	})

	createIndexes(ctx, Col("subscription_plans"), []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "active", Value: 1}, {Key: "price", Value: 1}},
			Options: options.Index().SetName("active_price"),
		},
	})

	createIndexes(ctx, Col("tenants"), []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "email", Value: 1}},
			Options: options.Index().SetUnique(true).SetName("email_unique"),
		},
		{
			Keys:    bson.D{{Key: "active", Value: 1}},
			Options: options.Index().SetName("active"),
		},
		{
			Keys:    bson.D{{Key: "plan_id", Value: 1}},
			Options: options.Index().SetName("plan_id"),
		},
	})

	createIndexes(ctx, Col("users"), []mongo.IndexModel{
		// Unique email per tenant
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "email", Value: 1}},
			Options: options.Index().SetUnique(true).SetName("tenant_email_unique"),
		},
		// List users by tenant
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "active", Value: 1}},
			Options: options.Index().SetName("tenant_active"),
		},
		// Login lookup
		{
			Keys:    bson.D{{Key: "email", Value: 1}, {Key: "active", Value: 1}},
			Options: options.Index().SetName("email_active"),
		},
	})

	createIndexes(ctx, Col("units"), []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "name", Value: 1}},
			Options: options.Index().SetUnique(true).SetName("tenant_name_unique"),
		},
	})

	createIndexes(ctx, Col("categories"), []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "name", Value: 1}},
			Options: options.Index().SetUnique(true).SetName("tenant_name_unique"),
		},
	})

	createIndexes(ctx, Col("brands"), []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "name", Value: 1}},
			Options: options.Index().SetUnique(true).SetName("tenant_name_unique"),
		},
	})

	createIndexes(ctx, Col("products"), []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "created_at", Value: -1}},
			Options: options.Index().SetName("tenant_created"),
		},
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "name", Value: 1}},
			Options: options.Index().SetName("tenant_name"),
		},
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "barcodes", Value: 1}},
			Options: options.Index().SetName("tenant_barcodes"),
		},
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "category_id", Value: 1}},
			Options: options.Index().SetName("tenant_category"),
		},
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "brand_id", Value: 1}},
			Options: options.Index().SetName("tenant_brand"),
		},
	})

	createIndexes(ctx, Col("counters"), []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "name", Value: 1}},
			Options: options.Index().SetUnique(true).SetName("tenant_name_unique"),
		},
	})

	createIndexes(ctx, Col("clients"), []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "code", Value: 1}},
			Options: options.Index().SetUnique(true).SetName("tenant_code_unique"),
		},
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "name", Value: 1}},
			Options: options.Index().SetName("tenant_name"),
		},
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "created_at", Value: -1}},
			Options: options.Index().SetName("tenant_created"),
		},
	})

	createIndexes(ctx, Col("request_logs"), []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "timestamp", Value: 1}},
			Options: options.Index().SetExpireAfterSeconds(1800).SetName("ttl_30min"),
		},
		{
			Keys:    bson.D{{Key: "timestamp", Value: -1}},
			Options: options.Index().SetName("timestamp_desc"),
		},
	})

	createIndexes(ctx, Col("client_payments"), []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "client_id", Value: 1}, {Key: "created_at", Value: -1}},
			Options: options.Index().SetName("tenant_client_created"),
		},
	})

	createIndexes(ctx, Col("supplier_payments"), []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "supplier_id", Value: 1}, {Key: "created_at", Value: -1}},
			Options: options.Index().SetName("tenant_supplier_created"),
		},
	})

	createIndexes(ctx, Col("chat_messages"), []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "created_at", Value: -1}},
			Options: options.Index().SetName("tenant_created"),
		},
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "sender_role", Value: 1}, {Key: "read", Value: 1}},
			Options: options.Index().SetName("tenant_sender_read"),
		},
	})

	createIndexes(ctx, Col("purchases"), []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "created_at", Value: -1}},
			Options: options.Index().SetName("tenant_created"),
		},
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "supplier_id", Value: 1}},
			Options: options.Index().SetName("tenant_supplier"),
		},
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "status", Value: 1}, {Key: "created_at", Value: -1}},
			Options: options.Index().SetName("tenant_status_created"),
		},
	})

	createIndexes(ctx, Col("purchase_payments"), []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "tenant_id", Value: 1}, {Key: "purchase_id", Value: 1}, {Key: "created_at", Value: -1}},
			Options: options.Index().SetName("tenant_purchase_created"),
		},
	})

	createIndexes(ctx, Col("stock_adjustments"), []mongo.IndexModel{
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "created_at", Value: -1}}, Options: options.Index().SetName("tenant_created")},
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "product_id", Value: 1}}, Options: options.Index().SetName("tenant_product")},
	})

	createIndexes(ctx, Col("sale_returns"), []mongo.IndexModel{
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "created_at", Value: -1}}, Options: options.Index().SetName("tenant_created")},
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "original_sale_id", Value: 1}}, Options: options.Index().SetName("tenant_sale")},
	})

	createIndexes(ctx, Col("price_history"), []mongo.IndexModel{
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "product_id", Value: 1}, {Key: "created_at", Value: -1}}, Options: options.Index().SetName("tenant_product_created")},
	})

	createIndexes(ctx, Col("supplier_products"), []mongo.IndexModel{
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "supplier_id", Value: 1}, {Key: "product_id", Value: 1}}, Options: options.Index().SetUnique(true).SetName("tenant_supplier_product_unique")},
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "product_id", Value: 1}}, Options: options.Index().SetName("tenant_product")},
	})

	createIndexes(ctx, Col("product_variants"), []mongo.IndexModel{
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "parent_product_id", Value: 1}}, Options: options.Index().SetName("tenant_parent")},
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "barcodes", Value: 1}}, Options: options.Index().SetName("tenant_barcodes")},
	})

	createIndexes(ctx, Col("locations"), []mongo.IndexModel{
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "name", Value: 1}}, Options: options.Index().SetUnique(true).SetName("tenant_name_unique")},
	})

	createIndexes(ctx, Col("stock_transfers"), []mongo.IndexModel{
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "created_at", Value: -1}}, Options: options.Index().SetName("tenant_created")},
	})

	createIndexes(ctx, Col("location_stock"), []mongo.IndexModel{
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "product_id", Value: 1}, {Key: "location_id", Value: 1}}, Options: options.Index().SetUnique(true).SetName("tenant_product_location_unique")},
	})

	createIndexes(ctx, Col("discount_rules"), []mongo.IndexModel{
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "product_id", Value: 1}}, Options: options.Index().SetName("tenant_product")},
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "active", Value: 1}}, Options: options.Index().SetName("tenant_active")},
	})

	createIndexes(ctx, Col("product_batches"), []mongo.IndexModel{
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "product_id", Value: 1}, {Key: "expiry_date", Value: 1}}, Options: options.Index().SetName("tenant_product_expiry")},
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "batch_number", Value: 1}}, Options: options.Index().SetName("tenant_batch")},
	})

	createIndexes(ctx, Col("activation_keys"), []mongo.IndexModel{
		{Keys: bson.D{{Key: "tenant_id", Value: 1}}, Options: options.Index().SetName("tenant_id")},
		{Keys: bson.D{{Key: "key", Value: 1}}, Options: options.Index().SetUnique(true).SetName("key_unique")},
	})

	createIndexes(ctx, Col("facturation_docs"), []mongo.IndexModel{
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "doc_type", Value: 1}, {Key: "created_at", Value: -1}}, Options: options.Index().SetName("tenant_doctype_date")},
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "ref", Value: 1}}, Options: options.Index().SetName("tenant_ref")},
		{Keys: bson.D{{Key: "tenant_id", Value: 1}, {Key: "client_id", Value: 1}}, Options: options.Index().SetName("tenant_client")},
	})

	log.Println("MongoDB indexes ensured")
}

func createIndexes(ctx context.Context, col *mongo.Collection, models []mongo.IndexModel) {
	if _, err := col.Indexes().CreateMany(ctx, models); err != nil {
		log.Printf("Index warning [%s]: %v", col.Name(), err)
	}
}
