package config

import (
	"os"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	AppHost         string
	AppPort         string
	MongoURI        string
	MongoDB         string
	JWTSecret       string
	JWTExpiresIn    time.Duration
	TurnstileSecret string
	CORSOrigins     string
}

var App Config

func Load() {
	_ = godotenv.Load()

	dur, err := time.ParseDuration(getEnv("JWT_EXPIRES_IN", "4h"))
	if err != nil {
		dur = 24 * time.Hour
	}

	App = Config{
		AppHost:         getEnv("APP_HOST", "0.0.0.0"),
		AppPort:         getEnv("APP_PORT", "3000"),
		MongoURI:        getEnv("MONGO_URI", "mongodb://localhost:27099"),
		MongoDB:         getEnv("MONGO_DB", "saas_pos"),
		JWTSecret:       requireEnv("JWT_SECRET"),
		JWTExpiresIn:    dur,
		TurnstileSecret: getEnv("TURNSTILE_SECRET", ""),
		CORSOrigins:     getEnv("CORS_ORIGINS", "tauri://localhost,http://tauri.localhost,https://tauri.localhost,http://localhost:5180,http://localhost:5181"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func requireEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic("required env var " + key + " is not set")
	}
	return v
}
