package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/bipprojectbali/envman/cli/internal/sysstat"
)

// ANSI colors, matching the file-health command's palette.
const (
	cReset  = "\033[0m"
	cGreen  = "\033[32m"
	cYellow = "\033[33m"
	cRed    = "\033[31m"
	cDim    = "\033[2m"
	cBold   = "\033[1m"
)

// labelWidth is the fixed width of the left label column; every content column
// starts at the same offset so the output reads as one aligned table.
const labelWidth = 6

// statusColor maps a status to its ANSI color.
func statusColor(s sysstat.Status) string {
	switch s {
	case sysstat.Critical:
		return cRed
	case sysstat.Warning:
		return cYellow
	default:
		return cGreen
	}
}

// statusIcon maps a status to a glyph.
func statusIcon(s sysstat.Status) string {
	switch s {
	case sysstat.Critical:
		return "✗"
	case sysstat.Warning:
		return "⚠"
	default:
		return "✓"
	}
}

// labeledRow prints one "<label>  <content>" line with the label bolded and
// padded to labelWidth so content aligns across sections.
func labeledRow(label, content string) {
	fmt.Printf("  %s%-*s%s%s\n", cBold, labelWidth, label, cReset, content)
}

// labeledBlock prints a multi-row section: the label appears on the first row,
// continuation rows get a blank (but equally wide) label column.
func labeledBlock(label string, rows []string) {
	for i, row := range rows {
		l := label
		if i > 0 {
			l = ""
		}
		labeledRow(l, row)
	}
}

// usageBar renders a fixed-width [████······] gauge colored by status.
func usageBar(pct float64, s sysstat.Status) string {
	const w = 10
	filled := int(pct/100*float64(w) + 0.5)
	if filled > w {
		filled = w
	}
	if filled < 0 {
		filled = 0
	}
	return "[" + statusColor(s) + strings.Repeat("█", filled) + cReset +
		cDim + strings.Repeat("·", w-filled) + cReset + "]"
}

// shareBar renders a fixed-width, neutral gauge showing a fraction of a whole
// (used for directory footprint shares — not a health signal, so uncolored).
func shareBar(pct float64) string {
	const w = 8
	filled := int(pct/100*float64(w) + 0.5)
	if filled > w {
		filled = w
	}
	if filled < 0 {
		filled = 0
	}
	return cBold + strings.Repeat("█", filled) + cReset + cDim + strings.Repeat("·", w-filled) + cReset
}

func printSysReport(r sysstat.Report) {
	overall := r.Overall()

	// Header: status dot + hostname + verdict, then a dim detail line.
	fmt.Printf("%s%s %s%s%s  %s·%s  %s%s%s\n",
		statusColor(overall), statusIcon(overall), cBold, r.Host.Hostname, cReset,
		cDim, cReset, statusColor(overall), sysLabel(overall), cReset)
	detail := fmt.Sprintf("%s %s · %s · kernel %s · up %s",
		r.Host.Platform, r.Host.Version, r.Host.Arch, r.Host.Kernel, r.Host.UptimeHuman)
	if r.Host.Virtualization != "" {
		detail += " · virt " + r.Host.Virtualization
	}
	fmt.Printf("  %s%s%s\n", cDim, detail, cReset)

	// Identity group.
	fmt.Println()
	printIdentity(r.Identity, r.Host.Hostname)

	// Resources group.
	fmt.Println()
	labeledRow("cpu", cpuLine(r.CPU))
	labeledRow("mem", usageRow(r.Memory))
	if r.Swap.Total > 0 {
		labeledRow("swap", usageRow(r.Swap))
	}

	// Disk group.
	if len(r.Disks) > 0 {
		fmt.Println()
		printDisks(r.Disks)
	}

	// Non-fatal collection warnings go to stderr so stdout stays clean.
	for _, msg := range r.Warnings {
		fmt.Fprintf(os.Stderr, "%s[envman] tidak bisa membaca %s%s\n", cDim, msg, cReset)
	}
}

