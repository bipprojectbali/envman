package storage

import (
	"encoding/json"
	"testing"
)

func TestParseRef(t *testing.T) {
	cases := []struct {
		input     string
		wantSlug  string
		wantPath  string
		wantError bool
		desc      string
	}{
		{"myapp:assets/logo.png", "myapp", "assets/logo.png", false, "nested path"},
		{"myapp:compose.yml", "myapp", "compose.yml", false, "root-level file"},
		{"cdn-proxy:infra/compose.yml", "cdn-proxy", "infra/compose.yml", false, "slug with dash"},
		{"myapp:", "", "", true, "empty path"},
		{":assets/logo.png", "", "", true, "empty slug"},
		{"nocoton", "", "", true, "no colon"},
	}
	for _, c := range cases {
		slug, path, err := ParseRef(c.input)
		if c.wantError {
			if err == nil {
				t.Errorf("ParseRef(%q) [%s]: expected error, got slug=%q path=%q", c.input, c.desc, slug, path)
			}
			continue
		}
		if err != nil {
			t.Errorf("ParseRef(%q) [%s]: unexpected error: %v", c.input, c.desc, err)
			continue
		}
		if slug != c.wantSlug || path != c.wantPath {
			t.Errorf("ParseRef(%q) [%s] = (%q, %q), want (%q, %q)",
				c.input, c.desc, slug, path, c.wantSlug, c.wantPath)
		}
	}
}

func TestRemotePath(t *testing.T) {
	cases := []struct {
		localFile  string
		remotePath string
		want       string
		desc       string
	}{
		{"/local/compose.yml", "", "compose.yml", "auto-fill from basename"},
		{"/local/scripts/deploy.sh", "", "deploy.sh", "auto-fill nested basename"},
		{"/local/compose.yml", "infra/compose.yml", "infra/compose.yml", "explicit path preserved"},
		{"./seed.ts", "", "seed.ts", "relative path"},
		{"./a/b/logo.png", "assets/logo.png", "assets/logo.png", "explicit overrides"},
	}
	for _, c := range cases {
		got := RemotePath(c.localFile, c.remotePath)
		if got != c.want {
			t.Errorf("RemotePath(%q, %q) [%s] = %q, want %q", c.localFile, c.remotePath, c.desc, got, c.want)
		}
	}
}

func TestListResponseUnmarshal(t *testing.T) {
	serverJSON := `{
		"prefix": "assets",
		"page": 1,
		"pageSize": 50,
		"totalFiles": 2,
		"folders": ["images", "fonts"],
		"files": [
			{"id": "abc", "path": "assets/logo.png", "size": 24576, "mimeType": "image/png", "isPublic": true, "tags": ["brand"], "description": "Logo"},
			{"id": "def", "path": "assets/bg.jpg", "size": 102400, "mimeType": "image/jpeg", "isPublic": false, "tags": [], "description": ""}
		],
		"usage": {"usedBytes": 126976, "quotaBytes": 524288000}
	}`

	var result ListResult
	if err := json.Unmarshal([]byte(serverJSON), &result); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if result.Prefix != "assets" {
		t.Errorf("Prefix = %q, want %q", result.Prefix, "assets")
	}
	if result.TotalFiles != 2 {
		t.Errorf("TotalFiles = %d, want 2", result.TotalFiles)
	}
	if len(result.Folders) != 2 {
		t.Errorf("len(Folders) = %d, want 2", len(result.Folders))
	}
	if len(result.Files) != 2 {
		t.Errorf("len(Files) = %d, want 2", len(result.Files))
	}
	f0 := result.Files[0]
	if f0.Path != "assets/logo.png" || f0.Size != 24576 || !f0.IsPublic {
		t.Errorf("Files[0] = %+v, unexpected values", f0)
	}
	if result.Usage.UsedBytes != 126976 || result.Usage.QuotaBytes != 524288000 {
		t.Errorf("Usage = %+v, unexpected values", result.Usage)
	}
}

func TestFmtBytes(t *testing.T) {
	cases := []struct {
		n    int64
		want string
	}{
		{0, "0 B"},
		{512, "512 B"},
		{1024, "1.0 KB"},
		{1536, "1.5 KB"},
		{1048576, "1.0 MB"},
		{1073741824, "1.0 GB"},
		{24576, "24.0 KB"},
	}
	for _, c := range cases {
		got := FmtBytes(c.n)
		if got != c.want {
			t.Errorf("FmtBytes(%d) = %q, want %q", c.n, got, c.want)
		}
	}
}
