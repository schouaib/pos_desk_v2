package docimport

import (
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// ─── Public API ─────────────────────────────────────────────────────────────────

// ParseInvoiceText takes raw OCR text and extracts structured purchase data.
func ParseInvoiceText(text string) ExtractedDocument {
	doc := ExtractedDocument{RawText: text}
	lines := strings.Split(text, "\n")

	doc.SupplierName = extractSupplierName(lines)
	doc.SupplierInvoice = extractInvoiceNumber(text)
	doc.InvoiceDate = extractDate(text)
	doc.TotalHT, doc.TotalVAT, doc.TotalTTC = extractTotals(text)

	// Multi-strategy product extraction — try from best to fallback
	doc.Lines = extractWithColumnDetection(lines)
	if len(doc.Lines) == 0 {
		doc.Lines = extractWithNumberClustering(lines)
	}
	if len(doc.Lines) == 0 {
		doc.Lines = extractFallbackAnyPrice(lines)
	}

	// Post-processing: infer missing data
	for i := range doc.Lines {
		inferMissingData(&doc.Lines[i], doc.TotalHT, doc.TotalTTC, len(doc.Lines))
	}

	if len(doc.Lines) == 0 {
		doc.Warnings = append(doc.Warnings, "Aucune ligne produit détectée — vérifiez le document")
	}
	if doc.SupplierName == "" {
		doc.Warnings = append(doc.Warnings, "Nom fournisseur non détecté")
	}

	return doc
}

// ─── Strategy 1: Column-position detection ──────────────────────────────────────
// Finds the header row, determines column positions, then parses each row by position.

func extractWithColumnDetection(textLines []string) []ExtractedLine {
	headerIdx, cols := detectColumns(textLines)
	if headerIdx < 0 || len(cols) < 2 {
		return nil
	}

	var result []ExtractedLine
	var nameBuf []string

	stopRe := regexp.MustCompile(`(?i)^\s*(total\s|sous[- ]?total|montant\s|net\s|tva\s|timbre|remise\s|reste\s)`)
	skipRe := regexp.MustCompile(`(?i)^\s*(avoir|situation\s*n|d[ée]duction|acompte)`)

	for i := headerIdx + 1; i < len(textLines); i++ {
		line := strings.TrimSpace(textLines[i])
		if line == "" {
			continue
		}
		if stopRe.MatchString(line) {
			break
		}
		if skipRe.MatchString(line) {
			continue
		}

		if !hasDecimalNumber(line) {
			// Text-only line → part of product name
			nameBuf = append(nameBuf, line)
			continue
		}

		// Data line — extract numbers and build product
		el := buildLineFromData(line, nameBuf)
		if el != nil {
			result = append(result, *el)
		}
		nameBuf = nil
	}

	return result
}

// detectColumns finds the header row and returns column info.
type colInfo struct {
	name string
	pos  int
}

func detectColumns(textLines []string) (int, []colInfo) {
	headerPatterns := []*regexp.Regexp{
		regexp.MustCompile(`(?i)(d[ée]signation|article|produit|libell[ée]|description).*(qt[ée]|quantit|qte|cumul)`),
		regexp.MustCompile(`(?i)(libell[ée]|d[ée]signation).*(p\.?u|prix|unitaire|total)`),
		regexp.MustCompile(`(?i)(libell[ée]|d[ée]signation|produit).*(qt[ée]|cumul)`),
	}

	for i, line := range textLines {
		for _, p := range headerPatterns {
			if p.MatchString(line) {
				cols := parseHeaderColumns(line)
				return i, cols
			}
		}
	}
	return -1, nil
}

func parseHeaderColumns(line string) []colInfo {
	keywords := map[string]*regexp.Regexp{
		"name":  regexp.MustCompile(`(?i)(d[ée]signation|article|produit|libell[ée]|description)`),
		"qty":   regexp.MustCompile(`(?i)(qt[ée]|quantit|qte|cumul)`),
		"price": regexp.MustCompile(`(?i)(p\.?u\.?\s*h?\.?t?|prix\s*unit|unitaire)`),
		"total": regexp.MustCompile(`(?i)(total\s*h\.?t|montant)`),
	}

	var cols []colInfo
	for name, re := range keywords {
		if loc := re.FindStringIndex(line); loc != nil {
			cols = append(cols, colInfo{name: name, pos: loc[0]})
		}
	}
	sort.Slice(cols, func(i, j int) bool { return cols[i].pos < cols[j].pos })
	return cols
}

// ─── Strategy 2: Number clustering ──────────────────────────────────────────────
// Groups lines by text+numbers pattern, handles multi-line names and messy OCR.

func extractWithNumberClustering(textLines []string) []ExtractedLine {
	var result []ExtractedLine
	var nameBuf []string

	stopRe := regexp.MustCompile(`(?i)^\s*(total\s|sous[- ]?total|montant\s|net\s|tva\s|timbre|remise\s|reste\s)`)
	skipRe := regexp.MustCompile(`(?i)^\s*(avoir|situation\s*n|d[ée]duction|acompte)`)

	// Find where product data starts (after a header-like line, or just scan all)
	startIdx := 0
	headerRe := regexp.MustCompile(`(?i)(d[ée]signation|libell[ée]|produit|article).*(qt|prix|total|p\.?u)`)
	for i, line := range textLines {
		if headerRe.MatchString(line) {
			startIdx = i + 1
			break
		}
	}

	for i := startIdx; i < len(textLines); i++ {
		line := strings.TrimSpace(textLines[i])
		if line == "" {
			continue
		}
		if stopRe.MatchString(line) {
			break
		}
		if skipRe.MatchString(line) {
			continue
		}

		if !hasDecimalNumber(line) {
			nameBuf = append(nameBuf, line)
			continue
		}

		el := buildLineFromData(line, nameBuf)
		if el != nil {
			result = append(result, *el)
		}
		nameBuf = nil
	}

	return result
}

// ─── Strategy 3: Fallback — find any line with a price ──────────────────────────
// Last resort: scan every line for price-like numbers.

func extractFallbackAnyPrice(textLines []string) []ExtractedLine {
	var result []ExtractedLine

	stopRe := regexp.MustCompile(`(?i)(total|montant|tva|reste|sous.total|net\s)`)
	skipRe := regexp.MustCompile(`(?i)(avoir|situation\s*n|d[ée]duction|acompte|taux|base\s*ht|date)`)
	priceRe := regexp.MustCompile(`\d+[.,]\d{2}`)

	var nameBuf []string

	for _, line := range textLines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if stopRe.MatchString(trimmed) {
			break
		}
		if skipRe.MatchString(trimmed) {
			continue
		}

		prices := priceRe.FindAllString(trimmed, -1)
		if len(prices) == 0 {
			// Could be part of a product name
			if len(trimmed) > 5 && isMainlyText(trimmed) {
				nameBuf = append(nameBuf, trimmed)
			}
			continue
		}

		el := buildLineFromData(trimmed, nameBuf)
		if el != nil {
			result = append(result, *el)
		}
		nameBuf = nil
	}

	return result
}

