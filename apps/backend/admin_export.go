package main

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ---------------------------------------------------------------------------
// Admin: exports
//
// Every admin table can leave the platform as a file. Operators reconcile
// against accounting, send lists to a colleague, or just want the numbers in a
// spreadsheet — refusing to export data is how a dashboard becomes a place
// where information goes to die.
//
// Four formats, all produced from the same rows so they cannot disagree:
//
//   xlsx  a real Excel workbook — written directly as OOXML inside a zip, so
//         there is no third-party dependency to keep patched
//   csv   opens anywhere, the safe default
//   tsv   for pasting straight into Sheets/Excel without a delimiter dialog
//   json  for anything programmatic
//
// Every export writes an audit row: bulk customer data leaving the system is
// exactly the kind of privileged action that has to be accountable.
// ---------------------------------------------------------------------------

// exportTable is rows already flattened to strings, plus the header. Formatting
// happens once, here, rather than three times per format.
type exportTable struct {
	Name   string
	Header []string
	Rows   [][]string
}

func registerAdminExportRoutes(admin *gin.RouterGroup) {
	admin.GET("/export/:dataset", handleAdminExport)
	admin.GET("/exports", handleAdminExportCatalog)
}

// handleAdminExportCatalog tells the UI what can be exported and how, so the
// download menu is never out of step with what the server supports.
func handleAdminExportCatalog(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"formats": []gin.H{
			{"id": "xlsx", "label": "Excel workbook (.xlsx)", "mime": xlsxMime},
			{"id": "csv", "label": "CSV (.csv)", "mime": "text/csv"},
			{"id": "tsv", "label": "Tab-separated (.tsv)", "mime": "text/tab-separated-values"},
			{"id": "json", "label": "JSON (.json)", "mime": "application/json"},
		},
		"datasets": []gin.H{
			{"id": "customers", "label": "Customers — registered, active, paying"},
			{"id": "subscriptions", "label": "Subscriptions"},
			{"id": "purchases", "label": "Credit purchases"},
			{"id": "issues", "label": "Reported issues"},
			{"id": "usage", "label": "AI usage log"},
			{"id": "operations", "label": "Generation operations"},
			{"id": "ledger", "label": "Credit ledger"},
			{"id": "audit", "label": "Admin audit trail"},
			{"id": "activity", "label": "Platform activity feed"},
			{"id": "all", "label": "Everything (multi-sheet workbook)"},
		},
		"note": "Add ?format=xlsx|csv|tsv|json and, on customers/issues, ?segment= or ?status= to export a filtered view.",
	})
}

func handleAdminExport(c *gin.Context) {
	dataset := strings.ToLower(c.Param("dataset"))
	format := strings.ToLower(defaultString(c.Query("format"), "xlsx"))

	tables, err := buildExport(c, dataset)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(tables) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "unknown dataset " + dataset})
		return
	}

	stamp := time.Now().UTC().Format("2006-01-02")
	base := fmt.Sprintf("palius-%s-%s", dataset, stamp)

	rowCount := 0
	for _, t := range tables {
		rowCount += len(t.Rows)
	}
	recordAudit(adminActor(c), "export", "dataset", dataset,
		fmt.Sprintf("%s · %d rows · %d sheet(s)", format, rowCount, len(tables)))

	switch format {
	case "csv", "tsv":
		sep := ','
		ext := "csv"
		mime := "text/csv; charset=utf-8"
		if format == "tsv" {
			sep, ext, mime = '\t', "tsv", "text/tab-separated-values; charset=utf-8"
		}
		body, err := writeDelimited(tables, sep)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		sendFile(c, base+"."+ext, mime, body)

	case "json":
		body, err := json.MarshalIndent(tablesToJSON(tables), "", "  ")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		sendFile(c, base+".json", "application/json; charset=utf-8", body)

	case "xlsx", "excel", "xls":
		body, err := writeXLSX(tables)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		sendFile(c, base+".xlsx", xlsxMime, body)

	default:
		c.JSON(http.StatusBadRequest, gin.H{
			"error":     "unsupported format " + format,
			"supported": []string{"xlsx", "csv", "tsv", "json"},
		})
	}
}

