package docimport

import (
	"fmt"
	"testing"
)

func TestParseInvoice_Situation2(t *testing.T) {
	text := `Situation n°2
Sur DEVIS N°2

LIBELLE                                   CUMUL QT    PU. HT    %REAL   Px. GLOBAL   TVA    TOTAL HT

Fourniture et pose d'une porte bois de ramin
204 x 63 avec huisserie bois similaire (cloison
14cm)                                        10   U    424.28    100%    4 242.80    20%    4 242.80

Situation N°: 2 H.T. avant toute déduction                                           -2 121.40
Avoir N°: 1 sur Situation 2                                                              848.56

TOTAL H.T.                                                                            2 969.96

MONTANT HT DU MARCHE         4 242.80           MONTANT HT DES TRAVAUX REALISES          0.00
MONTANT TTC DU MARCHE         5 091.36           MONTANT TTC DES TRAVAUX REALISES         0.00

Taux de TVA    Base HT       Montant TVA        MONTANT H.T.                         2 969.96
20%            2 969.96      593.99              TVA GLOBALE                            593.99
                                                 MONTANT T.T.C. en Euros              3 563.95

Date de paiement :
                                                 RESTE A PAYER                        3 563.95`

	doc := ParseInvoiceText(text)

	fmt.Println("=== PARSE RESULT ===")
	fmt.Println("Invoice:", doc.SupplierInvoice)
	fmt.Println("Supplier:", doc.SupplierName)
	fmt.Println("Date:", doc.InvoiceDate)
	fmt.Printf("Totals: HT=%.2f TVA=%.2f TTC=%.2f\n", doc.TotalHT, doc.TotalVAT, doc.TotalTTC)
	fmt.Println("Lines:", len(doc.Lines))
	for i, l := range doc.Lines {
		fmt.Printf("  [%d] Name=%q Qty=%.0f PU=%.2f Total=%.2f VAT=%d%%\n",
			i, l.Name, l.Qty, l.UnitPrice, l.Total, l.VAT)
	}
	fmt.Println("Warnings:", doc.Warnings)

	// Assertions
	if doc.SupplierInvoice == "" {
		t.Error("expected invoice number to be detected")
	}
}

func TestParseInvoice_OCR_Messy(t *testing.T) {
	// Actual OCR output from screenshot — messy text with Arabic artifacts
	text := `Sur DEVIS N°2
LIBELLE CUMUL QT] PU.HT | xxx | yyy [wa] TOTAL HT
Fourniture et pose d'une porte bois de ramin
204 x 68 avec huisserie bois similaire (cloison 424.28 4242.80
14cm)
Situation N°: 2 HT. avant toute déduction -2121.40
Avoir N°: 1 sur Situation 2 848.56
MONTANT HT DU MARCHE 4 242.80 MONTANT HT DES TRAVAUX REALISES 0.00
MONTANT TTC DU MARCHE 5 091.36 MONTANT TTC DES TRAVAUX REALISES 0.00
Taux de TVA Base HT Montant TVA MONTANT H.T. 2960.96
2 969.96 TVA GLOBALE 503.00
Date de palement : MONTANT T.T.C. en Euros 3 563.95
RESTE A PAYER 3 563.95`

	doc := ParseInvoiceText(text)

	fmt.Println("=== OCR MESSY PARSE ===")
	fmt.Println("Invoice:", doc.SupplierInvoice)
	fmt.Printf("Totals: HT=%.2f TVA=%.2f TTC=%.2f\n", doc.TotalHT, doc.TotalVAT, doc.TotalTTC)
	fmt.Println("Lines:", len(doc.Lines))
	for i, l := range doc.Lines {
		fmt.Printf("  [%d] Name=%q Qty=%.0f PU=%.2f Total=%.2f\n", i, l.Name, l.Qty, l.UnitPrice, l.Total)
	}
	fmt.Println("Warnings:", doc.Warnings)

	if len(doc.Lines) == 0 {
		t.Fatal("expected at least 1 product line from OCR output")
	}
	l := doc.Lines[0]
	if l.UnitPrice != 424.28 {
		t.Errorf("expected unit_price=424.28, got %.2f", l.UnitPrice)
	}
	if l.Qty != 10 {
		t.Errorf("expected qty=10, got %.0f", l.Qty)
	}
}

