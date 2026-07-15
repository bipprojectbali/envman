// Package projects implements `envman projects`: listing projects and their
// environments via the existing server endpoints.
package projects

import (
	"net/url"

	"github.com/bipprojectbali/envman/cli/internal/api"
	"github.com/bipprojectbali/envman/cli/internal/auth"
)

// Project is one entry of GET /api/envman/projects (subset of fields).
type Project struct {
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	CreatedByID string `json:"createdById"`
	CreatedBy   struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Email string `json:"email"`
	} `json:"createdBy"`
	MyRole string `json:"myRole"`
	Count  struct {
		Environments int `json:"environments"`
	} `json:"_count"`
	Environments []struct {
		Name string `json:"name"`
	} `json:"environments"`
}

// List returns all projects visible to the caller.
func List(cfg *auth.Config) ([]Project, error) {
	var resp struct {
		Projects []Project `json:"projects"`
	}
	if err := api.FetchJSON(cfg, "/api/envman/projects", &resp); err != nil {
		return nil, err
	}
	return resp.Projects, nil
}

// Detail is GET /api/envman/projects/:slug (subset: name + environments).
type Detail struct {
	Slug         string `json:"slug"`
	Name         string `json:"name"`
	MyRole       string `json:"myRole"`
	Environments []struct {
		Name       string `json:"name"`
		AccessRole string `json:"accessRole"`
		Count      struct {
			Vars int `json:"vars"`
		} `json:"_count"`
	} `json:"environments"`
}

// Get returns one project's detail, including its environments.
func Get(cfg *auth.Config, slug string) (*Detail, error) {
	var resp struct {
		Project Detail `json:"project"`
	}
	if err := api.FetchJSON(cfg, "/api/envman/projects/"+url.PathEscape(slug), &resp); err != nil {
		return nil, err
	}
	return &resp.Project, nil
}

// FilterMine returns only the projects created by userID.
func FilterMine(list []Project, userID string) []Project {
	out := make([]Project, 0, len(list))
	for _, p := range list {
		if p.CreatedByID == userID {
			out = append(out, p)
		}
	}
	return out
}

// CurrentUserID returns the authenticated user's id (for --me filtering).
func CurrentUserID(cfg *auth.Config) (string, error) {
	var resp struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	if err := api.FetchJSON(cfg, "/api/envman/whoami", &resp); err != nil {
		return "", err
	}
	return resp.User.ID, nil
}