func sendFile(c *gin.Context, filename, mime string, body []byte) {
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	// The admin app reads the filename from JS, which cannot see the header
	// unless it is explicitly exposed to the cross-origin caller.
	c.Header("Access-Control-Expose-Headers", "Content-Disposition")
	c.Data(http.StatusOK, mime, body)
}

// ---------------------------------------------------------------------------
// Dataset builders
// ---------------------------------------------------------------------------

func buildExport(c *gin.Context, dataset string) ([]exportTable, error) {
	switch dataset {
	case "customers", "users":
		t, err := exportCustomers(c.Query("segment"), c.Query("q"))
		return oneTable(t, err)
	case "subscriptions":
		t, err := exportSubscriptions(c.Query("status"))
		return oneTable(t, err)
	case "purchases":
		t, err := exportPurchases(c.Query("status"))
		return oneTable(t, err)
	case "issues":
		t, err := exportIssues(c.Query("status"), c.Query("severity"), c.Query("category"))
		return oneTable(t, err)
	case "usage":
		t, err := exportUsage(queryInt(c, "limit", 5000))
		return oneTable(t, err)
	case "operations":
		t, err := exportOperations(queryInt(c, "limit", 5000))
		return oneTable(t, err)
	case "ledger":
		t, err := exportLedger(queryInt(c, "limit", 5000))
		return oneTable(t, err)
	case "audit":
		t, err := exportAudit(queryInt(c, "limit", 5000))
		return oneTable(t, err)
	case "activity":
		t, err := exportActivity(c)
		return oneTable(t, err)
	case "all":
		return exportEverything(c)
	default:
		return nil, fmt.Errorf("unknown dataset %q", dataset)
	}
}

func oneTable(t exportTable, err error) ([]exportTable, error) {
	if err != nil {
		return nil, err
	}
	return []exportTable{t}, nil
}

