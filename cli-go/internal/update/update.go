package update

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/bipprojectbali/envman/cli/internal/auth"
)

const updateCheckInterval = 15 * time.Minute

type updateCheck struct {
	LatestVersion string `json:"latestVersion"`
	CurrentBinary string `json:"currentBinary"`
	CheckedAt     int64  `json:"checkedAt"`
}

func updateCheckFile() string {
	return filepath.Join(auth.ConfigDir(), "update-check.json")
}

func DetectPlatform() string {
	goos := runtime.GOOS
	goarch := runtime.GOARCH
	switch {
	case goos == "linux" && goarch == "amd64":
		return "linux-x64"
	case goos == "linux" && goarch == "arm64":
		return "linux-arm64"
	case goos == "darwin" && goarch == "amd64":
		return "darwin-x64"
	case goos == "darwin" && goarch == "arm64":
		return "darwin-arm64"
	case goos == "windows" && goarch == "amd64":
		return "windows-x64"
	default:
		return goos + "-" + goarch
	}
}

// ShowUpdateNotice prints a notice if there's a pending update.
func ShowUpdateNotice(currentVersion string) {
	data, err := os.ReadFile(updateCheckFile())
	if err != nil {
		return
	}
	var uc updateCheck
	if err := json.Unmarshal(data, &uc); err != nil {
		return
	}
	if uc.LatestVersion != "" && uc.LatestVersion != currentVersion && uc.LatestVersion != "v"+currentVersion {
		latest := strings.TrimPrefix(uc.LatestVersion, "v")
		fmt.Fprintf(os.Stderr, "\n[envman] Update available: v%s → %s\n  Run: envman update\n\n", currentVersion, latest)
	}
}

// SpawnUpdateCheck starts a background process to check for updates silently.
func SpawnUpdateCheck(serverURL, binaryPath string, currentVersion string) {
	self, err := os.Executable()
	if err != nil {
		return
	}
	cmd := exec.Command(self, "--_update-check", serverURL, binaryPath, currentVersion)
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.Stdin = nil
	_ = cmd.Start()
	if cmd.Process != nil {
		_ = cmd.Process.Release()
	}
}

// RunBgUpdateCheck is the hidden subcommand that performs the background check.
func RunBgUpdateCheck(serverURL, binaryPath, currentVersion string) {
	data, _ := os.ReadFile(updateCheckFile())
	var uc updateCheck
	_ = json.Unmarshal(data, &uc)

	now := time.Now().UnixNano() / int64(time.Millisecond)
	if now-uc.CheckedAt < int64(updateCheckInterval.Milliseconds()) {
		return
	}

	latest, err := fetchLatestVersion(serverURL)
	if err != nil {
		return
	}

	if binaryPath == "" {
		binaryPath, _ = os.Executable()
	}
	out := updateCheck{
		LatestVersion: latest,
		CurrentBinary: binaryPath,
		CheckedAt:     now,
	}
	data, _ = json.Marshal(out)
	_ = os.MkdirAll(auth.ConfigDir(), 0700)
	_ = os.WriteFile(updateCheckFile(), data, 0600)
}

func fetchLatestVersion(serverURL string) (string, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", serverURL+"/api/version", nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var result struct {
		Version string `json:"version"`
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}
	return result.Version, nil
}

// Update downloads and replaces the current binary with the latest version.
func Update(serverURL, currentVersion string) error {
	fmt.Printf("Checking for updates...\n")
	latest, err := fetchLatestVersion(serverURL)
	if err != nil {
		return fmt.Errorf("check version: %w", err)
	}
	latestClean := strings.TrimPrefix(latest, "v")
	currentClean := strings.TrimPrefix(currentVersion, "v")

	if latestClean == currentClean {
		fmt.Printf("Already up to date (v%s).\n", currentClean)
		return nil
	}
	fmt.Printf("Updating v%s → v%s...\n", currentClean, latestClean)

	platform := DetectPlatform()
	downloadURL := serverURL + "/download/cli/" + platform

	self, err := os.Executable()
	if err != nil {
		return fmt.Errorf("find current binary: %w", err)
	}
	self, err = filepath.EvalSymlinks(self)
	if err != nil {
		return fmt.Errorf("resolve symlink: %w", err)
	}

	if err := downloadAndReplace(downloadURL, self); err != nil {
		if isPermissionError(err) {
			fmt.Printf("[envman] Permission denied — retrying with sudo...\n")
			return sudoReplace(downloadURL, self)
		}
		return err
	}

	fmt.Printf("Updated to v%s successfully.\n", latestClean)
	return nil
}

