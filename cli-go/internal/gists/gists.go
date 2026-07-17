// Package gists implements `envman gists`: list, search, get, push, pull and
// remove gists via the server's gist endpoints. A gist holds one or more files
// and is identified either by its UUID or, per user, by its unique title.
package gists

import (
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/api"
	"github.com/bipprojectbali/envman/cli/internal/auth"
)

// ErrNotFound is returned by ResolveByName when no gist with that title exists
// for the caller.
var ErrNotFound = errors.New("gist tidak ditemukan")

// File is one file within a gist.
type File struct {
	Filename string `json:"filename"`
	Content  string `json:"content"`
	Language string `json:"language"`
}

// Gist is the subset of a gist record the CLI uses.
type Gist struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Files       []File    `json:"files"`
	IsPublic    bool      `json:"isPublic"`
	Tags        []string  `json:"tags"`
	UpdatedAt   time.Time `json:"updatedAt"`
	User        struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"user"`
}

// ListOptions filters and paginates a gist listing.
type ListOptions struct {
	Limit  int
	Cursor string
	Search string
	Tags   []string
}

// ListResult is the server's paginated list response.
type ListResult struct {
	Gists      []Gist `json:"gists"`
	NextCursor string `json:"nextCursor"`
	Total      int    `json:"total"`
}

// List returns gists visible to the caller (own + public), optionally filtered.
func List(cfg *auth.Config, opts ListOptions) (*ListResult, error) {
	q := url.Values{}
	if opts.Limit > 0 {
		q.Set("limit", strconv.Itoa(opts.Limit))
	}
	if opts.Cursor != "" {
		q.Set("cursor", opts.Cursor)
	}
	if opts.Search != "" {
		q.Set("search", opts.Search)
	}
	if len(opts.Tags) > 0 {
		q.Set("tags", strings.Join(opts.Tags, ","))
	}
	path := "/api/envman/gists"
	if enc := q.Encode(); enc != "" {
		path += "?" + enc
	}
	var res ListResult
	if err := api.FetchJSON(cfg, path, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

// Get returns one gist by its UUID.
func Get(cfg *auth.Config, id string) (*Gist, error) {
	// The list endpoint returns full records; find the gist by id there so we
	// reuse a single access-checked path rather than the public-only :id route.
	res, err := List(cfg, ListOptions{Limit: 100})
	if err != nil {
		return nil, err
	}
	for i := range res.Gists {
		if res.Gists[i].ID == id {
			return &res.Gists[i], nil
		}
	}
	// Fall back to paging in case it's past the first 100.
	cursor := res.NextCursor
	for cursor != "" {
		page, err := List(cfg, ListOptions{Limit: 100, Cursor: cursor})
		if err != nil {
			return nil, err
		}
		for i := range page.Gists {
			if page.Gists[i].ID == id {
				return &page.Gists[i], nil
			}
		}
		cursor = page.NextCursor
	}
	return nil, ErrNotFound
}

// ResolveByName finds the caller's own gist with an exact title match. selfID is
// the caller's user id (from whoami) so public gists of the same title owned by
// others are not accidentally matched.
func ResolveByName(cfg *auth.Config, title, selfID string) (*Gist, error) {
	res, err := List(cfg, ListOptions{Limit: 100, Search: title})
	if err != nil {
		return nil, err
	}
	for i := range res.Gists {
		g := &res.Gists[i]
		if g.Title == title && g.User.ID == selfID {
			return g, nil
		}
	}
	return nil, ErrNotFound
}

// Resolve returns a gist by ref, which is a UUID (looked up directly) or a title
// (resolved against the caller's own gists).
func Resolve(cfg *auth.Config, ref, selfID string) (*Gist, error) {
	if looksLikeUUID(ref) {
		return Get(cfg, ref)
	}
	return ResolveByName(cfg, ref, selfID)
}

// CreateInput is the payload for creating a gist.
type CreateInput struct {
	Title       string   `json:"title"`
	Description string   `json:"description,omitempty"`
	Files       []File   `json:"files"`
	IsPublic    bool     `json:"isPublic"`
	Tags        []string `json:"tags,omitempty"`
}

// Create makes a new gist.
func Create(cfg *auth.Config, in CreateInput) (*Gist, error) {
	var res struct {
		Gist Gist `json:"gist"`
	}
	if err := api.Post(cfg, "/api/envman/gists", in, &res); err != nil {
		return nil, err
	}
	return &res.Gist, nil
}

// UpdateInput is the payload for updating a gist; omitted fields are unchanged.
type UpdateInput struct {
	Title       *string   `json:"title,omitempty"`
	Description *string   `json:"description,omitempty"`
	Files       []File    `json:"files,omitempty"`
	IsPublic    *bool     `json:"isPublic,omitempty"`
	Tags        *[]string `json:"tags,omitempty"`
}

// Update edits an existing gist by id.
func Update(cfg *auth.Config, id string, in UpdateInput) (*Gist, error) {
	var res struct {
		Gist Gist `json:"gist"`
	}
	if err := api.Put(cfg, "/api/envman/gists/"+url.PathEscape(id), in, &res); err != nil {
		return nil, err
	}
	return &res.Gist, nil
}

// Delete removes a gist by id.
func Delete(cfg *auth.Config, id string) error {
	return api.Delete(cfg, "/api/envman/gists/"+url.PathEscape(id))
}

// FmtBytes renders a byte count as a short human string (B/KB/MB).
func FmtBytes(n int) string {
	switch {
	case n < 1024:
		return fmt.Sprintf("%dB", n)
	case n < 1024*1024:
		return fmt.Sprintf("%.1fKB", float64(n)/1024)
	default:
		return fmt.Sprintf("%.1fMB", float64(n)/(1024*1024))
	}
}
