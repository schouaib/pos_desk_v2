package remotescan

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"sync"
)

var (
	icon192     []byte
	icon512     []byte
	iconOnce    sync.Once
)

func getIcon(size int) []byte {
	iconOnce.Do(func() {
		icon192 = generateIcon(192)
		icon512 = generateIcon(512)
	})
	if size == 512 {
		return icon512
	}
	return icon192
}

func generateIcon(size int) []byte {
	img := image.NewRGBA(image.Rect(0, 0, size, size))

	bg := color.RGBA{99, 102, 241, 255}   // indigo #6366f1
	fg := color.RGBA{255, 255, 255, 255}   // white

	// Fill background
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			img.Set(x, y, bg)
		}
	}

	// Draw a simple barcode icon (vertical lines) in center
	barW := size / 20
	gap := barW
	totalW := barW*7 + gap*6
	startX := (size - totalW) / 2
	startY := size / 4
	barH := size / 2
	heights := []int{barH, barH * 3 / 4, barH, barH / 2, barH, barH * 3 / 4, barH}

	for i := 0; i < 7; i++ {
		x0 := startX + i*(barW+gap)
		h := heights[i]
		y0 := startY + (barH-h)/2
		for y := y0; y < y0+h; y++ {
			for x := x0; x < x0+barW; x++ {
				if x >= 0 && x < size && y >= 0 && y < size {
					img.Set(x, y, fg)
				}
			}
		}
	}

	var buf bytes.Buffer
	png.Encode(&buf, img)
	return buf.Bytes()
}
