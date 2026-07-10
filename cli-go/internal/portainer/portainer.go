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

// ShortID trims a container ID to Docker's conventional 12-char short form.
func ShortID(id string) string {
	if len(id) > 12 {
		return id[:12]
	}
	return id
}

func (t Target) base() string {
	return fmt.Sprintf("/api/envman/projects/%s/environments/%s/portainer", url.PathEscape(t.Slug), url.PathEscape(t.Env))
}

// Container is one container in the stack (subset of the /containers response).
type Container struct {
	ShortID string   `json:"shortId"`
	Names   []string `json:"names"`
	Image   string   `json:"image"`
	State   string   `json:"state"`
	Status  string   `json:"status"`
}

// StackStatus is the stack header from the /status response.
type StackStatus struct {
	ID      int    `json:"id"`
	Name    string `json:"name"`
	Status  int    `json:"status"`
	Type    int    `json:"type"`
	Created int64  `json:"createdAt"`
	Updated int64  `json:"updatedAt"`
}

// StatusContainer is one container in the /status response (richer than Container:
// carries the Docker status string, ports, and short id already trimmed).
type StatusContainer struct {
	ID     string   `json:"id"`
	Names  []string `json:"names"`
	Image  string   `json:"image"`
	Status string   `json:"status"`
	State  string   `json:"state"`
	Ports  []string `json:"ports"`
}

// StatusResult is the full /status response.
type StatusResult struct {
	Stack      StackStatus       `json:"stack"`
	Containers []StatusContainer `json:"containers"`
}

// Status fetches stack + container summary for an env.
func Status(cfg *auth.Config, t Target) (*StatusResult, error) {
	var out StatusResult
	if err := api.FetchJSON(cfg, t.base()+"/status", &out); err != nil {
		return nil, err
	}
	return &out, nil
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

// Mount is one bind/volume mount in the inspect response.
type Mount struct {
	Source      string `json:"source"`
	Destination string `json:"destination"`
	Mode        string `json:"mode"`
}

// ContainerStats is the resource summary (nil when container not running).
type ContainerStats struct {
	CPUPercent float64 `json:"cpuPercent"`
	MemUsageMB int     `json:"memUsageMB"`
	MemLimitMB int     `json:"memLimitMB"`
	MemPercent float64 `json:"memPercent"`
}

// Inspection is the detailed single-container view.
type Inspection struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Image        string          `json:"image"`
	State        string          `json:"state"`
	Running      bool            `json:"running"`
	StartedAt    string          `json:"startedAt"`
	RestartCount int             `json:"restartCount"`
	Health       string          `json:"health"`
	ExitCode     *int            `json:"exitCode"`
	Ports        []string        `json:"ports"`
	Mounts       []Mount         `json:"mounts"`
	Stats        *ContainerStats `json:"stats"`
}

// Inspect fetches detailed info for a single container.
func Inspect(cfg *auth.Config, t Target, containerID string) (*Inspection, error) {
	var out Inspection
	if err := api.FetchJSON(cfg, t.base()+"/inspect/"+url.PathEscape(containerID), &out); err != nil {
		return nil, err
	}
	return &out, nil
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
