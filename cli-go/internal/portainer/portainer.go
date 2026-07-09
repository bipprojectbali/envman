// Package portainer implements the `envman portainer` subcommands: thin client
// over the server's env-scoped Portainer endpoints. The server holds the
// connection/stack/endpoint config per env, so the CLI only needs project:env.
package portainer

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/bipprojectbali/envman/cli/internal/api"
	"github.com/bipprojectbali/envman/cli/internal/auth"
)

// Target is a parsed `project:env` reference.
type Target struct {
	Slug string
	Env  string
}

// ParseTarget splits "project:env" into its parts. Both sides are required.
func ParseTarget(ref string) (Target, error) {
	idx := strings.IndexByte(ref, ':')
	if idx <= 0 || idx == len(ref)-1 {
		return Target{}, fmt.Errorf("[envman] ref tidak valid %q — format: project:env", ref)
	}
	return Target{Slug: ref[:idx], Env: ref[idx+1:]}, nil
}

func (t Target) base() string {
	return fmt.Sprintf("/api/envman/projects/%s/environments/%s/portainer", url.PathEscape(t.Slug), url.PathEscape(t.Env))
}

// Container is one container in the stack (subset of server response).
type Container struct {
	ShortID string   `json:"shortId"`
	Names   []string `json:"names"`
	Image   string   `json:"image"`
	State   string   `json:"state"`
	Status  string   `json:"status"`
}

// Status fetches stack + container summary for an env.
func Status(cfg *auth.Config, t Target) (map[string]any, error) {
	var out map[string]any
	if err := api.FetchJSON(cfg, t.base()+"/status", &out); err != nil {
		return nil, err
	}
	return out, nil
}

// Ps lists containers of the env's stack.
func Ps(cfg *auth.Config, t Target) ([]Container, error) {
	var out struct {
		Containers []Container `json:"containers"`
	}
	if err := api.FetchJSON(cfg, t.base()+"/containers", &out); err != nil {
		return nil, err
	}
	return out.Containers, nil
}

// action names map to server POST endpoints under the env base.
var actionPaths = map[string]string{
	"restart-soft":     "/restart",
	"restart-recreate": "/recreate",
	"restart-repull":   "/repull",
	"sync-repull":      "/sync-repull",
	"prune":            "/prune/images",
}

// Action runs a POST lifecycle/maintenance action and returns the raw result map.
func Action(cfg *auth.Config, t Target, action string) (map[string]any, error) {
	path, ok := actionPaths[action]
	if !ok {
		return nil, fmt.Errorf("[envman] aksi tidak dikenal: %s", action)
	}
	var out map[string]any
	if err := api.Post(cfg, t.base()+path, struct{}{}, &out); err != nil {
		return nil, err
	}
	return out, nil
}