// ─── Smart line builder ─────────────────────────────────────────────────────────
// Takes a data line + preceding name lines, extracts product info.

func buildLineFromData(line string, nameBuf []string) *ExtractedLine {
	el := &ExtractedLine{RawText: line}

	// Split into text and data portions
	textPart, dataPart := splitTextAndData(line)

	// Build name
	var nameParts []string
	for _, n := range nameBuf {
		if c := cleanProductName(n); c != "" {
			nameParts = append(nameParts, c)
		}
	}
	if c := cleanProductName(textPart); c != "" {
		nameParts = append(nameParts, c)
	}
	el.Name = strings.Join(nameParts, " ")

	// Extract barcode from name
	bcRe := regexp.MustCompile(`^(\d{8,13})\s+`)
	if m := bcRe.FindStringSubmatch(el.Name); len(m) > 1 {
		el.Barcode = m[1]
		el.Name = strings.TrimSpace(el.Name[len(m[0]):])
	}

	if el.Name == "" {
		return nil
	}

	// Get all numbers from data portion
	numbers := classifyNumbers(dataPart)

	// Assign fields from classified numbers
	el.Qty = numbers.qty
	el.UnitPrice = numbers.unitPrice
	el.Total = numbers.total
	el.VAT = numbers.vat

	if el.UnitPrice <= 0 {
		return nil
	}

	// Infer qty from total/price if needed
	if el.Qty <= 0 || el.Qty == 1 {
		if el.Total > el.UnitPrice && el.UnitPrice > 0 {
			inferred := el.Total / el.UnitPrice
			rounded := math.Round(inferred)
			if math.Abs(inferred-rounded) < 0.01 && rounded > 0 && rounded < 100000 {
				el.Qty = rounded
			}
		}
	}
	if el.Qty <= 0 {
		el.Qty = 1
	}

	// Ensure total is set
	if el.Total <= 0 {
		el.Total = el.Qty * el.UnitPrice
	}

	return el
}

