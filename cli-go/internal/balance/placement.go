// Package balance ports the service-placement / balancing engine from
// cli/src/modules/balancing/* and cli/src/interfaces/placement.interface.ts.
// It computes placement plans across inventory nodes using one of five
// strategies, validates constraints, and plans/executes migrations.
package balance

import (
	"math"
	"strconv"
	"strings"
)

// Strategy enumerates the balancing strategies.
type Strategy string

const (
	BinPacking Strategy = "bin-packing"
	RoundRobin Strategy = "round-robin"
	Weighted   Strategy = "weighted"
	Affinity   Strategy = "affinity"
	Spread     Strategy = "spread"
)

// StrategyDescriptions matches STRATEGY_DESCRIPTIONS.
var StrategyDescriptions = map[Strategy]string{
	BinPacking: "Minimize node count by packing services tightly",
	RoundRobin: "Distribute services evenly across nodes",
	Weighted:   "Allocate proportionally to node capacity",
	Affinity:   "Co-locate related services on same nodes",
	Spread:     "Maximize spread for high availability",
}

// AllStrategies lists strategies in canonical order.
var AllStrategies = []Strategy{BinPacking, RoundRobin, Weighted, Affinity, Spread}

// ConstraintType enumerates placement constraint kinds.
type ConstraintType string

const (
	NodeAffinity        ConstraintType = "node-affinity"
	NodeAntiAffinity    ConstraintType = "node-anti-affinity"
	ServiceAffinity     ConstraintType = "service-affinity"
	ServiceAntiAffinity ConstraintType = "service-anti-affinity"
	ResourceLimit       ConstraintType = "resource-limit"
	RoleRequirement     ConstraintType = "role-requirement"
)

// Resources is a cpu(millicores)/memory(bytes) pair.
type Resources struct {
	CPU    int   `json:"cpu"`
	Memory int64 `json:"memory"`
}

// Service is the minimal service model used for placement.
type Service struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	CPU       string `json:"cpu"`    // e.g. "500m", "2"
	Memory    string `json:"memory"` // e.g. "512Mi", "2Gi"
	Replicas  int    `json:"replicas"`
}

// NodeState is a node's resource state during placement.
type NodeState struct {
	Label           string   `json:"label"`
	IP              string   `json:"ip"`
	Roles           []string `json:"roles"`
	TotalCPU        int      `json:"totalCpu"`    // millicores
	TotalMemory     int64    `json:"totalMemory"` // bytes
	AllocatedCPU    int      `json:"allocatedCpu"`
	AllocatedMemory int64    `json:"allocatedMemory"`
	Weight          int      `json:"weight,omitempty"`
	Services        []string `json:"services"`
}

func (n *NodeState) clone() NodeState {
	c := *n
	c.Services = append([]string(nil), n.Services...)
	return c
}

// PlacementDecision is one service→node assignment.
type PlacementDecision struct {
	Service     string    `json:"service"`
	Namespace   string    `json:"namespace"`
	TargetNode  string    `json:"targetNode"`
	CurrentNode string    `json:"currentNode,omitempty"`
	Resources   Resources `json:"resources"`
	Replicas    int       `json:"replicas"`
	Reason      string    `json:"reason"`
	Score       int       `json:"score"`
}

// Constraint is a placement constraint.
type Constraint struct {
	Type    ConstraintType `json:"type"`
	Service string         `json:"service"`
	Target  string         `json:"target,omitempty"`
	Roles   []string       `json:"roles,omitempty"`
	Hard    bool           `json:"hard"`
}

// Metrics describes placement quality.
type Metrics struct {
	TotalCPUUtilization    int `json:"totalCpuUtilization"`
	TotalMemoryUtilization int `json:"totalMemoryUtilization"`
	BalanceScore           int `json:"balanceScore"`
	MigrationCount         int `json:"migrationCount"`
	ConstraintsSatisfied   int `json:"constraintsSatisfied"`
	ConstraintsViolated    int `json:"constraintsViolated"`
}

// Plan is a full placement plan.
type Plan struct {
	ID         string              `json:"id"`
	CreatedAt  string              `json:"createdAt"`
	Strategy   Strategy            `json:"strategy"`
	Nodes      []NodeState         `json:"nodes"`
	Placements []PlacementDecision `json:"placements"`
	Migrations []Migration         `json:"migrations"`
	Warnings   []string            `json:"warnings"`
	Errors     []string            `json:"errors"`
	Score      int                 `json:"score"`
	Metrics    Metrics             `json:"metrics"`
}

// Migration plans moving a service between nodes.
type Migration struct {
	ID          string `json:"id"`
	Service     string `json:"service"`
	Namespace   string `json:"namespace"`
	SourceNode  string `json:"sourceNode"`
	TargetNode  string `json:"targetNode"`
	Status      string `json:"status"`
	StartedAt   string `json:"startedAt,omitempty"`
	CompletedAt string `json:"completedAt,omitempty"`
	Error       string `json:"error,omitempty"`
}

