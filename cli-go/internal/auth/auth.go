package auth

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type Config struct {
	Server string `json:"server"`
	Token  string `json:"token"`
}

func ConfigDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".config", "envman")
}

func ConfigFile() string {
	return filepath.Join(ConfigDir(), "config.json")
}

// Resolve returns auth config. Priority (high→low):
// 1. ENVMAN_SERVER + ENVMAN_TOKEN from system env
// 2. ~/.config/envman/config.json
// Does NOT load from -e file vars (handled upstream in run.go).
func Resolve() (*Config, error) {
	server := os.Getenv("ENVMAN_SERVER")
	token := os.Getenv("ENVMAN_TOKEN")
	if server != "" && token != "" {
		return &Config{Server: server, Token: token}, nil
	}

	data, err := os.ReadFile(ConfigFile())
	if err != nil {
		return nil, fmt.Errorf("not logged in: run 'envman login <server> --token <token>'")
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("corrupted config file: %w", err)
	}
	if cfg.Server == "" || cfg.Token == "" {
		return nil, fmt.Errorf("incomplete config: run 'envman login <server> --token <token>'")
	}
	return &cfg, nil
}

func ResolveWithEnvFile(envFileVars map[string]string) (*Config, error) {
	// Priority 1: vars from -e file that contain ENVMAN_SERVER + ENVMAN_TOKEN
	s := envFileVars["ENVMAN_SERVER"]
	t := envFileVars["ENVMAN_TOKEN"]
	if s != "" && t != "" {
		return &Config{Server: s, Token: t}, nil
	}
	return Resolve()
}

func Save(cfg *Config) error {
	dir := ConfigDir()
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(ConfigFile(), data, 0600)
}

func Remove() error {
	f := ConfigFile()
	if _, err := os.Stat(f); os.IsNotExist(err) {
		return nil
	}
	return os.Remove(f)
}

func SavedServerURL() string {
	data, err := os.ReadFile(ConfigFile())
	if err != nil {
		return ""
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return ""
	}
	return cfg.Server
}
