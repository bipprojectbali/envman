package sysstat

import "testing"

func TestStatusFor(t *testing.T) {
	cases := []struct {
		pct  float64
		want Status
	}{
		{0, OK}, {79.9, OK}, {80, Warning}, {89.9, Warning}, {90, Critical}, {100, Critical},
	}
	for _, c := range cases {
		if got := statusFor(c.pct); got != c.want {
			t.Errorf("statusFor(%v) = %v, want %v", c.pct, got, c.want)
		}
	}
}

func TestLoadStatus(t *testing.T) {
	cases := []struct {
		load  float64
		cores int
		want  Status
	}{
		{0, 0, OK},       // unknown cores → OK
		{8, 0, OK},       // zero cores can't be judged
		{3, 4, OK},       // 0.75 per core
		{4, 4, Warning},  // 1.0 per core
		{5, 4, Warning},  // 1.25 per core
		{6, 4, Critical}, // 1.5 per core
		{2, 1, Critical}, // heavy overload on single core
	}
	for _, c := range cases {
		if got := loadStatus(c.load, c.cores); got != c.want {
			t.Errorf("loadStatus(%v, %d) = %v, want %v", c.load, c.cores, got, c.want)
		}
	}
}

func TestHumanBytes(t *testing.T) {
	cases := []struct {
		in   uint64
		want string
	}{
		{0, "0 B"},
		{512, "512 B"},
		{1024, "1.0 KiB"},
		{1536, "1.5 KiB"},
		{1048576, "1.0 MiB"},
		{1073741824, "1.0 GiB"},
	}
	for _, c := range cases {
		if got := humanBytes(c.in); got != c.want {
			t.Errorf("humanBytes(%d) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestHumanDuration(t *testing.T) {
	cases := []struct {
		secs uint64
		want string
	}{
		{0, "0m"},
		{59, "0m"},
		{60, "1m"},
		{3600, "1h 0m"},
		{3660, "1h 1m"},
		{90000, "1d 1h 0m"},
		{273120, "3d 3h 52m"},
	}
	for _, c := range cases {
		if got := humanDuration(c.secs); got != c.want {
			t.Errorf("humanDuration(%d) = %q, want %q", c.secs, got, c.want)
		}
	}
}

func TestWorst(t *testing.T) {
	if got := worst(OK, OK, OK); got != OK {
		t.Errorf("all OK = %v, want ok", got)
	}
	if got := worst(OK, Warning, OK); got != Warning {
		t.Errorf("with warning = %v, want warning", got)
	}
	if got := worst(Warning, Critical, OK); got != Critical {
		t.Errorf("with critical = %v, want critical", got)
	}
	if got := worst(); got != OK {
		t.Errorf("empty = %v, want ok", got)
	}
}

func TestReportOverall(t *testing.T) {
	r := Report{
		Memory: MemInfo{Status: OK},
		Swap:   MemInfo{Status: OK},
		CPU:    CPUInfo{LoadStatus: Warning},
		Disks:  []DiskInfo{{Status: OK}, {Status: Critical}},
	}
	if got := r.Overall(); got != Critical {
		t.Errorf("Overall() = %v, want critical", got)
	}
}
