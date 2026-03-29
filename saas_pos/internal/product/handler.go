package product

import (
	"encoding/csv"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"saas_pos/internal/middleware"
	"saas_pos/pkg/response"

	"github.com/gofiber/fiber/v2"
	"github.com/xuri/excelize/v2"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// GET /api/tenant/products/generate-barcode
func HandleGenerateBarcode(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	tid, _ := primitive.ObjectIDFromHex(tenantID)
	ctx := c.UserContext()
	for range 10 {
		code := fmt.Sprintf("%012d", rand.Int63n(1_000_000_000_000))
		count, _ := col().CountDocuments(ctx, bson.M{
			"tenant_id": tid,
			"barcodes":  code,
		})
		if count == 0 {
			return response.OK(c, code)
		}
	}
	return response.Error(c, fiber.StatusInternalServerError, "could not generate unique barcode")
}

// POST /api/tenant/products/
func HandleCreate(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var input CreateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	p, err := Create(tenantID, input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, p)
}

// GET /api/tenant/products/?q=&page=1&limit=10
func HandleList(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	q := c.Query("q", "")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	catID := c.Query("category_id", "")
	brandID := c.Query("brand_id", "")

	result, err := List(tenantID, q, page, limit, catID, brandID)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, result)
}

// POST /api/tenant/products/by-ids
func HandleGetByIDs(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var body struct {
		IDs []string `json:"ids"`
	}
	if err := c.BodyParser(&body); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	oids := make([]primitive.ObjectID, 0, len(body.IDs))
	for _, id := range body.IDs {
		if oid, err := primitive.ObjectIDFromHex(id); err == nil {
			oids = append(oids, oid)
		}
	}
	products, err := GetByIDs(tenantID, oids)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, products)
}

// GET /api/tenant/products/:id
func HandleGetByID(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	p, err := GetByID(tenantID, c.Params("id"))
	if err != nil {
		return response.NotFound(c, err.Error())
	}
	return response.OK(c, p)
}

// PUT /api/tenant/products/:id
func HandleUpdate(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	var input UpdateInput
	if err := c.BodyParser(&input); err != nil {
		return response.BadRequest(c, "invalid body")
	}
	p, err := Update(tenantID, c.Params("id"), input)
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, p)
}

// DELETE /api/tenant/products/:id
func HandleDelete(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	archived, err := Delete(tenantID, c.Params("id"))
	if err != nil {
		return response.NotFound(c, err.Error())
	}
	if archived {
		return response.OK(c, fiber.Map{"archived": true, "message": "product has sales/purchases history and was archived instead of deleted"})
	}
	return response.OK(c, nil)
}

// GET /api/tenant/products/:id/movements?page=1&limit=20&date_from=2024-01-01&date_to=2024-12-31
func HandleListMovements(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	dateFrom := c.Query("date_from", "")
	dateTo := c.Query("date_to", "")
	result, err := ListMovements(tenantID, c.Params("id"), dateFrom, dateTo, page, limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, result)
}

// GET /api/tenant/products/low-stock?q=&page=1&limit=10
func HandleLowStock(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	q := c.Query("q", "")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	result, err := ListLowStock(tenantID, q, page, limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, result)
}

// GET /api/tenant/products/export
func HandleExport(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	data, err := ExportCSV(tenantID)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	c.Set("Content-Type", "text/csv")
	c.Set("Content-Disposition", "attachment; filename=products.csv")
	return c.Send(data)
}

// GET /api/tenant/products/valuation
func HandleValuation(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	result, err := GetValuation(tenantID)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, result)
}

// POST /api/tenant/products/:id/archive
func HandleArchive(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	if err := Archive(tenantID, c.Params("id")); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, nil)
}

// POST /api/tenant/products/:id/unarchive
func HandleUnarchive(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	if err := Unarchive(tenantID, c.Params("id")); err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.OK(c, nil)
}

// GET /api/tenant/products/archived
func HandleListArchived(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	q := c.Query("q", "")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))
	result, err := ListArchived(tenantID, q, page, limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.OK(c, result)
}

// POST /api/tenant/products/:id/duplicate
func HandleDuplicate(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID
	p, err := Duplicate(tenantID, c.Params("id"))
	if err != nil {
		return response.BadRequest(c, err.Error())
	}
	return response.Created(c, p)
}