// ─── Number classification engine ───────────────────────────────────────────────
// Analyzes a group of numbers and determines which is qty, price, total, VAT%.

type classifiedNumbers struct {
	qty       float64
	unitPrice float64
	total     float64
	vat       int
}

func classifyNumbers(data string) classifiedNumbers {
	var result classifiedNumbers

	raw := extractAllNumbers(data)
	if len(raw) == 0 {
		return result
	}

	// Separate into categories
	var prices []float64     // decimal numbers (likely prices)
	var integers []float64   // whole numbers
	var percentages []float64 // numbers that could be VAT %

	for _, n := range raw {
		if n <= 0 {
			continue
		}
		abs := math.Abs(n)

		// Check if it's a percentage (9, 19, 20, 100)
		if abs == 9 || abs == 19 || abs == 20 {
			percentages = append(percentages, abs)
			continue
		}
		if abs == 100 {
			percentages = append(percentages, abs)
			continue
		}

		// Decimal = price, integer = qty candidate
		if n != math.Floor(n) {
			prices = append(prices, n)
		} else {
			integers = append(integers, n)
		}
	}

	// VAT: take first common VAT rate
	for _, p := range percentages {
		if p == 9 || p == 19 || p == 20 {
			result.vat = int(p)
			break
		}
	}

	// Combine all positive numbers for analysis
	all := append(prices, integers...)
	if len(all) == 0 {
		return result
	}

	// Sort all numbers
	sort.Float64s(all)

	// Strategy: find the triple (qty, unit_price, total) where qty * unit_price ≈ total
	if len(all) >= 3 {
		bestScore := math.MaxFloat64
		for qi := 0; qi < len(all); qi++ {
			for pi := 0; pi < len(all); pi++ {
				if pi == qi { continue }
				for ti := 0; ti < len(all); ti++ {
					if ti == qi || ti == pi { continue }
					q, p, tot := all[qi], all[pi], all[ti]
					if q <= 0 || p <= 0 || tot <= 0 { continue }
					if q > 100000 || p < 0.01 { continue }
					diff := math.Abs(q*p - tot)
					relDiff := diff / tot
					if relDiff < 0.01 && diff < bestScore {
						bestScore = diff
						result.qty = q
						result.unitPrice = p
						result.total = tot
					}
				}
			}
		}
	}

	// Fallback: 2 numbers
	if result.unitPrice == 0 && len(all) >= 2 {
		if len(prices) >= 2 && len(integers) == 0 {
			// Two decimals, no integers: smaller=unit_price, larger=total
			sort.Float64s(prices)
			result.unitPrice = prices[0]
			result.total = prices[len(prices)-1]
			// qty will be inferred by inferMissingData
		} else if len(prices) >= 1 && len(integers) >= 1 {
			// Integer=qty, decimal=price
			sort.Float64s(integers)
			sort.Float64s(prices)
			result.qty = integers[0]
			result.unitPrice = prices[0]
			if len(prices) > 1 {
				result.total = prices[len(prices)-1]
			} else {
				result.total = result.qty * result.unitPrice
			}
		} else {
			// All integers: first=qty, second=price
			result.qty = all[0]
			result.unitPrice = all[1]
			if len(all) > 2 {
				result.total = all[len(all)-1]
			}
		}
	}

	// Fallback: single number = price
	if result.unitPrice == 0 && len(all) == 1 {
		result.unitPrice = all[0]
	}

	return result
}

// ─── Inference engine ───────────────────────────────────────────────────────────
// Fills in missing data using mathematical relationships.

func inferMissingData(el *ExtractedLine, totalHT, totalTTC float64, lineCount int) {
	// Infer total from qty * price
	if el.Total <= 0 && el.Qty > 0 && el.UnitPrice > 0 {
		el.Total = math.Round(el.Qty*el.UnitPrice*100) / 100
	}

	// Infer qty from total / price
	if (el.Qty <= 0 || el.Qty == 1) && el.Total > 0 && el.UnitPrice > 0 && el.Total > el.UnitPrice {
		inferred := el.Total / el.UnitPrice
		rounded := math.Round(inferred)
		if math.Abs(inferred-rounded) < 0.02 {
			el.Qty = rounded
		}
	}

	// Infer unit price from total / qty
	if el.UnitPrice <= 0 && el.Total > 0 && el.Qty > 0 {
		el.UnitPrice = math.Round(el.Total/el.Qty*100) / 100
	}

	// If only 1 line and we have document total, use it as cross-check
	if lineCount == 1 && totalHT > 0 && el.Total <= 0 {
		el.Total = totalHT
		if el.UnitPrice > 0 {
			inferred := totalHT / el.UnitPrice
			rounded := math.Round(inferred)
			if math.Abs(inferred-rounded) < 0.02 {
				el.Qty = rounded
			}
		}
	}

	// Default VAT to 19 if not detected (Algeria standard)
	if el.VAT == 0 {
		el.VAT = 19
	}

	// Ensure qty is at least 1
	if el.Qty <= 0 {
		el.Qty = 1
	}
}

