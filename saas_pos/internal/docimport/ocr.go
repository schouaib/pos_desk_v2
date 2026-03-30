package docimport

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/ledongthuc/pdf"
)

// ExtractTextFromFile extracts text from an uploaded file (PDF or image).
func ExtractTextFromFile(fh *multipart.FileHeader) (string, error) {
	ext := strings.ToLower(filepath.Ext(fh.Filename))

	// Save to temp file
	tmpDir := os.TempDir()
	tmpPath := filepath.Join(tmpDir, "docimport_"+fh.Filename)

	src, err := fh.Open()
	if err != nil {
		return "", fmt.Errorf("cannot open uploaded file: %w", err)
	}
	defer src.Close()

	dst, err := os.Create(tmpPath)
	if err != nil {
		return "", fmt.Errorf("cannot create temp file: %w", err)
	}
	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		os.Remove(tmpPath)
		return "", fmt.Errorf("cannot write temp file: %w", err)
	}
	dst.Close()
	defer os.Remove(tmpPath)

	switch ext {
	case ".pdf":
		return extractTextFromPDF(tmpPath)
	case ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif":
		return extractTextFromImage(tmpPath)
	default:
		return "", errors.New("unsupported file type: " + ext)
	}
}

// extractTextFromPDF extracts text from a PDF file using the pure-Go PDF library.
func extractTextFromPDF(path string) (string, error) {
	f, r, err := pdf.Open(path)
	if err != nil {
		return "", fmt.Errorf("cannot open PDF: %w", err)
	}
	defer f.Close()

	var buf bytes.Buffer
	totalPages := r.NumPage()
	if totalPages == 0 {
		return "", errors.New("PDF has no pages")
	}

	for i := 1; i <= totalPages; i++ {
		p := r.Page(i)
		if p.V.IsNull() {
			continue
		}
		text, err := p.GetPlainText(nil)
		if err != nil {
			continue
		}
		buf.WriteString(text)
		buf.WriteString("\n")
	}

	result := strings.TrimSpace(buf.String())
	if result == "" {
		// PDF has no text layer — try OCR via tesseract if available
		return extractTextFromImage(path)
	}
	return result, nil
}

// extractTextFromImage uses Tesseract CLI for OCR on an image file.
// Tesseract must be installed on the system (brew install tesseract on macOS,
// or bundled with the app).
func extractTextFromImage(path string) (string, error) {
	// Find tesseract binary
	tesseractPath, err := findTesseract()
	if err != nil {
		return "", err
	}

	// Run tesseract: tesseract input.png stdout -l fra+ara+eng
	cmd := exec.Command(tesseractPath, path, "stdout", "-l", "fra+ara+eng", "--psm", "6")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		// Try without language packs (fall back to default)
		cmd2 := exec.Command(tesseractPath, path, "stdout", "--psm", "6")
		var stdout2 bytes.Buffer
		cmd2.Stdout = &stdout2
		if err2 := cmd2.Run(); err2 != nil {
			return "", fmt.Errorf("tesseract failed: %s (ensure tesseract is installed with: brew install tesseract)", stderr.String())
		}
		return strings.TrimSpace(stdout2.String()), nil
	}

	return strings.TrimSpace(stdout.String()), nil
}

// findTesseract locates the tesseract binary.
func findTesseract() (string, error) {
	// Check common locations
	candidates := []string{
		"tesseract", // PATH
		"/usr/local/bin/tesseract",
		"/opt/homebrew/bin/tesseract",
		"/usr/bin/tesseract",
	}

	for _, c := range candidates {
		if p, err := exec.LookPath(c); err == nil {
			return p, nil
		}
	}

	return "", errors.New("tesseract not found — install it with: brew install tesseract tesseract-lang")
}
