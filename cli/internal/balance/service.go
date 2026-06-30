package balance

import (
	"math"
	"time"

	"github.com/google/uuid"
)

// ServiceDefaults maps service name → default resource request, ported from the
// resource table in service.interface.ts (used when a service has no explicit
// resources configured).
var ServiceDefaults = map[string]Resources{
	"postgresql":   {2000, 2 << 30},
	"mongodb":      {1000, 1 << 30},
	"clickhouse":   {2000, 4 << 30},
	"mysql":        {1000, 1 << 30},
	"valkey":       {500, 512 << 20},
	"minio":        {500, 512 << 20},
	"rabbitmq":     {500, 512 << 20},
	"vault":        {500, 256 << 20},
	"consul":       {500, 256 << 20},
	"traefik":      {500, 128 << 20},
	"authentik":    {1000, 512 << 20},
	"cert-manager": {100, 128 << 20},
	"monitoring":   {1000, 1 << 30},
	"logging":      {500, 512 << 20},
	"gitlab":       {4000, 4 << 30},
	"teamcity":     {2000, 2 << 30},
	"coder":        {1000, 1 << 30},
	"n8n":          {500, 512 << 20},
}

// DefaultServiceResources returns a service's resource request (millicores/bytes
// rendered back to strings), defaulting modestly when unknown.
func DefaultServiceResources(name string) (cpu string, memory string) {
	r, ok := ServiceDefaults[name]
	if !ok {
		return "250m", "256Mi"
	}
	return millis(r.CPU), bytesToStr(r.Memory)
}

// GeneratePlan builds a placement plan for the given services on the given nodes.
// Ported from BalancingService.generatePlan.
func GeneratePlan(svcs []Service, nodes []NodeState, opts Options) Plan {
	target := svcs
	if len(opts.ExcludeServices) > 0 {
		target = nil
		for _, s := range svcs {
			if !contains(opts.ExcludeServices, s.Name) {
				target = append(target, s)
			}
		}
	}
	var constraints []Constraint
	if opts.RespectConstraints {
		constraints = generateDefaultConstraints(target)
	}
	placements := Execute(opts.Strategy, target, nodes, constraints)

	// recompute allocations per node from placements
	resultNodes := workingCopy(nodes)
	for i := range resultNodes {
		var cpu int
		var mem int64
		for _, p := range placements {
			if p.TargetNode == resultNodes[i].Label {
				cpu += p.Resources.CPU * p.Replicas
				mem += p.Resources.Memory * int64(p.Replicas)
			}
		}
		resultNodes[i].AllocatedCPU = cpu
		resultNodes[i].AllocatedMemory = mem
	}

	warnings, violations := validatePlacements(placements, constraints)
	metrics := calcMetrics(placements, nodes, len(constraints), len(violations), 0)

	var errs []string
	for _, v := range violations {
		if v.hard {
			errs = append(errs, v.msg)
		}
	}
	return Plan{
		ID:         uuid.NewString(),
		CreatedAt:  time.Now().UTC().Format(time.RFC3339),
		Strategy:   opts.Strategy,
		Nodes:      resultNodes,
		Placements: placements,
		Warnings:   warnings,
		Errors:     errs,
		Score:      metrics.BalanceScore,
		Metrics:    metrics,
	}
}

// generateDefaultConstraints adds soft role-requirement constraints for each
// service plus service-affinity within affinity groups.
func generateDefaultConstraints(svcs []Service) []Constraint {
	var out []Constraint
	for _, s := range svcs {
		if roles, ok := RoleRequirements[s.Name]; ok {
			out = append(out, Constraint{Type: RoleRequirement, Service: s.Name, Roles: roles, Hard: false})
		}
		if g := FindAffinityGroup(s.Name); g != "" {
			for _, other := range AffinityGroups[g] {
				if other != s.Name {
					out = append(out, Constraint{Type: ServiceAffinity, Service: s.Name, Target: other, Hard: false})
				}
			}
		}
	}
	return out
}

type violation struct {
	msg  string
	hard bool
}

func validatePlacements(placements []PlacementDecision, constraints []Constraint) (warnings []string, violations []violation) {
	byNode := map[string][]string{}
	nodeOf := map[string]string{}
	for _, p := range placements {
		byNode[p.TargetNode] = append(byNode[p.TargetNode], p.Service)
		nodeOf[p.Service] = p.TargetNode
	}
	for _, c := range constraints {
		node, placed := nodeOf[c.Service]
		if !placed {
			continue
		}
		ns := &NodeState{Label: node, Services: byNode[node]}
		// roles unknown here; role-requirement soft constraints are best-effort skipped
		if c.Type == RoleRequirement {
			continue
		}
		if !checkConstraint(c, ns) {
			v := violation{msg: string(c.Type) + " unmet for " + c.Service, hard: c.Hard}
			violations = append(violations, v)
			if !c.Hard {
				warnings = append(warnings, v.msg)
			}
		}
	}
	return warnings, violations
}

func calcMetrics(placements []PlacementDecision, nodes []NodeState, constraintCount, violated, migrations int) Metrics {
	var totalCPU, usedCPU int
	var totalMem, usedMem int64
	for i := range nodes {
		totalCPU += nodes[i].TotalCPU
		totalMem += nodes[i].TotalMemory
	}
	memUtils := make([]float64, len(nodes))
	for i := range nodes {
		var cpu int
		var mem int64
		for _, p := range placements {
			if p.TargetNode == nodes[i].Label {
				cpu += p.Resources.CPU * p.Replicas
				mem += p.Resources.Memory * int64(p.Replicas)
			}
		}
		usedCPU += cpu
		usedMem += mem
		memUtils[i] = float64(utilization(mem, nodes[i].TotalMemory))
	}
	// balance score = 100 - stddev of per-node memory utilization
	balance := 100
	if len(memUtils) > 0 {
		var sum float64
		for _, u := range memUtils {
			sum += u
		}
		avg := sum / float64(len(memUtils))
		var varc float64
		for _, u := range memUtils {
			varc += (u - avg) * (u - avg)
		}
		std := math.Sqrt(varc / float64(len(memUtils)))
		balance = int(math.Max(0, math.Round(100-std)))
	}
	return Metrics{
		TotalCPUUtilization:    utilization(int64(usedCPU), int64(totalCPU)),
		TotalMemoryUtilization: utilization(usedMem, totalMem),
		BalanceScore:           balance,
		MigrationCount:         migrations,
		ConstraintsSatisfied:   constraintCount - violated,
		ConstraintsViolated:    violated,
	}
}

func millis(m int) string {
	return itoa(m) + "m"
}

func bytesToStr(b int64) string {
	switch {
	case b >= 1<<30:
		return itoa(int(b>>30)) + "Gi"
	case b >= 1<<20:
		return itoa(int(b>>20)) + "Mi"
	default:
		return itoa(int(b>>10)) + "Ki"
	}
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	neg := i < 0
	if neg {
		i = -i
	}
	var buf [20]byte
	p := len(buf)
	for i > 0 {
		p--
		buf[p] = byte('0' + i%10)
		i /= 10
	}
	if neg {
		p--
		buf[p] = '-'
	}
	return string(buf[p:])
}
