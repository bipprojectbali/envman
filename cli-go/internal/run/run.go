package run

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/api"
	"github.com/bipprojectbali/envman/cli/internal/auth"
	"github.com/bipprojectbali/envman/cli/internal/envparser"
)

var httpClient = &http.Client{Timeout: 30 * time.Second}

// isProjectFileRef returns true if the token after ":" refers to a file.
// Rules: has "/" OR has a "." extension → file reference; else → env name.
func isProjectFileRef(colonPart string) bool {
	return strings.Contains(colonPart, "/") || strings.Contains(colonPart, ".")
}

// parseSource splits a source string into (project, env, localFile).
// "project:env" → project+env
// "/path/to/file" or "./file" or relative without ":" → localFile
// "project:path/to/file.sh" → localFile reference (file ref, not env)
func parseSource(s string) (project, env, localFile string) {
	idx := strings.IndexByte(s, ':')
	if idx < 0 {
		// No colon → local file
		localFile = s
		return
	}
	proj := s[:idx]
	rest := s[idx+1:]
	if isProjectFileRef(rest) {
		// Treat as local file path that happens to have colon notation
		localFile = s
		return
	}
	project = proj
	env = rest
	return
}

// fetchServerVars fetches vars for a project:env from the server.
func fetchServerVars(cfg *auth.Config, project, envName string) (map[string]string, error) {
	path := fmt.Sprintf("/api/envman/projects/%s/environments/%s/vars/export",
		url.PathEscape(project), url.PathEscape(envName))
	var result struct {
		Vars []struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		} `json:"vars"`
	}
	if err := api.FetchJSON(cfg, path, &result); err != nil {
		return nil, err
	}
	m := make(map[string]string, len(result.Vars))
	for _, v := range result.Vars {
		m[v.Key] = v.Value
	}
	return m, nil
}

// Run injects env vars from sources into command and executes it.
// Sources are resolved in order; later sources override earlier.
// System env takes lowest priority (unless serverWins=true).
func Run(sources []string, command []string, serverWins bool) error {
	merged := make(map[string]string)

	// Resolve auth using vars from the first local -e file that has ENVMAN_SERVER/ENVMAN_TOKEN
	var fileVars map[string]string
	for _, s := range sources {
		_, _, localFile := parseSource(s)
		if localFile != "" {
			fv, err := envparser.ParseFile(localFile)
			if err != nil {
				return fmt.Errorf("load %s: %w", localFile, err)
			}
			if fv["ENVMAN_SERVER"] != "" && fv["ENVMAN_TOKEN"] != "" {
				fileVars = fv
				break
			}
		}
	}

	var cfg *auth.Config
	var cfgErr error
	if fileVars != nil {
		cfg, cfgErr = auth.ResolveWithEnvFile(fileVars)
	} else {
		cfg, cfgErr = auth.Resolve()
	}

	// Process sources in order (later wins per-key)
	for _, s := range sources {
		project, envName, localFile := parseSource(s)
		switch {
		case localFile != "":
			fv, err := envparser.ParseFile(localFile)
			if err != nil {
				return fmt.Errorf("load %s: %w", localFile, err)
			}
			for k, v := range fv {
				merged[k] = v
			}
		case project != "" && envName != "":
			if cfgErr != nil {
				return fmt.Errorf("need auth to fetch %s:%s — %w", project, envName, cfgErr)
			}
			sv, err := fetchServerVars(cfg, project, envName)
			if err != nil {
				return err
			}
			for k, v := range sv {
				merged[k] = v
			}
		}
	}

	// Check if first command arg is a file reference (e.g. "bash myapp:scripts/deploy.sh")
	fileContent, command, err := resolveFileArg(cfg, command)
	if err != nil {
		return err
	}

	// Strip ENVMAN_SERVER and ENVMAN_TOKEN from child env
	delete(merged, "ENVMAN_SERVER")
	delete(merged, "ENVMAN_TOKEN")

	// Build child environment
	var childEnv []string
	if serverWins {
		// System env wins: start from merged, then overwrite with system vars.
		// Using a map to avoid undefined behavior from duplicate keys in env slice.
		sysWin := make(map[string]string)
		for k, v := range merged {
			sysWin[k] = v
		}
		for _, e := range os.Environ() {
			idx := strings.IndexByte(e, '=')
			if idx < 0 {
				continue
			}
			sysWin[e[:idx]] = e[idx+1:] // system overwrites merged
		}
		delete(sysWin, "ENVMAN_SERVER")
		delete(sysWin, "ENVMAN_TOKEN")
		for k, v := range sysWin {
			childEnv = append(childEnv, k+"="+v)
		}
	} else {
		// merged wins: start with system, override with merged
		sysEnv := make(map[string]string)
		for _, e := range os.Environ() {
			idx := strings.IndexByte(e, '=')
			if idx < 0 {
				continue
			}
			sysEnv[e[:idx]] = e[idx+1:]
		}
		for k, v := range merged {
			sysEnv[k] = v
		}
		delete(sysEnv, "ENVMAN_SERVER")
		delete(sysEnv, "ENVMAN_TOKEN")
		for k, v := range sysEnv {
			childEnv = append(childEnv, k+"="+v)
		}
	}

	if fileContent != "" {
		return execWithFileContent(command, fileContent, childEnv)
	}

	return execCommand(command, childEnv)
}