func exportEverything(c *gin.Context) ([]exportTable, error) {
	var out []exportTable
	for _, build := range []func() (exportTable, error){
		func() (exportTable, error) { return exportCustomers("", "") },
		func() (exportTable, error) { return exportSubscriptions("") },
		func() (exportTable, error) { return exportPurchases("") },
		func() (exportTable, error) { return exportIssues("", "", "") },
		func() (exportTable, error) { return exportLedger(5000) },
		func() (exportTable, error) { return exportOperations(5000) },
		func() (exportTable, error) { return exportUsage(5000) },
		func() (exportTable, error) { return exportAudit(5000) },
	} {
		t, err := build()
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, nil
}

func exportCustomers(segment, query string) (exportTable, error) {
	customers, err := loadCustomers()
	if err != nil {
		return exportTable{}, err
	}
	segment = strings.ToLower(strings.TrimSpace(segment))
	query = strings.ToLower(strings.TrimSpace(query))

	t := exportTable{
		Name: "Customers",
		Header: []string{
			"User ID", "Name", "Email", "Company", "Country", "Signup source",
			"Registered", "Last seen", "Active (30d)", "Active today", "Status",
			"Segment", "Plan", "Paying", "Subscription state", "Subscribed since",
			"Monthly USD", "Credit packs bought", "Credits purchased",
			"Pack spend USD", "Lifetime USD", "Included credits", "Credit balance",
			"Credits used (period)", "Utilization %", "Vendor cost USD",
			"Profit USD", "Operations", "Failed operations", "AI calls",
			"Open issues", "Total issues", "Flag",
		},
	}
	for _, cu := range customers {
		if !matchesSegment(cu, segment) {
			continue
		}
		if query != "" && !strings.Contains(
			strings.ToLower(cu.ID+" "+cu.Name+" "+cu.Email+" "+cu.Company+" "+cu.Plan+" "+cu.Country), query) {
			continue
		}
		t.Rows = append(t.Rows, []string{
			cu.ID, cu.Name, cu.Email, cu.Company, cu.Country, cu.Source,
			cu.RegisteredAt, cu.LastSeenAt, yn(cu.IsActive), yn(cu.ActiveToday),
			cu.Status, cu.Segment, cu.Plan, yn(cu.IsPaying), cu.SubscriptionState,
			cu.SubscribedSince, num(cu.MonthlyUSD), strconv.Itoa(cu.PurchaseCount),
			num(cu.PurchasedCredits), num(cu.PurchasedUSD), num(cu.LifetimeUSD),
			num(cu.IncludedCredits), num(cu.CreditBalance), num(cu.CreditsUsed),
			num(cu.UtilizationPct), num(cu.VendorCostUSD), num(cu.ProfitUSD),
			strconv.Itoa(cu.Operations), strconv.Itoa(cu.FailedOps),
			strconv.Itoa(cu.AICalls), strconv.Itoa(cu.OpenIssues),
			strconv.Itoa(cu.TotalIssues), cu.Flag,
		})
	}
	return t, nil
}

func exportSubscriptions(status string) (exportTable, error) {
	subs, err := listSubscriptions(status)
	if err != nil {
		return exportTable{}, err
	}
	t := exportTable{
		Name: "Subscriptions",
		Header: []string{
			"Subscription ID", "User ID", "Name", "Email", "Plan", "Status",
			"Monthly USD", "Interval", "Provider", "Started", "Period start",
			"Period end", "Canceled", "Cancel reason",
		},
	}
	for _, s := range subs {
		t.Rows = append(t.Rows, []string{
			s.ID, s.UserID, s.UserName, s.Email, s.Plan, s.Status, num(s.MonthlyUSD),
			s.Interval, s.Provider, s.StartedAt, s.PeriodStart, s.PeriodEnd,
			s.CanceledAt, s.CancelReason,
		})
	}
	return t, nil
}

func exportPurchases(status string) (exportTable, error) {
	purchases, err := listPurchases(status, 5000)
	if err != nil {
		return exportTable{}, err
	}
	t := exportTable{
		Name: "Credit purchases",
		Header: []string{
			"Purchase ID", "User ID", "Name", "Email", "Pack", "Credits",
			"Amount USD", "Status", "Provider", "Purchased", "Refunded",
		},
	}
	for _, p := range purchases {
		t.Rows = append(t.Rows, []string{
			p.ID, p.UserID, p.UserName, p.Email, p.PackID, num(p.Credits),
			num(p.AmountUSD), p.Status, p.Provider, p.CreatedAt, p.RefundedAt,
		})
	}
	return t, nil
}

func exportIssues(status, severity, category string) (exportTable, error) {
	issues, err := listIssues(issueFilter{
		Status: status, Severity: severity, Category: category, Limit: 500,
	})
	if err != nil {
		return exportTable{}, err
	}
	t := exportTable{
		Name: "Reported issues",
		Header: []string{
			"Issue ID", "Reported", "User ID", "Name", "Email", "Plan", "Category",
			"Severity", "Status", "Subject", "Description", "Page", "Platform",
			"Operation", "Contact email", "Assigned to", "Admin note", "Updated",
			"Resolved",
		},
	}
	for _, i := range issues {
		t.Rows = append(t.Rows, []string{
			i.ID, i.CreatedAt, i.UserID, i.UserName, i.UserEmail, i.UserPlan,
			i.Category, i.Severity, i.Status, i.Subject, i.Body, i.Page, i.Platform,
			i.OperationID, i.ContactEmail, i.AssignedTo, i.AdminNote, i.UpdatedAt,
			i.ResolvedAt,
		})
	}
	return t, nil
}

func exportUsage(limit int) (exportTable, error) {
	events, err := recentEvents(limit)
	if err != nil {
		return exportTable{}, err
	}
	t := exportTable{
		Name: "AI usage",
		Header: []string{
			"Event ID", "When", "User ID", "Name", "Task", "Provider", "Model",
			"Input tokens", "Output tokens", "Credits", "Cost USD",
		},
	}
	for _, e := range events {
		t.Rows = append(t.Rows, []string{
			strconv.FormatInt(e.ID, 10), e.CreatedAt, e.UserID, e.UserName,
			e.TaskType, e.Provider, e.Model, strconv.Itoa(e.InputTokens),
			strconv.Itoa(e.OutputTokens), num(e.CreditUnits), num(e.CostUSD),
		})
	}
	return t, nil
}

func exportOperations(limit int) (exportTable, error) {
	if limit <= 0 {
		limit = 5000
	}
	rows, err := db.Query(`SELECT `+opColumns+` FROM operations
		ORDER BY created_at DESC LIMIT ?`, limit)
	if err != nil {
		return exportTable{}, err
	}
	defer rows.Close()

	t := exportTable{
		Name: "Generation operations",
		Header: []string{
			"Operation ID", "Created", "Settled", "User ID", "State", "Modality",
			"Model", "Provider", "Intent", "Est units", "Est credits",
			"Actual units", "Unit kind", "Vendor USD", "Charged credits",
			"Billable USD", "Margin USD", "Vendor billed on failure", "Error",
		},
	}
	for rows.Next() {
		op, err := scanOperation(rows)
		if err != nil || op == nil {
			continue
		}
		t.Rows = append(t.Rows, []string{
			op.ID, op.CreatedAt, op.SettledAt, op.UserID, op.State, op.Modality,
			op.Model, op.Provider, op.Intent, num(op.EstUnits), num(op.EstCredits),
			num(op.ActualUnits), op.UnitKind, num(op.ActualVendorUSD),
			num(op.ChargedCredits), num(op.BillableUSD), num(op.MarginUSD),
			yn(op.VendorBilledOnFailure), op.Error,
		})
	}
	return t, nil
}

func exportLedger(limit int) (exportTable, error) {
	if limit <= 0 {
		limit = 5000
	}
	rows, err := db.Query(`
		SELECT l.id, l.user_id, COALESCE(u.name,''), l.entry_kind, l.delta,
		       COALESCE(l.operation_id,''), COALESCE(l.reason,''), l.created_at
		FROM credit_ledger l LEFT JOIN users u ON u.id = l.user_id
		ORDER BY l.created_at DESC, l.id DESC LIMIT ?`, limit)
	if err != nil {
		return exportTable{}, err
	}
	defer rows.Close()

	t := exportTable{
		Name:   "Credit ledger",
		Header: []string{"Entry ID", "When", "User ID", "Name", "Kind", "Delta", "Operation", "Reason"},
	}
	for rows.Next() {
		var id int64
		var uid, name, kind, opID, reason, at string
		var delta float64
		if rows.Scan(&id, &uid, &name, &kind, &delta, &opID, &reason, &at) != nil {
			continue
		}
		t.Rows = append(t.Rows, []string{
			strconv.FormatInt(id, 10), at, uid, name, kind, num(delta), opID, reason,
		})
	}
	return t, nil
}

func exportAudit(limit int) (exportTable, error) {
	entries, err := listAudit(limit)
	if err != nil {
		return exportTable{}, err
	}
	t := exportTable{
		Name:   "Admin audit",
		Header: []string{"Entry ID", "When", "Actor", "Action", "Target type", "Target ID", "Detail"},
	}
	for _, a := range entries {
		t.Rows = append(t.Rows, []string{
			strconv.FormatInt(a.ID, 10), a.CreatedAt, a.Actor, a.Action,
			a.TargetType, a.TargetID, a.Detail,
		})
	}
	return t, nil
}

// exportActivity reuses the live feed handler rather than duplicating its eight
// queries, by capturing its JSON response instead of sending it.
func exportActivity(c *gin.Context) (exportTable, error) {
	rec := &captureWriter{ResponseWriter: c.Writer, body: &bytes.Buffer{}}
	original := c.Writer
	c.Writer = rec
	handleAdminActivity(c)
	c.Writer = original

	var payload struct {
		Activity []ActivityItem `json:"activity"`
	}
	if err := json.Unmarshal(rec.body.Bytes(), &payload); err != nil {
		return exportTable{}, err
	}

	t := exportTable{
		Name:   "Activity",
		Header: []string{"When", "Kind", "Severity", "User ID", "User", "Event", "Detail", "Amount USD", "Ref"},
	}
	for _, a := range payload.Activity {
		t.Rows = append(t.Rows, []string{
			a.At, a.Kind, a.Severity, a.UserID, a.UserName, a.Title, a.Detail,
			num(a.AmountUSD), a.Ref,
		})
	}
	return t, nil
}

// captureWriter buffers a handler's body so it can be re-read. It deliberately
// does not forward the write: the caller re-encodes the data as a file.
type captureWriter struct {
	gin.ResponseWriter
	body *bytes.Buffer
}

func (w *captureWriter) Write(b []byte) (int, error)       { return w.body.Write(b) }
func (w *captureWriter) WriteString(s string) (int, error) { return w.body.WriteString(s) }

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

func writeDelimited(tables []exportTable, sep rune) ([]byte, error) {
	var buf bytes.Buffer
	// Excel needs a BOM to read UTF-8 CSV correctly on Windows.
	buf.WriteString("\uFEFF")

	w := csv.NewWriter(&buf)
	w.Comma = sep
	for i, t := range tables {
		if len(tables) > 1 {
			if i > 0 {
				_ = w.Write([]string{})
			}
			if err := w.Write([]string{"# " + t.Name}); err != nil {
				return nil, err
			}
		}
		if err := w.Write(t.Header); err != nil {
			return nil, err
		}
		for _, row := range t.Rows {
			if err := w.Write(row); err != nil {
				return nil, err
			}
		}
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}

func tablesToJSON(tables []exportTable) interface{} {
	sheets := make([]map[string]interface{}, 0, len(tables))
	for _, t := range tables {
		records := make([]map[string]string, 0, len(t.Rows))
		for _, row := range t.Rows {
			rec := map[string]string{}
			for i, h := range t.Header {
				if i < len(row) {
					rec[h] = row[i]
				}
			}
			records = append(records, rec)
		}
		sheets = append(sheets, map[string]interface{}{
			"sheet":   t.Name,
			"columns": t.Header,
			"rows":    records,
			"count":   len(records),
		})
	}
	return map[string]interface{}{
		"exportedAt": time.Now().UTC().Format(time.RFC3339),
		"sheets":     sheets,
	}
}

const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

// writeXLSX builds a real Excel workbook. An .xlsx is a zip of XML parts, so
// this is a few hundred bytes of boilerplate rather than a dependency — which
// matters for a file format that only ever needs writing, never parsing.
//
// Numbers are written as numeric cells so Excel can sum them; everything else
// goes out as an inline string, which avoids a shared-string table entirely.
func writeXLSX(tables []exportTable) ([]byte, error) {
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)

	write := func(name, content string) error {
		f, err := z.Create(name)
		if err != nil {
			return err
		}
		_, err = f.Write([]byte(content))
		return err
	}

	// Content types: one override per sheet.
	var types strings.Builder
	types.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
		`<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
		`<Default Extension="xml" ContentType="application/xml"/>` +
		`<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
		`<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`)
	for i := range tables {
		fmt.Fprintf(&types, `<Override PartName="/xl/worksheets/sheet%d.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`, i+1)
	}
	types.WriteString(`</Types>`)
	if err := write("[Content_Types].xml", types.String()); err != nil {
		return nil, err
	}

	if err := write("_rels/.rels",
		`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
			`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`+
			`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`+
			`</Relationships>`); err != nil {
		return nil, err
	}

	var wb, rels strings.Builder
	wb.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
		`xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>`)
	rels.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`)
	for i, t := range tables {
		fmt.Fprintf(&wb, `<sheet name="%s" sheetId="%d" r:id="rId%d"/>`,
			xmlEscape(sheetName(t.Name, i)), i+1, i+1)
		fmt.Fprintf(&rels, `<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"/>`, i+1, i+1)
	}
	wb.WriteString(`</sheets></workbook>`)
	fmt.Fprintf(&rels, `<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`, len(tables)+1)
	rels.WriteString(`</Relationships>`)

	if err := write("xl/workbook.xml", wb.String()); err != nil {
		return nil, err
	}
	if err := write("xl/_rels/workbook.xml.rels", rels.String()); err != nil {
		return nil, err
	}

	// Two styles: normal (0) and bold (1), used for the header row.
	if err := write("xl/styles.xml",
		`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
			`<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`+
			`<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>`+
			`<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`+
			`<fills count="1"><fill><patternFill patternType="none"/></fill></fills>`+
			`<borders count="1"><border/></borders>`+
			`<cellStyleXfs count="1"><xf/></cellStyleXfs>`+
			`<cellXfs count="2"><xf xfId="0"/><xf fontId="1" applyFont="1" xfId="0"/></cellXfs>`+
			`</styleSheet>`); err != nil {
		return nil, err
	}

	for i, t := range tables {
		if err := write(fmt.Sprintf("xl/worksheets/sheet%d.xml", i+1), sheetXML(t)); err != nil {
			return nil, err
		}
	}

	if err := z.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func sheetXML(t exportTable) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`)

	// Freeze the header row — every one of these tables is long enough that
	// scrolling without it is guesswork.
	b.WriteString(`<sheetViews><sheetView workbookViewId="0">` +
		`<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
		`</sheetView></sheetViews>`)
	b.WriteString(`<sheetFormatPr defaultRowHeight="15"/>`)
	b.WriteString(`<sheetData>`)

	b.WriteString(`<row r="1">`)
	for i, h := range t.Header {
		fmt.Fprintf(&b, `<c r="%s1" s="1" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>`,
			columnRef(i), xmlEscape(h))
	}
	b.WriteString(`</row>`)

	for r, row := range t.Rows {
		fmt.Fprintf(&b, `<row r="%d">`, r+2)
		for i, cell := range row {
			ref := fmt.Sprintf("%s%d", columnRef(i), r+2)
			if cell == "" {
				continue
			}
			if isNumeric(cell) {
				fmt.Fprintf(&b, `<c r="%s"><v>%s</v></c>`, ref, cell)
				continue
			}
			fmt.Fprintf(&b, `<c r="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>`,
				ref, xmlEscape(cell))
		}
		b.WriteString(`</row>`)
	}

	b.WriteString(`</sheetData>`)
	if len(t.Header) > 0 {
		fmt.Fprintf(&b, `<autoFilter ref="A1:%s%d"/>`, columnRef(len(t.Header)-1), len(t.Rows)+1)
	}
	b.WriteString(`</worksheet>`)
	return b.String()
}

