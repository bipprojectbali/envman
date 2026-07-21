package sysstat

import (
	"context"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
)

// Report is a full snapshot of the local machine's health. Every section is
// best-effort: a section that could not be read is left zero-valued and its
// error recorded in Warnings, so a partial snapshot still renders.
type Report struct {
	Host     HostInfo   `json:"host"`
	Identity Identity   `json:"identity"`
	CPU      CPUInfo    `json:"cpu"`
	Memory   MemInfo    `json:"memory"`
	Swap     MemInfo    `json:"swap"`
	Disks    []DiskInfo `json:"disks"`
	// Container is the cgroup-scoped view when running inside a container. Its
	// Detected field gates all container-aware rendering; host figures above
	// remain populated for side-by-side display.
	Container    Container `json:"container"`
	ContainerMem MemInfo   `json:"containerMemory,omitempty"` // memory scoped to the cgroup limit (only when limited)
	Warnings     []string  `json:"warnings,omitempty"`        // non-fatal collection errors
}

// HostInfo describes the machine and how long it has been up.
type HostInfo struct {
	Hostname       string `json:"hostname"`
	OS             string `json:"os"`       // ex: linux, darwin
	Platform       string `json:"platform"` // ex: ubuntu, darwin
	Version        string `json:"version"`  // platform version
	Kernel         string `json:"kernel"`
	Arch           string `json:"arch"`
	UptimeSecs     uint64 `json:"uptimeSecs"`
	UptimeHuman    string `json:"uptimeHuman"`
	Virtualization string `json:"virtualization,omitempty"`
}

// CPUInfo describes the processor and current load.
type CPUInfo struct {
	Model         string  `json:"model"`
	CoresPhysical int     `json:"coresPhysical"`
	CoresLogical  int     `json:"coresLogical"`
	QuotaCores    float64 `json:"quotaCores,omitempty"` // cgroup CPU allowance (fractional cores); 0 = unlimited
	UsedPercent   float64 `json:"usedPercent"`
	Load1         float64 `json:"load1"`
	Load5         float64 `json:"load5"`
	Load15        float64 `json:"load15"`
	LoadStatus    Status  `json:"loadStatus"`
}

// MemInfo describes a memory pool (physical RAM or swap).
type MemInfo struct {
	Total       uint64  `json:"total"`
	Used        uint64  `json:"used"`
	Available   uint64  `json:"available"`
	UsedPercent float64 `json:"usedPercent"`
	Status      Status  `json:"status"`
}

// DiskInfo describes usage of one mounted filesystem.
type DiskInfo struct {
	Mount       string  `json:"mount"`
	Fstype      string  `json:"fstype"`
	Total       uint64  `json:"total"`
	Used        uint64  `json:"used"`
	Free        uint64  `json:"free"`
	UsedPercent float64 `json:"usedPercent"`
	Status      Status  `json:"status"`
}

// pseudoFstypes are virtual/kernel filesystems that carry no real capacity;
// listing them adds noise and 0-byte "100% full" rows, so we skip them.
var pseudoFstypes = map[string]bool{
	"tmpfs": true, "devtmpfs": true, "devfs": true, "overlay": true, "squashfs": true,
	"proc": true, "sysfs": true, "cgroup": true, "cgroup2": true, "pstore": true,
	"autofs": true, "mqueue": true, "debugfs": true, "tracefs": true, "securityfs": true,
	"bpf": true, "configfs": true, "hugetlbfs": true, "fusectl": true, "nsfs": true,
	"binfmt_misc": true, "ramfs": true, "efivarfs": true,
}

