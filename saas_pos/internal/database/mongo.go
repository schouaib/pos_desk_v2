package database

import (
	"context"
	"log"
	"time"

	"saas_pos/internal/config"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var Client *mongo.Client
var DB *mongo.Database

func Connect() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	opts := options.Client().
		ApplyURI(config.App.MongoURI).
		SetMaxPoolSize(20).
		SetMinPoolSize(2)

	client, err := mongo.Connect(ctx, opts)
	if err != nil {
		log.Fatalf("MongoDB connect error: %v", err)
	}

	if err = client.Ping(ctx, nil); err != nil {
		log.Fatalf("MongoDB ping error: %v", err)
	}

	Client = client
	DB = client.Database(config.App.MongoDB)
	log.Println("MongoDB connected")
}

func Col(name string) *mongo.Collection {
	return DB.Collection(name)
}
