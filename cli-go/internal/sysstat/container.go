package sysstat

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Container holds the cgroup-derived view of the box when the CLI runs inside a
// container. Fields are best-effort: a value that could not be read stays zero,
// and callers fall back to the host figure. All numbers describe the container's
// slice, not the host — the thing operators actually care about ("how much do I
// get?"), which /proc/meminfo and /proc/cpuinfo do NOT report from inside a
// container (they still show host totals).
type Container struct {
	Detected bool // running inside a container

	// Memory limit (bytes) and current usage (bytes). MemLimit==0 means no
	// limit was set (cgroup "max") — treat as unlimited and use the host total.
	MemLimit uint64
	MemUsed  uint64

	// CPUQuotaCores is the fractional CPU allowance from cpu.max / cfs quota
	// (e.g. quota 400000 / period 100000 = 4.0). 0 means unlimited.
	CPUQuotaCores float64

	// PSI CPU pressure ("some") averages, percent stalled over 10/60/300s.
	// Only available on cgroup v2 with pressure accounting. -1 when absent.
	PSISome10, PSISome60, PSISome300 float64

	// UptimeSecs is the container's own uptime (from PID 1 start), not the host.
	UptimeSecs uint64
}

// procFS is the mount root for proc/cgroup reads; a variable so tests can point
// it at a fixture tree.
var (
	procRoot   = "/proc"
	cgroupRoot = "/sys/fs/cgroup"
	dockerEnv  = "/.dockerenv"
)

// detectContainer reports whether we're inside a container, using the cheap,
// widely-reliable signals: the Docker marker file, or a container hint in PID
// 1's cgroup path.
func detectContainer() bool {
	if _, err := os.Stat(dockerEnv); err == nil {
		return true
	}
	if b, err := os.ReadFile(filepath.Join(procRoot, "1", "cgroup")); err == nil {
		s := string(b)
		for _, needle := range []string{"docker", "containerd", "kubepods", "/lxc/"} {
			if strings.Contains(s, needle) {
				return true
			}
		}
	}
	return false
}

// collectContainer gathers the cgroup view. It returns Detected=false (and the
// caller ignores it) when not containerized. cgroup v2 is tried first (unified
// hierarchy at cgroupRoot), then v1 paths.
func collectContainer(warn func(string)) Container {
	c := Container{PSISome10: -1, PSISome60: -1, PSISome300: -1}
	if !detectContainer() {
		return c
	}
	c.Detected = true

	v2 := fileExists(filepath.Join(cgroupRoot, "cgroup.controllers"))
	if v2 {
		c.MemLimit = parseCgroupBytes(filepath.Join(cgroupRoot, "memory.max"))
		c.MemUsed = parseCgroupBytes(filepath.Join(cgroupRoot, "memory.current"))
		c.CPUQuotaCores = parseCPUMaxV2(filepath.Join(cgroupRoot, "cpu.max"))
		c.PSISome10, c.PSISome60, c.PSISome300 = parsePSI(filepath.Join(cgroupRoot, "cpu.pressure"))
	} else {
		c.MemLimit = parseCgroupBytes(filepath.Join(cgroupRoot, "memory", "memory.limit_in_bytes"))
		c.MemUsed = parseCgroupBytes(filepath.Join(cgroupRoot, "memory", "memory.usage_in_bytes"))
		quota := readInt64(filepath.Join(cgroupRoot, "cpu", "cpu.cfs_quota_us"))
		period := readInt64(filepath.Join(cgroupRoot, "cpu", "cpu.cfs_period_us"))
		c.CPUQuotaCores = cpuCoresFromQuota(quota, period)
	}

	// A v1 "unlimited" memory limit is a sentinel near max uint64; normalize to 0.
	if c.MemLimit >= 1<<62 {
		c.MemLimit = 0
	}

	if up, ok := pid1UptimeSecs(); ok {
		c.UptimeSecs = up
	}
	return c
}

// parseCgroupBytes reads a single-integer bytes file (memory.max, memory.current,
// memory.limit_in_bytes). Returns 0 for "max", empty, or unreadable.
func parseCgroupBytes(path string) uint64 {
	s, err := readTrimmed(path)
	if err != nil || s == "" || s == "max" {
		return 0
	}
	n, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		return 0
	}
	return n
}

// parseCPUMaxV2 parses cgroup v2 "cpu.max" ("<quota> <period>" or "max <period>")
// into a fractional core count. "max" (unlimited) → 0.
func parseCPUMaxV2(path string) float64 {
	s, err := readTrimmed(path)
	if err != nil {
		return 0
	}
	fields := strings.Fields(s)
	if len(fields) != 2 || fields[0] == "max" {
		return 0
	}
	quota, err1 := strconv.ParseInt(fields[0], 10, 64)
	period, err2 := strconv.ParseInt(fields[1], 10, 64)
	if err1 != nil || err2 != nil {
		return 0
	}
	return cpuCoresFromQuota(quota, period)
}

// cpuCoresFromQuota converts a CFS quota/period pair to fractional cores. A
// negative or zero quota (v1 "-1" = unlimited) → 0.
func cpuCoresFromQuota(quota, period int64) float64 {
	if quota <= 0 || period <= 0 {
		return 0
	}
	return float64(quota) / float64(period)
}

// parsePSI parses a cgroup v2 pressure file's "some" line, returning the
// avg10/avg60/avg300 percentages. Missing values are -1.
func parsePSI(path string) (a10, a60, a300 float64) {
	a10, a60, a300 = -1, -1, -1
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(b), "\n") {
		if !strings.HasPrefix(line, "some ") {
			continue
		}
		for _, f := range strings.Fields(line) {
			k, v, ok := strings.Cut(f, "=")
			if !ok {
				continue
			}
			val, err := strconv.ParseFloat(v, 64)
			if err != nil {
				continue
			}
			switch k {
			case "avg10":
				a10 = val
			case "avg60":
				a60 = val
			case "avg300":
				a300 = val
			}
		}
	}
	return
}

// pid1UptimeSecs derives the container's uptime from PID 1's start time. It reads
// the mtime of /proc/1 (set when the process was created) and subtracts from now.
func pid1UptimeSecs() (uint64, bool) {
	fi, err := os.Stat(filepath.Join(procRoot, "1"))
	if err != nil {
		return 0, false
	}
	d := time.Since(fi.ModTime())
	if d < 0 {
		return 0, false
	}
	return uint64(d.Seconds()), true
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func readTrimmed(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(b)), nil
}

func readInt64(path string) int64 {
	s, err := readTrimmed(path)
	if err != nil {
		return 0
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return 0
	}
	return n
}
