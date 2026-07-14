// Package envvars implements `envman env push/pull`: syncing a local .env file
// with a project environment's vars via the existing server endpoints.
package envvars

import (
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strings"

	"github.com/bipprojectbali/envman/cli/internal/api"
	"github.com/bipprojectbali/envman/cli/internal/auth"
)

// IsNotFound reports whether err is a 404 from the API (e.g. env not yet created).
func IsNotFound(err error) bool {
	var apiErr *api.APIError
	return errors.As(err, &apiErr) && apiErr.Status == 404
}

// Target is a project:env reference.
type Target struct {
	Slug string
	Env  string
}

// ParseTarget splits "project:env"; both sides required.
func ParseTarget(ref string) (Target, error) {
	idx := strings.IndexByte(ref, ':')
	if idx <= 0 || idx == len(ref)-1 {
		return Target{}, fmt.Errorf("[envman] ref tidak valid %q — format: project:env", ref)
	}
	return Target{Slug: ref[:idx], Env: ref[idx+1:]}, nil
}

func (t Target) varsBase() string {
	return fmt.Sprintf("/api/envman/projects/%s/environments/%s/vars",
		url.PathEscape(t.Slug), url.PathEscape(t.Env))
}

// exportResponse is the shape of GET vars/export.
type exportResponse struct {
	Vars          map[string]string `json:"vars"`
	DeniedImports []string          `json:"deniedImports"`
}

// FetchExisting returns the current vars of the target env (secrets masked as
// "***" unless the caller may reveal them), via GET vars/export.
func FetchExisting(cfg *auth.Config, t Target) (map[string]string, error) {
	var resp exportResponse
	if err := api.FetchJSON(cfg, t.varsBase()+"/export", &resp); err != nil {
		return nil, err
	}
	if resp.Vars == nil {
		resp.Vars = map[string]string{}
	}
	return resp.Vars, nil
}

// PushResult summarizes what a push changed.
type PushResult struct {
	Created []string
	Updated []string
	Secrets []string // keys stored as secret
}

// Push upserts vars into the target env. keys already secret on the server stay
// secret (server wins) — the caller passes those in via existingSecret. Secret
// classification for new/updated keys comes from detect() unless overridden.
//
// existing = current server vars (from FetchExisting) used to compute created vs
// updated and to preserve secret flags.
func Push(cfg *auth.Config, t Target, local map[string]string, existing map[string]string, secretKeys map[string]bool) (*PushResult, error) {
	res := &PushResult{}
	for k := range local {
		if _, ok := existing[k]; ok {
			res.Updated = append(res.Updated, k)
		} else {
			res.Created = append(res.Created, k)
		}
	}
	secrets := make([]string, 0, len(secretKeys))
	for k := range secretKeys {
		if _, ok := local[k]; ok { // only report secrets actually being pushed
			secrets = append(secrets, k)
		}
	}
	sort.Strings(res.Created)
	sort.Strings(res.Updated)
	sort.Strings(secrets)
	res.Secrets = secrets

	payload := map[string]any{"vars": local, "secrets": secrets}
	if err := api.Put(cfg, t.varsBase(), payload, nil); err != nil {
		return nil, err
	}
	return res, nil
}