// Preset is a saved placement configuration.
type Preset struct {
	Name        string       `json:"name"`
	Description string       `json:"description"`
	CreatedAt   string       `json:"createdAt"`
	Strategy    Strategy     `json:"strategy"`
	Placements  []PresetPin  `json:"placements"`
	Constraints []Constraint `json:"constraints"`
}

// PresetPin pins a service to a node in a preset.
type PresetPin struct {
	Service string `json:"service"`
	Node    string `json:"node"`
}

// Options configure plan generation.
type Options struct {
	Strategy           Strategy
	DryRun             bool
	RespectConstraints bool
	AllowMigrations    bool
	MaxMigrations      int
	ExcludeServices    []string
	ExcludeNodes       []string
}

// ---- shared data tables (ported from placement.interface.ts) ----

// AffinityGroups co-locate related services (SERVICE_AFFINITY_GROUPS).
var AffinityGroups = map[string][]string{
	"databases":    {"postgresql", "mongodb", "mysql", "clickhouse", "valkey", "minio"},
	"core":         {"vault", "consul", "authentik", "cert-manager", "traefik"},
	"monitoring":   {"prometheus", "grafana", "loki", "alertmanager"},
	"code":         {"gitlab", "teamcity", "harbor", "coder"},
	"productivity": {"affine", "excalidraw", "penpot", "notesnook"},
}

// RoleRequirements maps service → preferred node roles (SERVICE_ROLE_REQUIREMENTS).
var RoleRequirements = map[string][]string{
	"traefik":      {"gateway", "master"},
	"pangolin":     {"gateway", "master"},
	"vault":        {"master"},
	"consul":       {"master"},
	"authentik":    {"master"},
	"cert-manager": {"master"},
	"minio":        {"storage", "master", "worker"},
	"syncthing":    {"storage", "worker"},
	"nextcloud":    {"storage", "worker"},
	"postgresql":   {"storage", "master", "worker"},
	"mongodb":      {"storage", "master", "worker"},
	"prometheus":   {"storage", "master"},
	"loki":         {"storage", "master"},
	"*":            {"worker", "master"},
}

// ServiceDependencies (subset used by affinity grouping).
var ServiceDependencies = map[string][]string{
	"*":         {"ingress/traefik", "service/vault"},
	"gitlab":    {"db/postgresql", "db/valkey"},
	"authentik": {"db/postgresql", "db/valkey"},
	"affine":    {"db/postgresql", "db/valkey", "db/minio"},
	"coder":     {"db/postgresql"},
	"n8n":       {"db/postgresql"},
	"stoat":     {"db/mongodb", "db/valkey", "db/minio", "db/rabbitmq"},
	"supabase":  {"db/postgresql"},
	"bytebase":  {"db/postgresql"},
	"teamcity":  {"db/postgresql"},
	"youtrack":  {"db/postgresql"},
}

// ServiceRoleRequirements returns preferred roles for a service (defaulting to "*").
func ServiceRoleRequirements(name string) []string {
	if r, ok := RoleRequirements[name]; ok {
		return r
	}
	return RoleRequirements["*"]
}

// FindAffinityGroup returns the affinity group of a service, or "".
func FindAffinityGroup(name string) string {
	for g, svcs := range AffinityGroups {
		for _, s := range svcs {
			if s == name {
				return g
			}
		}
	}
	return ""
}

// ---- resource helpers ----

// ParseCPU parses "500m"/"2" into millicores.
func ParseCPU(cpu string) int {
	if cpu == "" {
		return 0
	}
	if strings.HasSuffix(cpu, "m") {
		v, _ := strconv.Atoi(strings.TrimSuffix(cpu, "m"))
		return v
	}
	v, _ := strconv.Atoi(cpu)
	return v * 1000
}

// ParseMemory parses "512Mi"/"2Gi" into bytes.
func ParseMemory(mem string) int64 {
	units := []struct {
		suffix string
		mult   int64
	}{{"Ki", 1024}, {"Mi", 1 << 20}, {"Gi", 1 << 30}, {"Ti", 1 << 40}}
	for _, u := range units {
		if strings.HasSuffix(mem, u.suffix) {
			v, _ := strconv.Atoi(strings.TrimSuffix(mem, u.suffix))
			return int64(v) * u.mult
		}
	}
	v, _ := strconv.Atoi(mem)
	return int64(v)
}

func availCPU(n *NodeState) int      { return n.TotalCPU - n.AllocatedCPU }
func availMemory(n *NodeState) int64 { return n.TotalMemory - n.AllocatedMemory }

func canAccommodate(n *NodeState, cpu int, mem int64) bool {
	return availCPU(n) >= cpu && availMemory(n) >= mem
}

func utilization(allocated, total int64) int {
	if total == 0 {
		return 0
	}
	return int(math.Round(float64(allocated) / float64(total) * 100))
}

func hasRole(roles []string, want []string) bool {
	for _, w := range want {
		for _, r := range roles {
			if r == w {
				return true
			}
		}
	}
	return false
}

func contains(ss []string, v string) bool {
	for _, s := range ss {
		if s == v {
			return true
		}
	}
	return false
}