// resolveFileArg checks if command args contain a project file reference.
// Returns (fileContent, updatedCommand, error).
func resolveFileArg(cfg *auth.Config, command []string) (string, []string, error) {
	if len(command) < 2 {
		return "", command, nil
	}
	// Check if any arg after the interpreter is a project file ref
	for i := 1; i < len(command); i++ {
		arg := command[i]
		idx := strings.IndexByte(arg, ':')
		if idx < 0 {
			continue
		}
		proj := arg[:idx]
		rest := arg[idx+1:]
		if !isProjectFileRef(rest) {
			continue
		}
		// Found a file reference — resolve it
		if cfg == nil {
			return "", nil, fmt.Errorf("need auth to fetch file %s", arg)
		}
		content, err := fetchFileContent(cfg, proj, rest)
		if err != nil {
			return "", nil, err
		}
		// Remove the file ref from command args; keep interpreter and any args before/after
		newCmd := make([]string, 0, len(command)-1)
		newCmd = append(newCmd, command[:i]...)
		newCmd = append(newCmd, command[i+1:]...)
		return content, newCmd, nil
	}
	return "", command, nil
}

// fetchFileContent fetches a project file by slug:path from the server.
func fetchFileContent(cfg *auth.Config, slug, filePath string) (string, error) {
	// Normalize: strip leading "files:" prefix if someone passes it
	filePath = strings.TrimPrefix(filePath, "files:")

	apiPath := fmt.Sprintf("/api/envman/projects/%s/files/resolve?prefix=%s",
		url.PathEscape(slug), url.QueryEscape(filePath))

	body, err := api.Fetch(cfg, apiPath, true /* useCache */)
	if err != nil {
		return "", err
	}

	var result struct {
		Files []struct {
			Filename string `json:"filename"`
			Content  string `json:"content"`
		} `json:"files"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("parse file response: %w", err)
	}
	if len(result.Files) == 0 {
		return "", fmt.Errorf("file not found: %s:%s", slug, filePath)
	}
	return result.Files[0].Content, nil
}

// stdinInterpreters maps interpreter names to their stdin-pipe flags.
var stdinInterpreters = map[string][]string{
	"bash":    {"-s"},
	"sh":      {"-s"},
	"zsh":     {"-s"},
	"bun":     {"run", "-"},
	"node":    {"--input-type=module"},
	"python3": {"-"},
	"python":  {"-"},
	"deno":    {"run", "-"},
}

// bunExtraFlags returns extra flags for bun to support inline npm imports.
func bunExtraFlags() []string {
	return []string{"--install=fallback"}
}

func execWithFileContent(command []string, content string, env []string) error {
	if len(command) == 0 {
		return fmt.Errorf("no interpreter specified")
	}
	interpreter := command[0]
	extraArgs := command[1:]

	stdinFlags, isStdin := stdinInterpreters[interpreter]

	if isStdin {
		args := stdinFlags
		if interpreter == "bun" {
			args = append(bunExtraFlags(), args...)
		}
		args = append(args, extraArgs...)
		cmd := exec.Command(interpreter, args...)
		cmd.Env = env
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr

		stdin, err := cmd.StdinPipe()
		if err != nil {
			return err
		}
		if err := cmd.Start(); err != nil {
			return err
		}
		_, _ = io.WriteString(stdin, content)
		stdin.Close()
		return cmd.Wait()
	}

	// Temp file fallback for other interpreters
	ext := interpreterExt(interpreter)
	tmp, err := os.CreateTemp("", "envman-*"+ext)
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if err := os.Chmod(tmp.Name(), 0600); err != nil {
		return err
	}
	if _, err := io.WriteString(tmp, content); err != nil {
		return err
	}
	tmp.Close()

	args := append(extraArgs, tmp.Name())
	cmd := exec.Command(interpreter, args...)
	cmd.Env = env
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	return cmd.Run()
}

func execCommand(command []string, env []string) error {
	if len(command) == 0 {
		return fmt.Errorf("no command specified")
	}
	cmd := exec.Command(command[0], command[1:]...)
	cmd.Env = env
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	return cmd.Run()
}

func interpreterExt(interpreter string) string {
	m := map[string]string{
		"python3": ".py",
		"python":  ".py",
		"ruby":    ".rb",
		"perl":    ".pl",
	}
	if ext, ok := m[interpreter]; ok {
		return ext
	}
	return ""
}

// splitArgs splits a shell-like command string into tokens.
// Handles single/double quotes (no backslash escaping — sufficient for stored alias args).
func splitArgs(s string) []string {
	var tokens []string
	var cur strings.Builder
	inSingle, inDouble := false, false
	for _, ch := range s {
		switch {
		case ch == '\'' && !inDouble:
			inSingle = !inSingle
		case ch == '"' && !inSingle:
			inDouble = !inDouble
		case (ch == ' ' || ch == '\t' || ch == '\n') && !inSingle && !inDouble:
			if cur.Len() > 0 {
				tokens = append(tokens, cur.String())
				cur.Reset()
			}
		default:
			cur.WriteRune(ch)
		}
	}
	if cur.Len() > 0 {
		tokens = append(tokens, cur.String())
	}
	return tokens
}

// Alias resolves a project alias and runs it.
func Alias(sources []string, ref string, extraArgs []string) error {
	// Mirror auth resolution from Run(): scan -e files for ENVMAN_SERVER/ENVMAN_TOKEN
	var fileVars map[string]string
	for _, s := range sources {
		_, _, localFile := parseSource(s)
		if localFile != "" {
			fv, ferr := envparser.ParseFile(localFile)
			if ferr != nil {
				return fmt.Errorf("load %s: %w", localFile, ferr)
			}
			if fv["ENVMAN_SERVER"] != "" && fv["ENVMAN_TOKEN"] != "" {
				fileVars = fv
				break
			}
		}
	}

	var cfg *auth.Config
	var cfgErr error
	if fileVars != nil {
		cfg, cfgErr = auth.ResolveWithEnvFile(fileVars)
	} else {
		cfg, cfgErr = auth.Resolve()
	}
	if cfgErr != nil {
		return cfgErr
	}

	path := "/api/envman/aliases/resolve/" + url.PathEscape(ref)
	body, err := api.Fetch(cfg, path, true /* useCache */)
	if err != nil {
		return err
	}

	// Server returns: { "args": "<string>", "project": "<slug>", "alias": "<name>" }
	var result struct {
		Args    string `json:"args"`
		Project string `json:"project"`
		Alias   string `json:"alias"`
		Error   string `json:"error"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("parse alias response: %w", err)
	}
	if result.Error != "" {
		return fmt.Errorf("[envman] %s", result.Error)
	}

	// Split stored args string into tokens, then append any caller-supplied extra args
	aliasArgs := splitArgs(result.Args)
	allArgs := append(aliasArgs, extraArgs...)
	return parseAndRun(cfg, sources, allArgs)
}

