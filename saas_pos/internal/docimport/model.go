package docimport

// ExtractedLine represents a single product line extracted from a document.
type ExtractedLine struct {
	RawText    string  `json:"raw_text"`
	Name       string  `json:"name"`
	Qty        float64 `json:"qty"`
	UnitPrice  float64 `json:"unit_price"`
	Total      float64 `json:"total"`
	VAT        int     `json:"vat"`
	Barcode    string  `json:"barcode,omitempty"`
	Unit       string  `json:"unit,omitempty"`
}

// ExtractedDocument represents the structured data extracted from a purchase document.
type ExtractedDocument struct {
	SupplierName    string          `json:"supplier_name"`
	SupplierInvoice string          `json:"supplier_invoice"`
	InvoiceDate     string          `json:"invoice_date"`
	Lines           []ExtractedLine `json:"lines"`
	TotalHT         float64         `json:"total_ht"`
	TotalVAT        float64         `json:"total_vat"`
	TotalTTC        float64         `json:"total_ttc"`
	RawText         string          `json:"raw_text"`
	Warnings        []string        `json:"warnings,omitempty"`
}

// ProductCandidate is a possible product match with a confidence score.
type ProductCandidate struct {
	ProductID   string `json:"product_id"`
	ProductName string `json:"product_name"`
	Confidence  int    `json:"confidence"` // 0-100 match confidence
}

// MatchedLine is an extracted line with possible product matches.
type MatchedLine struct {
	ExtractedLine
	ProductID   string             `json:"product_id,omitempty"`
	ProductName string             `json:"product_name,omitempty"`
	IsNew       bool               `json:"is_new"`
	Confidence  int                `json:"confidence"`  // 0-100, best match confidence
	Candidates  []ProductCandidate `json:"candidates"`  // top probable matches, sorted by confidence
}

// ParseResult is the response from the parse endpoint.
type ParseResult struct {
	Document ExtractedDocument `json:"document"`
	Lines    []MatchedLine     `json:"lines"`
	Stats    struct {
		Total    int `json:"total"`
		Matched  int `json:"matched"`
		New      int `json:"new"`
	} `json:"stats"`
}

// ConfirmInput is the request body for confirming an import.
type ConfirmInput struct {
	SupplierID      string             `json:"supplier_id"`
	SupplierInvoice string             `json:"supplier_invoice"`
	Note            string             `json:"note"`
	Lines           []ConfirmLineInput `json:"lines"`
}

// ConfirmLineInput represents a single line to import (may create a new product).
type ConfirmLineInput struct {
	ProductID  string  `json:"product_id,omitempty"` // empty = create new product
	Name       string  `json:"name"`
	Barcode    string  `json:"barcode,omitempty"`
	Qty        float64 `json:"qty"`
	PrixAchat  float64 `json:"prix_achat"`
	PrixVente1 float64 `json:"prix_vente_1"`
	VAT        int     `json:"vat"`
	Skip       bool    `json:"skip"` // true = don't import this line
}

// ConfirmResult is the response from the confirm endpoint.
type ConfirmResult struct {
	PurchaseID      string `json:"purchase_id"`
	PurchaseRef     string `json:"purchase_ref"`
	ProductsCreated int    `json:"products_created"`
	LinesImported   int    `json:"lines_imported"`
}
