package redis

import (
	"context"
	"time"

	"saas_pos/internal/config"

	"github.com/redis/go-redis/v9"
)

var client *redis.Client

func Connect() {
	opts, err := redis.ParseURL(config.App.RedisURI)
	if err != nil {
		panic("redis: invalid REDIS_URI: " + err.Error())
	}
	client = redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		panic("redis: connection failed: " + err.Error())
	}
}

func Set(key, value string, ttl time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return client.Set(ctx, key, value, ttl).Err()
}

func Get(key string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return client.Get(ctx, key).Result()
}

func Del(key string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return client.Del(ctx, key).Err()
}

func Ping() error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return client.Ping(ctx).Err()
}
