package docimport

import (
	"log"

	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
)

type parseInput struct {
	OCRText   string             `json:"ocr_text"`
	Filename  string             `json:"filename"`
	PreParsed *preParsedDocument `json:"pre_parsed,omitempty"`
}

type preParsedDocument struct {
	SupplierName    string           `json:"supplier_name"`
	SupplierInvoice string           `json:"supplier_invoice"`
	RawText         string           `json:"raw_text"`
	Lines           []preParsedLine  `json:"lines"`
}

type preParsedLine struct {
	Name      string  `json:"name"`
	Barcode   string  `json:"barcode"`
	Qty       float64 `json:"qty"`
	UnitPrice float64 `json:"unit_price"`
	VAT       int     `json:"vat"`
}

// POST /api/tenant/purchases/import/parse
// Accepts JSON with ocr_text (from PaddleOCR) and filename,
// parses the text and returns structured data with product matches.
// Also supports pre_parsed data from frontend OCR.
func HandleParse(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID

	var input parseInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}

	var doc ExtractedDocument

	if input.PreParsed != nil {
		// Frontend already parsed OCR — just build the doc from pre-parsed data
		doc.SupplierName = input.PreParsed.SupplierName
		doc.SupplierInvoice = input.PreParsed.SupplierInvoice
		doc.RawText = input.PreParsed.RawText
		for _, l := range input.PreParsed.Lines {
			doc.Lines = append(doc.Lines, ExtractedLine{
				Name:      l.Name,
				Barcode:   l.Barcode,
				Qty:       l.Qty,
				UnitPrice: l.UnitPrice,
				VAT:       l.VAT,
			})
		}
		log.Printf("[docimport] Pre-parsed: %d lines from frontend", len(doc.Lines))
	} else {
		if input.OCRText == "" {
			return response.BadRequest(c, "ocr_text is required")
		}
		log.Printf("[docimport] Received %d chars of OCR text from %s", len(input.OCRText), input.Filename)
		doc = ParseInvoiceText(input.OCRText)
	}

	log.Printf("[docimport] Parsed: %d lines, invoice=%q, supplier=%q", len(doc.Lines), doc.SupplierInvoice, doc.SupplierName)
	for i, l := range doc.Lines {
		log.Printf("[docimport]   line[%d]: name=%q qty=%.1f pu=%.2f", i, l.Name, l.Qty, l.UnitPrice)
	}

	// Match against existing products
	result, err := MatchProducts(tenantID, doc)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}

	return response.OK(c, result)
}

// POST /api/tenant/purchases/import/confirm
// Takes the user-reviewed data and creates products + purchase.
func HandleConfirm(c *fiber.Ctx) error {
	claims := middleware.GetClaims(c)

	var input ConfirmInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}

	result, err := ConfirmImport(claims.TenantID, claims.ID, claims.Email, input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}

	return response.Created(c, result)
}
