package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx context.Context
}

type PDFDocument struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Path      string `json:"path"`
	PageCount int    `json:"pageCount"`
	Size      int64  `json:"size"`
	Data      string `json:"data"`
}

type PageSelection struct {
	Path string `json:"path"`
	Page int    `json:"page"`
}

type ExportResult struct {
	Path  string `json:"path"`
	Pages int    `json:"pages"`
}

func NewApp() *App { return &App{} }

func (a *App) startup(ctx context.Context) { a.ctx = ctx }

func (a *App) OpenPDFs() ([]PDFDocument, error) {
	paths, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Choose PDF files",
		Filters: []runtime.FileFilter{{DisplayName: "PDF documents", Pattern: "*.pdf"}},
	})
	if err != nil {
		return nil, fmt.Errorf("open file picker: %w", err)
	}

	documents := make([]PDFDocument, 0, len(paths))
	for _, path := range paths {
		doc, err := readPDF(path)
		if err != nil {
			return nil, err
		}
		documents = append(documents, doc)
	}
	return documents, nil
}

func readPDF(path string) (PDFDocument, error) {
	info, err := os.Stat(path)
	if err != nil {
		return PDFDocument{}, fmt.Errorf("read %q: %w", filepath.Base(path), err)
	}
	pageCount, err := api.PageCountFile(path)
	if err != nil {
		return PDFDocument{}, fmt.Errorf("%q is not a readable PDF: %w", filepath.Base(path), err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return PDFDocument{}, fmt.Errorf("load %q: %w", filepath.Base(path), err)
	}
	return PDFDocument{
		ID:        fmt.Sprintf("%x-%d", info.ModTime().UnixNano(), info.Size()),
		Name:      filepath.Base(path),
		Path:      path,
		PageCount: pageCount,
		Size:      info.Size(),
		Data:      base64.StdEncoding.EncodeToString(data),
	}, nil
}

func (a *App) ExportPDF(pages []PageSelection, suggestedName string) (ExportResult, error) {
	if len(pages) == 0 {
		return ExportResult{}, errors.New("select at least one page before exporting")
	}
	if strings.TrimSpace(suggestedName) == "" {
		suggestedName = "Paperweave.pdf"
	}
	if !strings.HasSuffix(strings.ToLower(suggestedName), ".pdf") {
		suggestedName += ".pdf"
	}

	outPath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export combined PDF",
		DefaultFilename: suggestedName,
		Filters:         []runtime.FileFilter{{DisplayName: "PDF document", Pattern: "*.pdf"}},
	})
	if err != nil {
		return ExportResult{}, fmt.Errorf("open save dialog: %w", err)
	}
	if outPath == "" {
		return ExportResult{}, nil
	}

	tempDir, err := os.MkdirTemp("", "paperweave-export-")
	if err != nil {
		return ExportResult{}, fmt.Errorf("create export workspace: %w", err)
	}
	defer os.RemoveAll(tempDir)

	pageFiles := make([]string, 0, len(pages))
	for i, selection := range pages {
		if selection.Page < 1 {
			return ExportResult{}, fmt.Errorf("invalid page at position %d", i+1)
		}
		pageFile := filepath.Join(tempDir, fmt.Sprintf("page-%06d.pdf", i+1))
		if err := api.TrimFile(selection.Path, pageFile, []string{strconv.Itoa(selection.Page)}, nil); err != nil {
			return ExportResult{}, fmt.Errorf("extract page %d from %q: %w", selection.Page, filepath.Base(selection.Path), err)
		}
		pageFiles = append(pageFiles, pageFile)
	}

	if err := api.MergeCreateFile(pageFiles, outPath, false, nil); err != nil {
		return ExportResult{}, fmt.Errorf("combine pages: %w", err)
	}
	return ExportResult{Path: outPath, Pages: len(pages)}, nil
}
