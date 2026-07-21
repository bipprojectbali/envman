// Package sysstat collects a quick health snapshot of the local machine
// (host, cpu, memory, disk) so an operator — or an AI agent — can get a fast
// picture of the box the CLI is running on. It is a thin wrapper over gopsutil;
// all the pure, testable logic (thresholds, formatting) lives in this file.
package sysstat

import "fmt"

// Status of a metric relative to its usage thresholds. Mirrors the vocabulary
// used by the file-health scanner so output reads consistently across commands.
type Status string

const (
	OK       Status = "ok"       // < 80% used
	Warning  Status = "warning"  // 80–89% used
	Critical Status = "critical" // >= 90% used
)

// Usage thresholds (percent). Disk/memory filling up is the most common cause
// of a sick box, so we flag early (80%) and loud (90%).
const (
	warnPct = 80
	critPct = 90
)

// statusFor maps a used-percentage to a Status.
func statusFor(pct float64) Status {
	switch {
	case pct >= critPct:
		return Critical
	case pct >= warnPct:
		return Warning
	default:
		return OK
	}
}

// loadStatus rates a load-average figure relative to the number of logical
// cores: load per core >= 1.0 means the run queue is saturated (warning), and
// >= 1.5 means sustained overload (critical). Zero cores → OK (can't judge).
func loadStatus(load float64, cores int) Status {
	if cores <= 0 {
		return OK
	}
	perCore := load / float64(cores)
	switch {
	case perCore >= 1.5:
		return Critical
	case perCore >= 1.0:
		return Warning
	default:
		return OK
	}
}

// HumanBytes formats a byte count as a human-readable string (binary units).
// Exported for the command layer's rendering.
func HumanBytes(b uint64) string { return humanBytes(b) }

// humanBytes formats a byte count as a human-readable string (binary units).
func humanBytes(b uint64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := uint64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(b)/float64(div), "KMGTPE"[exp])
}

// HumanDuration formats a seconds count as a compact uptime string. Exported
// for the command layer (e.g. container uptime rendering).
func HumanDuration(secs uint64) string { return humanDuration(secs) }

// humanDuration formats a seconds count as a compact uptime string (e.g. "3d 4h 12m").
func humanDuration(secs uint64) string {
	d := secs / 86400
	h := (secs % 86400) / 3600
	m := (secs % 3600) / 60
	switch {
	case d > 0:
		return fmt.Sprintf("%dd %dh %dm", d, h, m)
	case h > 0:
		return fmt.Sprintf("%dh %dm", h, m)
	default:
		return fmt.Sprintf("%dm", m)
	}
}

// worst returns the most severe status among the given ones (Critical > Warning > OK).
func worst(statuses ...Status) Status {
	res := OK
	for _, s := range statuses {
		if s == Critical {
			return Critical
		}
		if s == Warning {
			res = Warning
		}
	}
	return res
}