// Test: Simple Algerian grocery invoice
func TestParseInvoice_SimpleAlgerian(t *testing.T) {
	text := `SARL Distribution Alger
Facture N° FA-2024-0158
Date: 15/03/2024

Désignation               Qté    PU HT      Total HT
Lait Candia 1L             50    85.00      4 250.00
Huile Elio 5L              20   650.00     13 000.00
Sucre blanc 1Kg           100    90.00      9 000.00

Total HT                                  26 250.00
TVA 19%                                    4 987.50
Total TTC                                 31 237.50`

	doc := ParseInvoiceText(text)
	fmt.Println("=== SIMPLE ALGERIAN ===")
	fmt.Printf("Supplier: %q Invoice: %q Date: %q\n", doc.SupplierName, doc.SupplierInvoice, doc.InvoiceDate)
	fmt.Printf("Lines: %d HT=%.2f TVA=%.2f TTC=%.2f\n", len(doc.Lines), doc.TotalHT, doc.TotalVAT, doc.TotalTTC)
	for i, l := range doc.Lines {
		fmt.Printf("  [%d] %q qty=%.0f pu=%.2f total=%.2f\n", i, l.Name, l.Qty, l.UnitPrice, l.Total)
	}

	if doc.SupplierName == "" { t.Error("expected supplier name") }
	if doc.SupplierInvoice == "" { t.Error("expected invoice number") }
	if doc.InvoiceDate == "" { t.Error("expected date") }
	if len(doc.Lines) != 3 { t.Fatalf("expected 3 lines, got %d", len(doc.Lines)) }
	if doc.Lines[0].Qty != 50 { t.Errorf("line 0: expected qty=50, got %.0f", doc.Lines[0].Qty) }
	if doc.Lines[0].UnitPrice != 85 { t.Errorf("line 0: expected pu=85, got %.2f", doc.Lines[0].UnitPrice) }
	// Lines 1,2 — verify at least name and price are detected
	if doc.Lines[1].Name == "" { t.Error("line 1: expected name") }
	if doc.Lines[1].UnitPrice <= 0 { t.Error("line 1: expected price > 0") }
	if doc.Lines[2].Name == "" { t.Error("line 2: expected name") }
}

// Test: Barcode-based invoice
func TestParseInvoice_WithBarcodes(t *testing.T) {
	text := `Facture N° 2024-001

Article                    Qté    Prix      Total
6111234567890 Coca Cola 33cl  24   45.00    1 080.00
6111234567891 Pepsi 33cl      24   43.00    1 032.00

Total HT    2 112.00`

	doc := ParseInvoiceText(text)
	fmt.Println("=== BARCODES ===")
	for i, l := range doc.Lines {
		fmt.Printf("  [%d] bc=%q name=%q qty=%.0f pu=%.2f\n", i, l.Barcode, l.Name, l.Qty, l.UnitPrice)
	}

	if len(doc.Lines) < 2 { t.Fatalf("expected 2 lines, got %d", len(doc.Lines)) }
	if doc.Lines[0].Barcode != "6111234567890" { t.Errorf("expected barcode, got %q", doc.Lines[0].Barcode) }
}

func TestParseInvoice_FrenchFacture(t *testing.T) {
	text := `Mon Entreprise                                    FACTURE
22, Avenue Voltaire
13000 Marseille
N° Siren ou Siret : 1234567-8
N° TVA intra. : FRXX 999999999

                              Date :          24.2.2021
                              Numéro de facture : 143
Client :                      Échéance :      10.3.2021
Michel Acheteur               Paiement :      30 jours
31, rue de la Forêt           Référence :     1436
13100 Aix-en-Provence

Informations additionnelles :
Service Après Vente : Garantie 1 an.

Description        Quantité   Unité    Prix unitaire HT   % TVA    Total TVA    Total TTC

Main-d'œuvre          5         h        60,00 €           20 %     60,00 €      360,00 €
Produit              10         pcs     105,00 €           20 %    270,00 €    1 260,00 €

                                        Total HT        1 350,00 €
                                        Total TVA         270,00 €
                                   Total TTC           1 620,00 €`

	doc := ParseInvoiceText(text)
	fmt.Println("=== FRENCH FACTURE ===")
	fmt.Printf("Supplier: %q Invoice: %q Date: %q\n", doc.SupplierName, doc.SupplierInvoice, doc.InvoiceDate)
	fmt.Printf("Lines: %d HT=%.2f TVA=%.2f TTC=%.2f\n", len(doc.Lines), doc.TotalHT, doc.TotalVAT, doc.TotalTTC)
	for i, l := range doc.Lines {
		fmt.Printf("  [%d] %q qty=%.0f pu=%.2f total=%.2f vat=%d%%\n", i, l.Name, l.Qty, l.UnitPrice, l.Total, l.VAT)
	}

	if len(doc.Lines) < 2 { t.Fatalf("expected 2 lines, got %d", len(doc.Lines)) }
	if doc.Lines[0].Name != "Main-d'œuvre" { t.Errorf("line 0: expected Main-d'œuvre, got %q", doc.Lines[0].Name) }
	if doc.Lines[0].Qty != 5 { t.Errorf("line 0: expected qty=5, got %.0f", doc.Lines[0].Qty) }
	if doc.Lines[0].UnitPrice != 60 { t.Errorf("line 0: expected pu=60, got %.2f", doc.Lines[0].UnitPrice) }
	if doc.Lines[1].Qty != 10 { t.Errorf("line 1: expected qty=10, got %.0f", doc.Lines[1].Qty) }
	if doc.Lines[1].UnitPrice != 105 { t.Errorf("line 1: expected pu=105, got %.2f", doc.Lines[1].UnitPrice) }
	if doc.TotalTTC != 1620 { t.Errorf("expected TTC=1620, got %.2f", doc.TotalTTC) }
}
