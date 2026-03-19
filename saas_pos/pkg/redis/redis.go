package redis

import (
	"context"
	"errors"
	"log"
	"time"

	"saas_pos/internal/config"

	"github.com/redis/go-redis/v9"
)

var client *redis.Client
var available bool

func Connect() {
	opts, err := redis.ParseURL(config.App.RedisURI)
	if err != nil {
		log.Printf("redis: invalid REDIS_URI, running without Redis: %v", err)
		return
	}
	client = redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		log.Printf("redis: connection failed, running without Redis: %v", err)
		client = nil
		return
	}
	available = true
	log.Println("redis: connected")
}

func Available() bool {
	return available
}

func Set(key, value string, ttl time.Duration) error {
	if !available {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return client.Set(ctx, key, value, ttl).Err()
}

func Get(key string) (string, error) {
	if !available {
		return "", errors.New("redis unavailable")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return client.Get(ctx, key).Result()
}

func Del(key string) error {
	if !available {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return client.Del(ctx, key).Err()
}

func Ping() error {
	if !available {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return client.Ping(ctx).Err()
}
