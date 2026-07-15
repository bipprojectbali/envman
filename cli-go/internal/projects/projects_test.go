package projects

import "testing"

func mk(slug, creator string) Project {
	p := Project{Slug: slug, CreatedByID: creator}
	return p
}

func TestFilterMine(t *testing.T) {
	list := []Project{
		mk("a", "u1"),
		mk("b", "u2"),
		mk("c", "u1"),
		mk("d", ""),
	}

	got := FilterMine(list, "u1")
	if len(got) != 2 {
		t.Fatalf("expected 2 projects, got %d", len(got))
	}
	if got[0].Slug != "a" || got[1].Slug != "c" {
		t.Errorf("expected [a c], got [%s %s]", got[0].Slug, got[1].Slug)
	}

	if n := len(FilterMine(list, "nobody")); n != 0 {
		t.Errorf("expected 0 for unknown user, got %d", n)
	}
	if n := len(FilterMine(nil, "u1")); n != 0 {
		t.Errorf("expected 0 for nil list, got %d", n)
	}
}
