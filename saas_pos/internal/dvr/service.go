package dvr

import (
	"context"
	"crypto/md5"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"saas_pos/internal/database"
	"saas_pos/internal/tenant"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func col() *mongo.Collection { return database.Col("dvr_events") }

var clipDir string

func init() {
	// Use system temp directory for reliable path resolution
	clipDir = filepath.Join(os.TempDir(), "cipos-dvr")
	os.MkdirAll(clipDir, 0755)
}

// SaveEvent saves the event record with timestamps. No download happens until requested.
func SaveEvent(req ClipRequest) {
	go func() {
		t, err := tenant.GetByID(req.TenantID)
		if err != nil || t.DVR == nil || !t.DVR.Enabled || req.CameraChannel <= 0 {
			return
		}
		cfg := t.DVR

		secBefore := cfg.SecondsBefore
		if secBefore <= 0 {
			secBefore = 10
		}
		secAfter := cfg.SecondsAfter
		if secAfter <= 0 {
			secAfter = 30
		}

		clipStart := req.EventTime.Add(-time.Duration(secBefore) * time.Second)
		clipEnd := req.EventTime.Add(time.Duration(secAfter) * time.Second)

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		event := &Event{
			ID:            primitive.NewObjectID(),
			TenantID:      req.TenantID,
			EventType:     req.EventType,
			EventRef:      req.EventRef,
			EventID:       req.EventID,
			CameraChannel: req.CameraChannel,
			ClipStart:     clipStart,
			ClipEnd:       clipEnd,
			Status:        "ready",
			CashierID:     req.CashierID,
			CashierEmail:  req.CashierEmail,
			Amount:        req.Amount,
			CreatedAt:     time.Now(),
		}
		if _, err := col().InsertOne(ctx, event); err != nil {
			log.Printf("[DVR] failed to save event %s %s: %v", req.EventType, req.EventRef, err)
		}
	}()
}

// FetchClip downloads and converts a clip on demand. Returns the MP4 path.
// If already downloaded, returns the existing path.
func FetchClip(tenantID string, event *Event) (string, error) {
	// Already downloaded?
	if event.ClipPath != "" {
		if _, err := os.Stat(event.ClipPath); err == nil {
			return event.ClipPath, nil
		}
	}

	t, err := tenant.GetByID(tenantID)
	if err != nil || t.DVR == nil || !t.DVR.Enabled {
		return "", fmt.Errorf("DVR not configured")
	}

	log.Printf("[DVR] FetchClip: starting download for %s (ch %d, %s → %s)", event.EventRef, event.CameraChannel, event.ClipStart.Format("15:04:05"), event.ClipEnd.Format("15:04:05"))

	// Update status to downloading
	col().UpdateOne(context.Background(), bson.M{"_id": event.ID}, bson.M{"$set": bson.M{"status": "downloading"}})

	mp4Path, err := downloadAndConvert(t.DVR, event.CameraChannel, event.ClipStart, event.ClipEnd, tenantID, event.ID.Hex())
	if err != nil {
		log.Printf("[DVR] FetchClip failed for %s: %v", event.EventRef, err)
		col().UpdateOne(context.Background(), bson.M{"_id": event.ID}, bson.M{"$set": bson.M{"status": "ready", "error": err.Error()}})
		return "", err
	}

	log.Printf("[DVR] FetchClip done for %s → %s", event.EventRef, mp4Path)
	col().UpdateOne(context.Background(), bson.M{"_id": event.ID}, bson.M{"$set": bson.M{"status": "done", "clip_path": mp4Path, "error": ""}})
	return mp4Path, nil
}

// downloadAndConvert downloads .dav from DVR, converts to H.264 MP4.
func downloadAndConvert(cfg *tenant.DVRConfig, channel int, start, end time.Time, tenantID, eventID string) (string, error) {
	outDir := filepath.Join(clipDir, tenantID)
	os.MkdirAll(outDir, 0755)

	davPath := filepath.Join(outDir, eventID+".dav")
	mp4Path := filepath.Join(outDir, eventID+".mp4")

	dahuaFmt := "2006-1-2 15:4:5"
	clipURL := fmt.Sprintf("http://%s:%d/cgi-bin/loadfile.cgi?action=startLoad&channel=%d&startTime=%s&endTime=%s&subtype=0",
		cfg.IP, cfg.Port, channel, dahuaEscape(start.Format(dahuaFmt)), dahuaEscape(end.Format(dahuaFmt)))

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := doDigestRequest(client, "GET", clipURL, cfg.Username, cfg.Password)
	if err != nil {
		return "", fmt.Errorf("DVR connection failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", fmt.Errorf("DVR returned status %d: %s", resp.StatusCode, string(body))
	}

	// Save .dav
	f, err := os.Create(davPath)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		os.Remove(davPath)
		return "", fmt.Errorf("download failed: %w", err)
	}
	f.Close()

	// Convert .dav → H.264 MP4 using a shell script to fully detach ffmpeg
	// This prevents Tauri's watchdog from detecting ffmpeg as a child process
	script := fmt.Sprintf(
		`nice -n 19 ffmpeg -y -i '%s' -c:v h264_videotoolbox -b:v 1500k -an -f mp4 '%s' 2>/dev/null || nice -n 19 ffmpeg -y -i '%s' -c:v libx264 -preset ultrafast -crf 28 -threads 1 -an -f mp4 '%s' 2>/dev/null`,
		davPath, mp4Path, davPath, mp4Path,
	)
	cmd := exec.Command("sh", "-c", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Run(); err != nil {
		os.Remove(davPath)
		os.Remove(mp4Path)
		return "", fmt.Errorf("ffmpeg failed: %w", err)
	}
	os.Remove(davPath) // cleanup .dav

	return mp4Path, nil
}

// List returns paginated DVR events for a tenant.
func List(tenantID string, from, to time.Time, eventType, ref string, page, limit int) ([]Event, int64, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	if page <= 0 {
		page = 1
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{
		"tenant_id":  tenantID,
		"created_at": bson.M{"$gte": from, "$lte": to},
	}
	if eventType != "" {
		filter["event_type"] = eventType
	}
	if ref != "" {
		filter["event_ref"] = ref
	}

	total, _ := col().CountDocuments(ctx, filter)
	skip := int64((page - 1) * limit)
	opts := options.Find().
		SetSort(bson.M{"created_at": -1}).
		SetSkip(skip).
		SetLimit(int64(limit))

	cur, err := col().Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cur.Close(ctx)

	var items []Event
	if err := cur.All(ctx, &items); err != nil {
		return nil, 0, err
	}
	if items == nil {
		items = []Event{}
	}
	return items, total, nil
}

// GetByID returns a single DVR event.
func GetByID(tenantID, id string) (*Event, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, fmt.Errorf("invalid id")
	}

	var event Event
	if err := col().FindOne(ctx, bson.M{"_id": oid, "tenant_id": tenantID}).Decode(&event); err != nil {
		return nil, fmt.Errorf("event not found")
	}
	return &event, nil
}

// doDigestRequest performs an HTTP request with Digest Authentication.
func doDigestRequest(client *http.Client, method, reqURL, username, password string) (*http.Response, error) {
	req, err := http.NewRequest(method, reqURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusUnauthorized {
		return resp, nil
	}

	wwwAuth := resp.Header.Get("WWW-Authenticate")
	resp.Body.Close()

	if !strings.HasPrefix(wwwAuth, "Digest ") {
		return nil, fmt.Errorf("authentication failed (wrong username/password)")
	}

	params := parseDigestChallenge(wwwAuth[7:])
	realm := params["realm"]
	nonce := params["nonce"]
	qop := params["qop"]

	uri := "/"
	if parts := strings.SplitN(reqURL, "://", 2); len(parts) == 2 {
		if idx := strings.Index(parts[1], "/"); idx >= 0 {
			uri = parts[1][idx:]
		}
	}

	ha1 := md5hex(username + ":" + realm + ":" + password)
	ha2 := md5hex(method + ":" + uri)

	nc := "00000001"
	cnonce := fmt.Sprintf("%08x", rand.Int31())

	var response string
	if strings.Contains(qop, "auth") {
		response = md5hex(ha1 + ":" + nonce + ":" + nc + ":" + cnonce + ":auth:" + ha2)
	} else {
		response = md5hex(ha1 + ":" + nonce + ":" + ha2)
	}

	authHeader := fmt.Sprintf(`Digest username="%s", realm="%s", nonce="%s", uri="%s", response="%s"`,
		username, realm, nonce, uri, response)
	if strings.Contains(qop, "auth") {
		authHeader += fmt.Sprintf(`, qop=auth, nc=%s, cnonce="%s"`, nc, cnonce)
	}

	req2, err := http.NewRequest(method, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req2.Header.Set("Authorization", authHeader)

	return client.Do(req2)
}

func parseDigestChallenge(s string) map[string]string {
	params := make(map[string]string)
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		if idx := strings.Index(part, "="); idx > 0 {
			key := strings.TrimSpace(part[:idx])
			val := strings.TrimSpace(part[idx+1:])
			val = strings.Trim(val, `"`)
			params[key] = val
		}
	}
	return params
}

func dahuaEscape(s string) string {
	return strings.ReplaceAll(s, " ", "%20")
}

func md5hex(s string) string {
	h := md5.Sum([]byte(s))
	return fmt.Sprintf("%x", h)
}

// TestConnection verifies DVR connectivity.
func TestConnection(cfg *tenant.DVRConfig) error {
	testURL := fmt.Sprintf("http://%s:%d/cgi-bin/magicBox.cgi?action=getSystemInfo", cfg.IP, cfg.Port)
	client := &http.Client{Timeout: 10 * time.Second}

	resp, err := doDigestRequest(client, "GET", testURL, cfg.Username, cfg.Password)
	if err != nil {
		return fmt.Errorf("connection failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 {
		return fmt.Errorf("authentication failed (wrong username/password)")
	}
	if resp.StatusCode != 200 {
		return fmt.Errorf("DVR returned status %d", resp.StatusCode)
	}
	return nil
}