// ─── Header & metadata extraction ───────────────────────────────────────────────

func extractSupplierName(lines []string) string {
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`(?i)((?:SARL|EURL|SPA|SNC|ETS|Ets\.?|Société|Sté)\s+.{3,50})`),
		regexp.MustCompile(`(?i)(?:fournisseur|supplier|vendeur)\s*[:\-]?\s*(.{3,50})`),
		regexp.MustCompile(`(?i)(?:raison\s*sociale)\s*[:\-]?\s*(.{3,50})`),
	}
	for _, line := range lines {
		line = strings.TrimSpace(line)
		for _, p := range patterns {
			if m := p.FindStringSubmatch(line); len(m) > 1 {
				return strings.TrimSpace(m[1])
			}
		}
	}
	return ""
}

func extractInvoiceNumber(text string) string {
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`(?i)(?:num[ée]ro\s*(?:de\s*)?(?:facture|fact))\s*[:\-]?\s*([A-Z0-9/\-]{1,30})`),
		regexp.MustCompile(`(?i)(?:facture|invoice|fact\.?|fac)\s*(?:n[°o]?\.?|#|num[ée]ro)?\s*[:\-]?\s*([A-Z0-9/\-]{2,30})`),
		regexp.MustCompile(`(?i)(?:bon\s*(?:de\s*)?(?:commande|livraison)|BL|BC)\s*(?:n[°o]?\.?|#)?\s*[:\-]?\s*([A-Z0-9/\-]{2,30})`),
		regexp.MustCompile(`(?i)(?:n[°o]\.?\s*(?:facture|fact))\s*[:\-]?\s*([A-Z0-9/\-]{2,30})`),
		regexp.MustCompile(`(?i)(?:situation|devis)\s*(?:n[°o]?\.?|#)?\s*[:\-]?\s*([A-Z0-9/\-]{1,30})`),
	}
	for _, p := range patterns {
		if m := p.FindStringSubmatch(text); len(m) > 1 {
			return strings.TrimSpace(m[1])
		}
	}
	return ""
}

