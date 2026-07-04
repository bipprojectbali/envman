package main

import (
	"fmt"
	"os"
	"strings"
	"time"
)

// renderProgress writes an animated progress line to stderr using \r (overwrites same line).
// name is truncated to 24 chars if needed. Call clearProgress() after to finalize.
func renderProgress(name string, written, total int64, elapsed time.Duration) {
	if elapsed < time.Millisecond {
		elapsed = time.Millisecond
	}
	speed := float64(written) / elapsed.Seconds()

	label := name
	if len(label) > 24 {
		label = "…" + label[len(label)-23:]
	}

	if total <= 0 {
		fmt.Fprintf(os.Stderr, "\r%-24s  %s  %s/s              ",
			label, fmtSize(written), fmtSize(int64(speed)))
		return
	}

	pct := float64(written) / float64(total) * 100
	if pct > 100 {
		pct = 100
	}
	const barLen = 20
	filled := int(pct / 100 * barLen)
	bar := strings.Repeat("█", filled) + strings.Repeat("░", barLen-filled)

	var eta string
	if written >= total {
		eta = "selesai "
	} else if speed > 0 {
		secs := int(float64(total-written) / speed)
		if secs < 60 {
			eta = fmt.Sprintf("ETA %ds  ", secs)
		} else {
			eta = fmt.Sprintf("ETA %dm%ds", secs/60, secs%60)
		}
	}

	fmt.Fprintf(os.Stderr, "\r%-24s  [%s] %3.0f%%  %s/%s  %s/s  %-10s",
		label, bar, pct,
		fmtSize(written), fmtSize(total),
		fmtSize(int64(speed)), eta)
}

// clearProgress finalizes the current progress line with a newline.
func clearProgress() { fmt.Fprintln(os.Stderr) }

// fmtSize formats byte counts as a human-readable string.
func fmtSize(n int64) string {
	switch {
	case n >= 1<<30:
		return fmt.Sprintf("%.1f GB", float64(n)/(1<<30))
	case n >= 1<<20:
		return fmt.Sprintf("%.1f MB", float64(n)/(1<<20))
	case n >= 1<<10:
		return fmt.Sprintf("%.1f KB", float64(n)/(1<<10))
	default:
		return fmt.Sprintf("%d B", n)
	}
}