// columnRef converts a zero-based index to a spreadsheet column: 0 -> A,
// 26 -> AA. These tables are wide enough to pass Z.
func columnRef(i int) string {
	name := ""
	for i >= 0 {
		name = string(rune('A'+i%26)) + name
		i = i/26 - 1
	}
	return name
}

// isNumeric reports whether a cell should be written as a number. Identifiers
// that merely look numeric are excluded by requiring the whole string to parse
// and rejecting leading zeros, which are meaningful in ids and phone numbers.
func isNumeric(s string) bool {
	if s == "" {
		return false
	}
	if len(s) > 1 && (s[0] == '0' && s[1] != '.') {
		return false
	}
	if _, err := strconv.ParseFloat(s, 64); err != nil {
		return false
	}
	return true
}

// sheetName trims to Excel's 31-character limit and strips the characters the
// format forbids, falling back to a positional name if nothing survives.
func sheetName(name string, index int) string {
	name = strings.Map(func(r rune) rune {
		if strings.ContainsRune(`:\/?*[]`, r) {
			return '-'
		}
		return r
	}, name)
	if len(name) > 31 {
		name = name[:31]
	}
	if strings.TrimSpace(name) == "" {
		return fmt.Sprintf("Sheet%d", index+1)
	}
	return name
}

func xmlEscape(s string) string {
	// Control characters are illegal in XML 1.0 and make Excel refuse the file.
	s = strings.Map(func(r rune) rune {
		if r < 0x20 && r != '\t' && r != '\n' && r != '\r' {
			return -1
		}
		return r
	}, s)
	var buf bytes.Buffer
	_ = xmlEscapeTo(&buf, s)
	return buf.String()
}

func xmlEscapeTo(buf *bytes.Buffer, s string) error {
	for _, r := range s {
		switch r {
		case '&':
			buf.WriteString("&amp;")
		case '<':
			buf.WriteString("&lt;")
		case '>':
			buf.WriteString("&gt;")
		case '"':
			buf.WriteString("&quot;")
		case '\'':
			buf.WriteString("&apos;")
		default:
			buf.WriteRune(r)
		}
	}
	return nil
}

func yn(b bool) string {
	if b {
		return "yes"
	}
	return "no"
}

func num(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
}