func extractDate(text string) string {
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{4})`),
		regexp.MustCompile(`(\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2})`),
	}
	for _, p := range patterns {
		if m := p.FindStringSubmatch(text); len(m) > 1 {
			return m[1]
		}
	}
	return ""
}

func extractTotals(text string) (ht, vat, ttc float64) {
	htRe := []*regexp.Regexp{
		regexp.MustCompile(`(?i)(?:montant|total)\s*H\.?T\.?\s*[:\-]?\s*(\d[\d\s]*(?:[.,]\d+)?)`),
		regexp.MustCompile(`(?i)(?:total|sous[- ]?total)\s*(?:hors\s*tax)\s*[:\-]?\s*(\d[\d\s]*(?:[.,]\d+)?)`),
	}
	vatRe := []*regexp.Regexp{
		regexp.MustCompile(`(?i)(?:TVA\s*GLOBALE|montant\s*TVA|total\s*TVA)\s*[:\-]?\s*(\d[\d\s]*(?:[.,]\d+)?)`),
		regexp.MustCompile(`(?i)(?:montant|total)\s*(?:TVA|tax)\s*[:\-]?\s*(\d[\d\s]*(?:[.,]\d+)?)`),
	}
	ttcRe := []*regexp.Regexp{
		regexp.MustCompile(`(?i)(?:montant|total)\s*T\.?T\.?C\.?\s*(?:en\s*\w+)?\s*[:\-]?\s*(\d[\d\s]*(?:[.,]\d+)?)`),
		regexp.MustCompile(`(?i)(?:reste\s*[àa]\s*payer|net\s*[àa]\s*payer)\s*[:\-]?\s*(\d[\d\s]*(?:[.,]\d+)?)`),
	}

	ht = matchFirst(text, htRe)
	vat = matchFirst(text, vatRe)
	ttc = matchFirst(text, ttcRe)
	return
}

func matchFirst(text string, patterns []*regexp.Regexp) float64 {
	for _, p := range patterns {
		if m := p.FindStringSubmatch(text); len(m) > 1 {
			return parseNumber(m[1])
		}
	}
	return 0
}

// ─── Utilities ──────────────────────────────────────────────────────────────────

// extractAllNumbers finds all numbers in a string.
// Handles "4 242.80" (space thousands) but keeps "50   85.00" as separate numbers.
func extractAllNumbers(s string) []float64 {
	var result []float64
	remaining := []byte(s)

	// Pass 1: Match space-thousands decimals FIRST: "4 242.80", "13 000.00"
	// Pattern: 1-3 digits, then (space + exactly 3 digits)+, then decimal
	spaceThousandRe := regexp.MustCompile(`\d{1,3}(?:\s\d{3})+[.,]\d{2}`)
	for _, loc := range spaceThousandRe.FindAllIndex(remaining, -1) {
		v := parseNumber(string(remaining[loc[0]:loc[1]]))
		if v != 0 {
			result = append(result, v)
		}
		for j := loc[0]; j < loc[1]; j++ { remaining[j] = '_' }
	}

	// Pass 2: Simple decimals: "424.28", "85.00"
	simpleDecRe := regexp.MustCompile(`\d+[.,]\d{2}`)
	for _, loc := range simpleDecRe.FindAllIndex(remaining, -1) {
		v := parseNumber(string(remaining[loc[0]:loc[1]]))
		if v != 0 {
			result = append(result, v)
		}
		for j := loc[0]; j < loc[1]; j++ { remaining[j] = '_' }
	}

	// Pass 3: Standalone integers: "50", "24", "10"
	intRe := regexp.MustCompile(`\b\d+\b`)
	for _, loc := range intRe.FindAllIndex(remaining, -1) {
		token := string(remaining[loc[0]:loc[1]])
		if strings.Contains(token, "_") { continue }
		v := parseNumber(token)
		if v != 0 {
			result = append(result, v)
		}
	}

	return result
}

func hasDecimalNumber(line string) bool {
	return regexp.MustCompile(`\d+[.,]\d{2}`).MatchString(line)
}

func isMainlyText(line string) bool {
	letters, digits := 0, 0
	for _, r := range line {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || r > 127 {
			letters++
		} else if r >= '0' && r <= '9' {
			digits++
		}
	}
	return letters > digits
}

// splitTextAndData splits at the first price-like number boundary.
func splitTextAndData(line string) (text, data string) {
	// Try: 2+ whitespace then a digit
	if loc := regexp.MustCompile(`\s{2,}\d`).FindStringIndex(line); loc != nil {
		return strings.TrimSpace(line[:loc[0]]), strings.TrimSpace(line[loc[0]:])
	}
	// Fallback: space then decimal number
	if loc := regexp.MustCompile(`\s(\d+[.,]\d{2})`).FindStringIndex(line); loc != nil {
		return strings.TrimSpace(line[:loc[0]]), strings.TrimSpace(line[loc[0]:])
	}
	return line, ""
}

// parseNumber handles French/Algerian number formats.
func parseNumber(s string) float64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	neg := false
	if s[0] == '-' {
		neg = true
		s = s[1:]
	}
	s = strings.ReplaceAll(s, " ", "")

	lastComma := strings.LastIndex(s, ",")
	lastDot := strings.LastIndex(s, ".")
	if lastComma > lastDot {
		s = strings.ReplaceAll(s, ".", "")
		s = strings.Replace(s, ",", ".", 1)
	} else if lastDot > lastComma {
		s = strings.ReplaceAll(s, ",", "")
	} else {
		s = strings.ReplaceAll(s, ",", ".")
	}

	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	v = math.Round(v*100) / 100
	if neg {
		v = -v
	}
	return v
}

func cleanProductName(name string) string {
	name = strings.TrimSpace(name)
	name = regexp.MustCompile(`^\d+[.)]\s*`).ReplaceAllString(name, "")
	name = strings.TrimLeft(name, "- •·")
	name = strings.TrimRight(name, "|/\\")
	// Remove OCR artifacts: isolated single chars, bracket noise
	name = regexp.MustCompile(`[\[\]{}|]`).ReplaceAllString(name, "")
	// Remove Arabic/Unicode noise if surrounded by Latin text
	name = regexp.MustCompile(`\s+[^\x00-\x7F]{1,3}\s+`).ReplaceAllString(name, " ")
	name = strings.TrimSpace(name)
	return name
}
