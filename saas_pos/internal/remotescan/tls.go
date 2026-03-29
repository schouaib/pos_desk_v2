package remotescan

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"fmt"
	"log"
	"math/big"
	"net"
	"time"

	"github.com/gofiber/fiber/v2"
	gws "github.com/gofiber/contrib/websocket"
)

const TLSPort = "3443"

// StartTLSServer starts a minimal HTTPS+WSS server on port 3443
// for the phone scanner page. This allows iOS Safari camera access.
// Uses an auto-generated self-signed certificate (user accepts once).
func StartTLSServer(done <-chan struct{}) {
	cert, err := generateSelfSignedCert()
	if err != nil {
		log.Printf("[remote-scanner] TLS cert generation failed: %v", err)
		return
	}

	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
		BodyLimit:             64 * 1024, // 64 KB — only scanner traffic
		ReadBufferSize:        4096,
	})

	// PWA assets
	app.Get("/scan/manifest.json", HandleManifest)
	app.Get("/scan/sw.js", HandleSW)
	app.Get("/scan/icon-192.png", HandleIcon192)
	app.Get("/scan/icon-512.png", HandleIcon512)

	// Scanner page
	app.Get("/scan/:token", HandleScannerPage)

	// Phone WebSocket (larger buffers for photo uploads)
	app.Get("/api/scan/ws/phone", gws.New(handlePhoneWS, gws.Config{
		ReadBufferSize:  4096,
		WriteBufferSize: 1024,
	}))

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS12,
	}

	ln, err := tls.Listen("tcp4", "0.0.0.0:"+TLSPort, tlsConfig)
	if err != nil {
		log.Printf("[remote-scanner] TLS listen on :%s failed: %v", TLSPort, err)
		return
	}

	log.Printf("[remote-scanner] HTTPS scanner server on :%s", TLSPort)

	go func() {
		<-done
		app.ShutdownWithTimeout(2 * time.Second)
		ln.Close()
	}()

	go func() {
		if err := app.Listener(ln); err != nil {
			log.Printf("[remote-scanner] TLS server stopped: %v", err)
		}
	}()
}

func generateSelfSignedCert() (tls.Certificate, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("generate key: %w", err)
	}

	serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))

	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: "CiPOSdz Scanner"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		// Include common LAN subnets as SANs so browsers accept it
		IPAddresses: localIPs(),
		DNSNames:    []string{"localhost"},
	}

	certDER, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("create cert: %w", err)
	}

	return tls.Certificate{
		Certificate: [][]byte{certDER},
		PrivateKey:  key,
	}, nil
}

func localIPs() []net.IP {
	ips := []net.IP{net.ParseIP("127.0.0.1")}
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ips
	}
	for _, a := range addrs {
		if ipnet, ok := a.(*net.IPNet); ok && !ipnet.IP.IsLoopback() && ipnet.IP.To4() != nil {
			ips = append(ips, ipnet.IP)
		}
	}
	return ips
}
