package main

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/ledongthuc/pdf"
)

// ---------------------------------------------------------------------------
// Document text extraction
//
// The create flow lets an owner attach a spec sheet or product doc so the AI
// writes from their real material. The browser can read .md and .txt on its
// own, but PDF and DOCX are container formats it cannot open — so those used to
// be "attached" in the UI while the model received nothing but the file name.
// An upload that silently contributes nothing is worse than one that is
// refused, because the owner believes the AI has read their document.
//
// Extraction happens here rather than in the browser: no multi-hundred-kilobyte
// parser in the app bundle, and DOCX is a zip of XML, which the standard
// library already handles.
// ---------------------------------------------------------------------------

// maxUploadBytes caps what will be parsed. Product docs are small; anything
// larger is either a mistake or an attempt to exhaust memory.
const maxUploadBytes = 20 << 20 // 20 MB

// maxExtractedChars is what actually reaches the model. Prompts have limits and
// the opening pages of a spec carry the useful material.
const maxExtractedChars = 20000

// ExtractedDoc is the result of reading one uploaded file.
type ExtractedDoc struct {
	Name      string `json:"name"`
	Kind      string `json:"kind"` // pdf | docx | text | unsupported
	Text      string `json:"text"`
	Chars     int    `json:"chars"`
	Pages     int    `json:"pages,omitempty"`
	Truncated bool   `json:"truncated"`
	// Reason is set when no text could be read, so the UI can say why instead
	// of listing the file as if it had been understood.
	Reason string `json:"reason,omitempty"`
}

func registerExtractRoutes(api *gin.RouterGroup) {
	api.POST("/context/extract", handleExtractDocument)
}

func handleExtractDocument(c *gin.Context) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no file uploaded (expected form field 'file')"})
		return
	}
	if fileHeader.Size > maxUploadBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{
			"error": fmt.Sprintf("file is %.1f MB; the limit is %d MB",
				float64(fileHeader.Size)/(1<<20), maxUploadBytes>>20),
		})
		return
	}

	f, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not open upload"})
		return
	}
	defer f.Close()

	data, err := io.ReadAll(io.LimitReader(f, maxUploadBytes))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read upload"})
		return
	}

	doc := extractDocument(fileHeader.Filename, data)
	c.JSON(http.StatusOK, doc)
}

// extractDocument dispatches on what the bytes actually are rather than on the
// file extension, because a browser's reported MIME type is not reliable.
func extractDocument(name string, data []byte) ExtractedDoc {
	doc := ExtractedDoc{Name: name}
	lower := strings.ToLower(name)

	switch {
	case bytes.HasPrefix(data, []byte("%PDF")) || strings.HasSuffix(lower, ".pdf"):
		doc.Kind = "pdf"
		text, pages, err := extractPDF(data)
		doc.Pages = pages
		if err != nil {
			doc.Reason = "this PDF's text could not be read (" + err.Error() +
				") — it may be a scan or an image-only export"
			return doc
		}
		doc.Text = text

	// DOCX/XLSX/PPTX are all zip archives; the "PK" magic identifies them.
	case bytes.HasPrefix(data, []byte("PK")) || strings.HasSuffix(lower, ".docx"):
		doc.Kind = "docx"
		text, err := extractDOCX(data)
		if err != nil {
			doc.Reason = "this file's text could not be read (" + err.Error() + ")"
			return doc
		}
		doc.Text = text

	case looksLikeText(data):
		doc.Kind = "text"
		doc.Text = string(data)

	default:
		doc.Kind = "unsupported"
		doc.Reason = "this file type carries no readable text, so the AI was not given its contents"
		return doc
	}

	doc.Text = collapseWhitespace(doc.Text)
	if doc.Text == "" && doc.Reason == "" {
		doc.Reason = "no text found in the document — it may contain only images"
	}
	if len(doc.Text) > maxExtractedChars {
		doc.Text = doc.Text[:maxExtractedChars]
		doc.Truncated = true
	}
	doc.Chars = len(doc.Text)
	return doc
}

// extractPDF pulls the plain text out of a PDF. The parser panics on some
// malformed files rather than returning an error, so it runs behind a recover:
// a bad upload must not take the server down.
func extractPDF(data []byte) (text string, pages int, err error) {
	defer func() {
		if r := recover(); r != nil {
			text, err = "", fmt.Errorf("malformed PDF")
		}
	}()

	r, err := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", 0, err
	}
	pages = r.NumPage()

	var b strings.Builder
	// Page-at-a-time, so one unreadable page does not lose the whole document.
	for i := 1; i <= pages; i++ {
		if b.Len() > maxExtractedChars {
			break
		}
		p := r.Page(i)
		if p.V.IsNull() {
			continue
		}
		content, perr := p.GetPlainText(nil)
		if perr != nil {
			continue
		}
		b.WriteString(content)
		b.WriteString("\n")
	}
	return b.String(), pages, nil
}

// extractDOCX reads word/document.xml out of the archive and keeps the text
// nodes. A DOCX is a zip of XML, so this needs nothing beyond the standard
// library.
func extractDOCX(data []byte) (string, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", fmt.Errorf("not a readable .docx archive")
	}

	var target *zip.File
	for _, f := range zr.File {
		if f.Name == "word/document.xml" {
			target = f
			break
		}
	}
	if target == nil {
		return "", fmt.Errorf("no word/document.xml inside — not a Word document")
	}

	rc, err := target.Open()
	if err != nil {
		return "", err
	}
	defer rc.Close()

	dec := xml.NewDecoder(io.LimitReader(rc, maxUploadBytes))
	var b strings.Builder
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			// Keep whatever was decoded before the error rather than losing it.
			break
		}
		switch t := tok.(type) {
		case xml.CharData:
			b.Write(t)
		case xml.StartElement:
			// Word encodes breaks as empty elements, which would otherwise run
			// every paragraph together into one line.
			if t.Name.Local == "p" || t.Name.Local == "br" || t.Name.Local == "tab" {
				b.WriteString("\n")
			}
		}
	}
	return b.String(), nil
}

// looksLikeText reports whether a buffer is plain text, by rejecting NUL bytes
// and anything with a high proportion of unprintable characters.
func looksLikeText(data []byte) bool {
	if len(data) == 0 {
		return false
	}
	sample := data
	if len(sample) > 4096 {
		sample = sample[:4096]
	}
	binary := 0
	for _, b := range sample {
		if b == 0 {
			return false
		}
		if b < 0x09 || (b > 0x0d && b < 0x20) {
			binary++
		}
	}
	return binary*100/len(sample) < 5
}

// collapseWhitespace trims the runs of blank lines and spaces that PDF and DOCX
// extraction leave behind, so the prompt carries content rather than padding.
func collapseWhitespace(s string) string {
	lines := strings.Split(s, "\n")
	out := make([]string, 0, len(lines))
	blank := 0
	for _, ln := range lines {
		ln = strings.TrimSpace(strings.Join(strings.Fields(ln), " "))
		if ln == "" {
			blank++
			if blank > 1 {
				continue
			}
		} else {
			blank = 0
		}
		out = append(out, ln)
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}