func downloadAndReplace(downloadURL, targetPath string) error {
	client := &http.Client{Timeout: 5 * time.Minute}
	req, err := http.NewRequest("GET", downloadURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept-Encoding", "gzip")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed: HTTP %d", resp.StatusCode)
	}

	// Write to temp file in same dir (for atomic rename)
	dir := filepath.Dir(targetPath)
	tmp, err := os.CreateTemp(dir, ".envman-update-*")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)

	// Progress reporting
	var total int64
	if cl := resp.Header.Get("Content-Length"); cl != "" {
		if n, err := strconv.ParseInt(cl, 10, 64); err == nil {
			total = n
		}
	}

	pr := &progressReader{r: resp.Body, total: total}
	if _, err := io.Copy(tmp, pr); err != nil {
		tmp.Close()
		return fmt.Errorf("write: %w", err)
	}
	tmp.Close()
	fmt.Println()

	// Make executable
	if err := os.Chmod(tmpPath, 0755); err != nil {
		return fmt.Errorf("chmod: %w", err)
	}

	// Atomic replace
	if err := os.Rename(tmpPath, targetPath); err != nil {
		return err
	}
	return nil
}

func sudoReplace(downloadURL, targetPath string) error {
	// Download to temp, then sudo mv
	tmp, err := os.CreateTemp("", "envman-update-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)

	client := &http.Client{Timeout: 5 * time.Minute}
	req, _ := http.NewRequest("GET", downloadURL, nil)
	req.Header.Set("Accept-Encoding", "gzip")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	pr := &progressReader{r: resp.Body}
	if _, err := io.Copy(tmp, pr); err != nil {
		tmp.Close()
		return err
	}
	tmp.Close()
	fmt.Println()

	if err := os.Chmod(tmpPath, 0755); err != nil {
		return err
	}

	cmd := exec.Command("sudo", "mv", tmpPath, targetPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	return cmd.Run()
}

func isPermissionError(err error) bool {
	return err != nil && (strings.Contains(err.Error(), "permission denied") || strings.Contains(err.Error(), "EACCES"))
}

type progressReader struct {
	r       io.Reader
	total   int64
	read    int64
	last    time.Time
	started time.Time
}

func (p *progressReader) Read(buf []byte) (int, error) {
	n, err := p.r.Read(buf)
	p.read += int64(n)
	now := time.Now()
	if p.started.IsZero() {
		p.started = now
	}
	if now.Sub(p.last) > 250*time.Millisecond || err != nil {
		p.last = now
		elapsed := now.Sub(p.started).Seconds()
		speed := float64(p.read)
		if elapsed > 0 {
			speed = float64(p.read) / elapsed
		}
		if p.total > 0 {
			pct := float64(p.read) / float64(p.total) * 100
			eta := ""
			if speed > 0 {
				remaining := float64(p.total-p.read) / speed
				eta = fmt.Sprintf(" ETA %s", fmtDuration(time.Duration(remaining)*time.Second))
			}
			fmt.Printf("\r  %s / %s (%.0f%%) %s/s%s    ",
				fmtBytes(p.read), fmtBytes(p.total), pct, fmtBytes(int64(speed)), eta)
		} else {
			fmt.Printf("\r  %s downloaded %s/s    ", fmtBytes(p.read), fmtBytes(int64(speed)))
		}
	}
	return n, err
}

func fmtBytes(b int64) string {
	const (
		MB = 1024 * 1024
		KB = 1024
	)
	switch {
	case b >= MB:
		return fmt.Sprintf("%.1fMB", float64(b)/MB)
	case b >= KB:
		return fmt.Sprintf("%.1fKB", float64(b)/KB)
	default:
		return fmt.Sprintf("%dB", b)
	}
}

func fmtDuration(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	return fmt.Sprintf("%dm%ds", int(d.Minutes()), int(d.Seconds())%60)
}