// parseEuropeanNumber converts "48 500,00" → 48500.00
// Strips all Unicode space characters (regular, NBSP \u00a0, narrow NBSP \u202f, etc.)
func parseEuropeanNumber(s string) float64 {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ReplaceAll(s, "\u00a0", "")
	s = strings.ReplaceAll(s, "\u202f", "")
	s = strings.ReplaceAll(s, "\u2009", "")
	// Remove quote characters that Excel sometimes adds
	s = strings.ReplaceAll(s, "\"", "")
	s = strings.Replace(s, ",", ".", 1)
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

// safeCol returns the column value or "" if the index is out of range.
func safeCol(row []string, idx int) string {
	if idx < len(row) {
		return row[idx]
	}
	return ""
}

// parseRows converts raw string rows (from Excel or CSV) into BulkImportRow slices.
func parseRows(rawRows [][]string) []BulkImportRow {
	var rows []BulkImportRow
	for _, r := range rawRows {
		if len(r) < 2 {
			continue
		}
		barcode := strings.TrimSpace(r[0])
		name := strings.TrimSpace(r[1])
		if barcode == "" || name == "" {
			continue
		}
		rows = append(rows, BulkImportRow{
			Barcode:    barcode,
			Name:       name,
			Qty:        parseEuropeanNumber(safeCol(r, 2)),
			PrixAchat:  parseEuropeanNumber(safeCol(r, 4)),
			PrixVente1: parseEuropeanNumber(safeCol(r, 6)),
			PrixVente2: parseEuropeanNumber(safeCol(r, 7)),
			PrixVente3: parseEuropeanNumber(safeCol(r, 8)),
		})
	}
	return rows
}

// POST /api/super-admin/tenants/:tenantId/products/import
// Accepts multipart form: file (.xlsx, .xls, .csv) + conflict_mode (skip|update)
func HandleBulkImport(c *fiber.Ctx) error {
	tenantID := c.Params("tenantId")
	conflictMode := c.FormValue("conflict_mode", "skip")

	fh, err := c.FormFile("file")
	if err != nil {
		return response.BadRequest(c, "file is required")
	}

	src, err := fh.Open()
	if err != nil {
		return response.BadRequest(c, "cannot read file")
	}
	defer src.Close()

	ext := strings.ToLower(filepath.Ext(fh.Filename))
	var rawRows [][]string

	switch ext {
	case ".csv":
		reader := csv.NewReader(src)
		reader.LazyQuotes = true
		rawRows, err = reader.ReadAll()
		if err != nil {
			return response.BadRequest(c, "invalid CSV file: "+err.Error())
		}
	case ".xlsx", ".xls":
		f, xerr := excelize.OpenReader(src)
		if xerr != nil {
			// Fallback: try parsing as CSV (file may be CSV with wrong extension)
			src.Close()
			src2, err2 := fh.Open()
			if err2 != nil {
				return response.BadRequest(c, "invalid Excel file: "+xerr.Error())
			}
			defer src2.Close()
			reader := csv.NewReader(src2)
			reader.LazyQuotes = true
			rawRows, err = reader.ReadAll()
			if err != nil {
				return response.BadRequest(c, "invalid Excel file: "+xerr.Error())
			}
			break
		}
		defer f.Close()
		sheet := f.GetSheetName(0)
		rawRows, err = f.GetRows(sheet)
		if err != nil {
			return response.BadRequest(c, "cannot read sheet: "+err.Error())
		}
	default:
		return response.BadRequest(c, "unsupported file type (use .xlsx or .csv)")
	}

	rows := parseRows(rawRows)

	result, err := BulkImport(tenantID, rows, conflictMode)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	result.TotalRows = len(rawRows)
	return response.OK(c, result)
}

// POST /api/tenant/products/upload-image
func HandleUploadImage(c *fiber.Ctx) error {
	tenantID := middleware.GetClaims(c).TenantID

	file, err := c.FormFile("image")
	if err != nil {
		return response.BadRequest(c, "image file required")
	}

	if file.Size > 1*1024*1024 {
		return response.BadRequest(c, "image too large (max 1MB)")
	}

	ct := file.Header.Get("Content-Type")
	ext := ""
	switch ct {
	case "image/webp":
		ext = ".webp"
	case "image/jpeg":
		ext = ".jpg"
	case "image/png":
		ext = ".png"
	default:
		return response.BadRequest(c, "unsupported image type")
	}

	dir := fmt.Sprintf("./uploads/%s/products", tenantID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return response.Error(c, fiber.StatusInternalServerError, "storage error")
	}

	filename := primitive.NewObjectID().Hex() + ext
	savePath := fmt.Sprintf("%s/%s", dir, filename)
	if err := c.SaveFile(file, savePath); err != nil {
		return response.Error(c, fiber.StatusInternalServerError, "failed to save image")
	}

	url := fmt.Sprintf("/uploads/%s/products/%s", tenantID, filename)
	return response.OK(c, fiber.Map{"url": url})
}