// cpuLine formats the one-line CPU summary.
func cpuLine(c sysstat.CPUInfo) string {
	cores := fmt.Sprintf("%d cores", c.CoresPhysical)
	if c.CoresPhysical == 0 {
		cores = fmt.Sprintf("%d cores", c.CoresLogical)
	} else if c.CoresLogical > c.CoresPhysical {
		cores = fmt.Sprintf("%d cores · %d threads", c.CoresPhysical, c.CoresLogical)
	}
	return fmt.Sprintf("%s · %s · %.0f%% busy · load %s%.2f%s / %.2f / %.2f",
		cpuModel(c.Model), cores, c.UsedPercent,
		statusColor(c.LoadStatus), c.Load1, cReset, c.Load5, c.Load15)
}

// usageRow formats a memory/swap gauge line: bar + percent + used/total.
func usageRow(m sysstat.MemInfo) string {
	return fmt.Sprintf("%s  %s%3.0f%%%s   %s / %s",
		usageBar(m.UsedPercent, m.Status),
		statusColor(m.Status), m.UsedPercent, cReset,
		human(m.Used), human(m.Total))
}

// maxMountWidth caps how wide the mount column grows before long paths are
// truncated with a leading ellipsis (keeping the meaningful tail).
const maxMountWidth = 26

// printDisks renders the disk block: one gauge row per filesystem, mounts
// left-aligned in a column sized to the widest (capped) mount.
func printDisks(disks []sysstat.DiskInfo) {
	width := 0
	for _, d := range disks {
		if n := len(d.Mount); n > width {
			width = n
		}
	}
	if width > maxMountWidth {
		width = maxMountWidth
	}
	rows := make([]string, 0, len(disks))
	for _, d := range disks {
		mount := truncMount(d.Mount, width)
		rows = append(rows, fmt.Sprintf("%s%s%s %-*s  %s  %s%3.0f%%%s   %9s / %-9s %s%s%s",
			statusColor(d.Status), statusIcon(d.Status), cReset,
			width, mount,
			usageBar(d.UsedPercent, d.Status),
			statusColor(d.Status), d.UsedPercent, cReset,
			human(d.Used), human(d.Total),
			cDim, d.Fstype, cReset))
	}
	labeledBlock("disk", rows)
}

// truncMount shortens a mount path to at most width chars, preferring to cut at
// a path separator so the remaining tail stays a recognizable path segment
// (e.g. ".../Update/SFR/mnt1" rather than "…m/Volumes/...").
func truncMount(mount string, width int) string {
	if len(mount) <= width {
		return mount
	}
	tail := mount[len(mount)-width+1:] // room for the leading "…"
	if i := strings.IndexByte(tail, '/'); i >= 0 && i < len(tail)-1 {
		tail = tail[i:]
	}
	return "…" + tail
}

// sysLabel renders a short verdict word for the header.
func sysLabel(s sysstat.Status) string {
	switch s {
	case sysstat.Critical:
		return "perlu perhatian"
	case sysstat.Warning:
		return "ada peringatan"
	default:
		return "sehat"
	}
}

// cpuModel falls back to a placeholder when the model string is empty.
func cpuModel(m string) string {
	if m == "" {
		return "unknown CPU"
	}
	return m
}

// human is a thin exported-style wrapper so the command can format bytes
// without reaching into the package's unexported helper.
func human(b uint64) string { return sysstat.HumanBytes(b) }

// printIdentity renders the current user, active login sessions (one line), and
// network addresses. hostname is passed so a lone local self-session can be
// suppressed as redundant with the user line.
func printIdentity(id sysstat.Identity, hostname string) {
	who := id.User.Username
	if who == "" {
		who = "unknown"
	}
	userStr := who + "@" + hostname
	if id.User.UID != "" {
		userStr += fmt.Sprintf("  %s· uid %s%s", cDim, id.User.UID, cReset)
	}
	labeledRow("user", userStr)

	if sessions := notableSessions(id.Sessions, id.User.Username); len(sessions) > 0 {
		labeledRow("login", formatSessions(sessions))
	}

	if len(id.LocalIPs) > 0 || id.PublicIP != "" {
		width := len("public")
		for _, a := range id.LocalIPs {
			if n := len(a.Iface); n > width {
				width = n
			}
		}
		rows := make([]string, 0, len(id.LocalIPs)+1)
		for _, a := range id.LocalIPs {
			rows = append(rows, fmt.Sprintf("%s%-*s%s  %s", cDim, width, a.Iface, cReset, a.Addr))
		}
		if id.PublicIP != "" {
			rows = append(rows, fmt.Sprintf("%s%-*s%s  %s  %s(publik)%s",
				cBold, width, "public", cReset, id.PublicIP, cDim, cReset))
		}
		labeledBlock("net", rows)
	}
}