// Collect gathers a machine health snapshot. It never fails wholesale: any
// section that errors is skipped and noted in Report.Warnings.
func Collect(ctx context.Context) Report {
	var r Report
	warn := func(msg string) { r.Warnings = append(r.Warnings, msg) }

	if h, err := host.InfoWithContext(ctx); err == nil {
		r.Host = HostInfo{
			Hostname:       h.Hostname,
			OS:             h.OS,
			Platform:       h.Platform,
			Version:        h.PlatformVersion,
			Kernel:         h.KernelVersion,
			Arch:           h.KernelArch,
			UptimeSecs:     h.Uptime,
			UptimeHuman:    humanDuration(h.Uptime),
			Virtualization: h.VirtualizationSystem,
		}
	} else {
		warn("host: " + err.Error())
	}

	r.Identity = collectIdentity(ctx, warn)
	r.CPU = collectCPU(ctx, warn)

	if vm, err := mem.VirtualMemoryWithContext(ctx); err == nil {
		r.Memory = MemInfo{
			Total:       vm.Total,
			Used:        vm.Used,
			Available:   vm.Available,
			UsedPercent: vm.UsedPercent,
			Status:      statusFor(vm.UsedPercent),
		}
	} else {
		warn("memory: " + err.Error())
	}

	if sw, err := mem.SwapMemoryWithContext(ctx); err == nil {
		r.Swap = MemInfo{
			Total:       sw.Total,
			Used:        sw.Used,
			Available:   sw.Free,
			UsedPercent: sw.UsedPercent,
			Status:      statusFor(sw.UsedPercent),
		}
	} else {
		warn("swap: " + err.Error())
	}

	r.Disks = collectDisks(ctx, warn)

	// Container view: when inside a container, /proc figures above describe the
	// HOST, not our slice. Read the real limits from cgroup and expose them so
	// the renderer can show "limit vs host" instead of a misleading host number.
	r.Container = collectContainer(warn)
	if r.Container.Detected {
		if r.Container.CPUQuotaCores > 0 {
			r.CPU.QuotaCores = r.Container.CPUQuotaCores
			// Rate load against the CPU allowance, not host cores — that's the
			// saturation the container actually experiences.
			r.CPU.LoadStatus = loadStatus(r.CPU.Load1, int(r.Container.CPUQuotaCores+0.5))
		}
		if r.Container.MemLimit > 0 {
			used := r.Container.MemUsed
			pct := 0.0
			if r.Container.MemLimit > 0 {
				pct = float64(used) / float64(r.Container.MemLimit) * 100
			}
			r.ContainerMem = MemInfo{
				Total:       r.Container.MemLimit,
				Used:        used,
				Available:   r.Container.MemLimit - used,
				UsedPercent: pct,
				Status:      statusFor(pct),
			}
		}
	}
	return r
}

// collectCPU reads processor model, core counts and load average.
func collectCPU(ctx context.Context, warn func(string)) CPUInfo {
	var c CPUInfo
	if infos, err := cpu.InfoWithContext(ctx); err == nil && len(infos) > 0 {
		c.Model = infos[0].ModelName
	}
	if n, err := cpu.CountsWithContext(ctx, false); err == nil {
		c.CoresPhysical = n
	}
	if n, err := cpu.CountsWithContext(ctx, true); err == nil {
		c.CoresLogical = n
	}
	// A short sampling window is required for a meaningful busy percentage.
	if pct, err := cpu.PercentWithContext(ctx, 200*time.Millisecond, false); err == nil && len(pct) > 0 {
		c.UsedPercent = pct[0]
	} else if err != nil {
		warn("cpu percent: " + err.Error())
	}
	if avg, err := load.AvgWithContext(ctx); err == nil {
		c.Load1, c.Load5, c.Load15 = avg.Load1, avg.Load5, avg.Load15
		c.LoadStatus = loadStatus(avg.Load1, c.CoresLogical)
	}
	return c
}

// collectDisks reads usage for each real (non-pseudo) mounted filesystem,
// de-duplicating by mountpoint.
func collectDisks(ctx context.Context, warn func(string)) []DiskInfo {
	parts, err := disk.PartitionsWithContext(ctx, false)
	if err != nil {
		warn("disk partitions: " + err.Error())
		return nil
	}
	seenMount := make(map[string]bool)
	// fingerprint = total+used bytes. Multiple mounts backed by the same pool
	// (e.g. macOS APFS synthetic volumes, bind mounts) report byte-exact
	// identical figures; collapsing them keeps the "quick glance" readable.
	// A collision across genuinely separate physical disks is effectively
	// impossible at byte granularity.
	seenFP := make(map[[2]uint64]bool)
	var out []DiskInfo
	for _, p := range parts {
		if pseudoFstypes[p.Fstype] || seenMount[p.Mountpoint] {
			continue
		}
		seenMount[p.Mountpoint] = true
		u, err := disk.UsageWithContext(ctx, p.Mountpoint)
		if err != nil || u == nil || u.Total == 0 {
			continue // unreadable or zero-capacity mount — skip silently
		}
		fp := [2]uint64{u.Total, u.Used}
		if seenFP[fp] {
			continue // same underlying pool as an already-listed mount
		}
		seenFP[fp] = true
		out = append(out, DiskInfo{
			Mount:       p.Mountpoint,
			Fstype:      p.Fstype,
			Total:       u.Total,
			Used:        u.Used,
			Free:        u.Free,
			UsedPercent: u.UsedPercent,
			Status:      statusFor(u.UsedPercent),
		})
	}
	return out
}

// Overall returns the most severe status across memory, swap and all disks —
// a one-glance verdict for the whole machine.
func (r Report) Overall() Status {
	mem := r.Memory.Status
	// Inside a container the cgroup limit is the memory pressure that matters —
	// judge on it rather than the host's headroom.
	if r.Container.Detected && r.ContainerMem.Total > 0 {
		mem = r.ContainerMem.Status
	}
	statuses := []Status{mem, r.Swap.Status, r.CPU.LoadStatus}
	for _, d := range r.Disks {
		statuses = append(statuses, d.Status)
	}
	return worst(statuses...)
}