// parseAndRun parses -e flags and command from args then calls Run.
func parseAndRun(cfg *auth.Config, extraSources []string, args []string) error {
	var sources []string
	// Extra sources come first (stored alias sources win per later-wins rule)
	sources = append(sources, extraSources...)

	var command []string
	serverWins := false
	i := 0
	for i < len(args) {
		switch args[i] {
		case "-e":
			if i+1 >= len(args) {
				return fmt.Errorf("-e requires a value")
			}
			sources = append(sources, args[i+1])
			i += 2
		case "--server-wins":
			serverWins = true
			i++
		case "--":
			command = args[i+1:]
			i = len(args)
		default:
			// Treat remaining as command (no -- separator needed for alias)
			command = args[i:]
			i = len(args)
		}
	}

	if len(command) == 0 {
		return fmt.Errorf("no command in alias args")
	}
	_ = cfg // cfg already resolved upstream
	return Run(sources, command, serverWins)
}

// ExpandFileRef checks if a command contains a project:file.ext arg and fetches the content.
// Used by the top-level command parser.
func ExpandFileRef(cfg *auth.Config, commandArgs []string) (content string, newArgs []string, err error) {
	return resolveFileArg(cfg, commandArgs)
}

// TmpFile creates a temp file with mode 0600 and returns the path. Caller must remove.
func TmpFile(ext string) (string, error) {
	f, err := os.CreateTemp("", "envman-*"+ext)
	if err != nil {
		return "", err
	}
	f.Close()
	if err := os.Chmod(f.Name(), 0600); err != nil {
		os.Remove(f.Name())
		return "", err
	}
	return f.Name(), nil
}

// AbsPath resolves a binary path for exec.
func AbsPath(name string) string {
	p, err := exec.LookPath(name)
	if err != nil {
		return name
	}
	abs, err := filepath.Abs(p)
	if err != nil {
		return p
	}
	return abs
}