// formatSessions renders active logins as a single "·"-separated line. When all
// sessions belong to one user the terminals are listed bare; otherwise each is
// prefixed with its user. Remote sessions carry a dim "(host)" suffix.
func formatSessions(sessions []sysstat.SessionInfo) string {
	sameUser := true
	for _, s := range sessions {
		if s.User != sessions[0].User {
			sameUser = false
			break
		}
	}
	parts := make([]string, 0, len(sessions))
	for _, s := range sessions {
		p := s.Terminal
		if !sameUser {
			p = s.User + "@" + s.Terminal
		}
		if s.Host != "" {
			p += fmt.Sprintf(" %s(%s)%s", cDim, s.Host, cReset)
		}
		parts = append(parts, p)
	}
	return strings.Join(parts, " · ")
}

// notableSessions filters out the trivial case of a single local session
// belonging to the current user (which the user line already conveys). It keeps
// sessions if there are several, if any is remote, or if another user is on.
func notableSessions(sessions []sysstat.SessionInfo, currentUser string) []sysstat.SessionInfo {
	if len(sessions) == 0 {
		return nil
	}
	// Normalize the current username (host.Users reports bare login names).
	cur := currentUser
	if i := lastIndexByte(cur, '\\'); i >= 0 { // strip DOMAIN\ on Windows
		cur = cur[i+1:]
	}
	if len(sessions) == 1 && sessions[0].User == cur && sessions[0].Host == "" {
		return nil
	}
	return sessions
}

// lastIndexByte reports the index of the last b in s, or -1.
func lastIndexByte(s string, b byte) int {
	for i := len(s) - 1; i >= 0; i-- {
		if s[i] == b {
			return i
		}
	}
	return -1
}

// maxDirRows caps how many top-level entries the breakdown prints; the rest are
// folded into a "(N lainnya)" line so a big project doesn't flood the terminal.
const maxDirRows = 12

func printDirReport(d sysstat.DirReport) {
	fmt.Println()
	fmt.Printf("  %s%-*s%s%s   %s%s%s  %s· %s files%s\n",
		cBold, labelWidth, "proj", cReset, d.Root,
		cBold, human(d.TotalBytes), cReset,
		cDim, groupThousands(d.FileCount), cReset)

	shown := d.Children
	var rest []sysstat.DirEntry
	if len(shown) > maxDirRows {
		rest = shown[maxDirRows:]
		shown = shown[:maxDirRows]
	}
	total := d.TotalBytes
	if total == 0 {
		total = 1
	}
	for _, c := range shown {
		name := c.Name
		if c.IsDir {
			name += "/"
		}
		pct := float64(c.Bytes) / float64(total) * 100
		fmt.Printf("    %s  %s%9s%s  %s\n", shareBar(pct), cDim, human(c.Bytes), cReset, name)
	}
	if len(rest) > 0 {
		var sum uint64
		for _, c := range rest {
			sum += c.Bytes
		}
		pct := float64(sum) / float64(total) * 100
		fmt.Printf("    %s  %s%9s%s  %s(%d entri lainnya)%s\n",
			shareBar(pct), cDim, human(sum), cReset, cDim, len(rest), cReset)
	}
}

// groupThousands formats an int with dot separators (Indonesian locale style),
// e.g. 48320 -> "48.320".
func groupThousands(n int) string {
	s := fmt.Sprintf("%d", n)
	if len(s) <= 3 {
		return s
	}
	var b []byte
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			b = append(b, '.')
		}
		b = append(b, c)
	}
	return string(b)
}
