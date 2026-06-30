package commands

import (
	"reflect"
	"testing"
)

func TestSortedKeys(t *testing.T) {
	m := map[string]appEntry{
		"vault":      {},
		"authentik":  {},
		"postgresql": {},
	}
	got := sortedKeys(m)
	want := []string{"authentik", "postgresql", "vault"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("sortedKeys = %v, want %v", got, want)
	}
	if len(sortedKeys(map[string]appEntry{})) != 0 {
		t.Errorf("sortedKeys(empty) should be empty")
	}
}
