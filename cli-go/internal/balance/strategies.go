package balance

import (
	"fmt"
	"sort"
)

// score computes a placement score (higher is better); -1 means cannot place.
// Ported from BaseStrategy.calculateScore.
func score(svc Service, node *NodeState, constraints []Constraint) int {
	s := 100
	reqCPU := ParseCPU(svc.CPU)
	reqMem := ParseMemory(svc.Memory)
	if !canAccommodate(node, reqCPU, reqMem) {
		return -1
	}
	cpuHeadroom := float64(availCPU(node)) / float64(max1(node.TotalCPU))
	memHeadroom := float64(availMemory(node)) / float64(max1i64(node.TotalMemory))
	s += int((cpuHeadroom + memHeadroom) * 20)

	if hasRole(node.Roles, ServiceRoleRequirements(svc.Name)) {
		s += 30
	}
	for _, c := range constraints {
		if c.Service != svc.Name {
			continue
		}
		if checkConstraint(c, node) {
			s += 10
		} else if c.Hard {
			return -1
		} else {
			s -= 20
		}
	}
	return s
}

func checkConstraint(c Constraint, node *NodeState) bool {
	switch c.Type {
	case NodeAffinity:
		return c.Target == node.Label
	case NodeAntiAffinity:
		return c.Target != node.Label
	case ServiceAffinity:
		return contains(node.Services, c.Target)
	case ServiceAntiAffinity:
		return !contains(node.Services, c.Target)
	case RoleRequirement:
		return hasRole(node.Roles, c.Roles)
	default:
		return true
	}
}

func eligibleNodes(svc Service, nodes []NodeState, constraints []Constraint) []*NodeState {
	reqCPU := ParseCPU(svc.CPU)
	reqMem := ParseMemory(svc.Memory)
	var out []*NodeState
	for i := range nodes {
		n := &nodes[i]
		if !canAccommodate(n, reqCPU, reqMem) {
			continue
		}
		ok := true
		for _, c := range constraints {
			if c.Service == svc.Name && c.Hard && !checkConstraint(c, n) {
				ok = false
				break
			}
		}
		if ok {
			out = append(out, n)
		}
	}
	return out
}

func filterByRole(nodes []*NodeState, roles []string) []*NodeState {
	var matching []*NodeState
	for _, n := range nodes {
		if hasRole(n.Roles, roles) {
			matching = append(matching, n)
		}
	}
	if len(matching) > 0 {
		return matching
	}
	return nodes
}

// sortServices orders by memory descending (largest first).
func sortServices(svcs []Service) []Service {
	out := append([]Service(nil), svcs...)
	sort.SliceStable(out, func(i, j int) bool {
		return ParseMemory(out[i].Memory) > ParseMemory(out[j].Memory)
	})
	return out
}

func allocate(node *NodeState, svc Service) {
	node.AllocatedCPU += ParseCPU(svc.CPU) * svc.Replicas
	node.AllocatedMemory += ParseMemory(svc.Memory) * int64(svc.Replicas)
	node.Services = append(node.Services, svc.Name)
}

func decision(svc Service, node *NodeState, reason string, sc int) PlacementDecision {
	return PlacementDecision{
		Service: svc.Name, Namespace: svc.Namespace, TargetNode: node.Label,
		Resources: Resources{CPU: ParseCPU(svc.CPU), Memory: ParseMemory(svc.Memory)},
		Replicas:  svc.Replicas, Reason: reason, Score: sc,
	}
}

func workingCopy(nodes []NodeState) []NodeState {
	out := make([]NodeState, len(nodes))
	for i := range nodes {
		out[i] = nodes[i].clone()
	}
	return out
}

// Execute dispatches to the named strategy.
func Execute(strat Strategy, svcs []Service, nodes []NodeState, constraints []Constraint) []PlacementDecision {
	switch strat {
	case RoundRobin:
		return roundRobin(svcs, nodes, constraints)
	case Weighted:
		return weighted(svcs, nodes, constraints)
	case Affinity:
		return affinity(svcs, nodes, constraints)
	case Spread:
		return spread(svcs, nodes, constraints)
	default:
		return binPacking(svcs, nodes, constraints)
	}
}

// binPacking minimises node count by packing tightly (most-utilised first).
func binPacking(svcs []Service, nodes []NodeState, constraints []Constraint) []PlacementDecision {
	wn := workingCopy(nodes)
	var decisions []PlacementDecision
	for _, svc := range sortServices(svcs) {
		cands := filterByRole(eligibleNodes(svc, wn, constraints), ServiceRoleRequirements(svc.Name))
		if len(cands) == 0 {
			continue
		}
		sort.SliceStable(cands, func(i, j int) bool {
			return util(cands[i]) > util(cands[j])
		})
		t := cands[0]
		decisions = append(decisions, decision(svc, t, packReason(svc, t), score(svc, t, constraints)))
		allocate(t, svc)
	}
	return decisions
}

func packReason(svc Service, n *NodeState) string {
	u := utilization(n.AllocatedMemory, n.TotalMemory)
	switch {
	case svc.Name == "traefik" || svc.Name == "pangolin":
		return "Gateway/ingress service"
	case svc.Name == "vault" || svc.Name == "consul" || svc.Name == "authentik" || svc.Name == "cert-manager":
		return "Core service on master"
	case hasRole(n.Roles, ServiceRoleRequirements(svc.Name)):
		return fmt.Sprintf("Role match, node %d%% utilized", u)
	default:
		return fmt.Sprintf("Bin-packed, node %d%% utilized", u)
	}
}

// roundRobin distributes evenly (fewest placements first).
func roundRobin(svcs []Service, nodes []NodeState, constraints []Constraint) []PlacementDecision {
	wn := workingCopy(nodes)
	counts := map[string]int{}
	for i := range wn {
		counts[wn[i].Label] = len(wn[i].Services)
	}
	var decisions []PlacementDecision
	for _, svc := range sortServices(svcs) {
		cands := filterByRole(eligibleNodes(svc, wn, constraints), ServiceRoleRequirements(svc.Name))
		if len(cands) == 0 {
			continue
		}
		sort.SliceStable(cands, func(i, j int) bool { return counts[cands[i].Label] < counts[cands[j].Label] })
		t := cands[0]
		decisions = append(decisions, decision(svc, t, fmt.Sprintf("Round-robin slot %d", counts[t.Label]+1), score(svc, t, constraints)))
		allocate(t, svc)
		counts[t.Label]++
	}
	return decisions
}

// weighted allocates proportionally to node capacity.
func weighted(svcs []Service, nodes []NodeState, constraints []Constraint) []PlacementDecision {
	wn := workingCopy(nodes)
	var totalMem int64
	for i := range wn {
		totalMem += wn[i].TotalMemory
	}
	weights := map[string]int{}
	for i := range wn {
		w := wn[i].Weight
		if w == 0 && totalMem > 0 {
			w = int(float64(wn[i].TotalMemory) / float64(totalMem) * 100)
		}
		weights[wn[i].Label] = w
	}
	var decisions []PlacementDecision
	for _, svc := range sortServices(svcs) {
		cands := filterByRole(eligibleNodes(svc, wn, constraints), ServiceRoleRequirements(svc.Name))
		if len(cands) == 0 {
			continue
		}
		sort.SliceStable(cands, func(i, j int) bool {
			bi := weights[cands[i].Label] - utilization(cands[i].AllocatedMemory, cands[i].TotalMemory)
			bj := weights[cands[j].Label] - utilization(cands[j].AllocatedMemory, cands[j].TotalMemory)
			return bi > bj
		})
		t := cands[0]
		reason := fmt.Sprintf("Weight %d%%, utilization %d%%", weights[t.Label], utilization(t.AllocatedMemory, t.TotalMemory))
		decisions = append(decisions, decision(svc, t, reason, score(svc, t, constraints)))
		allocate(t, svc)
	}
	return decisions
}

// affinity co-locates related services by group.
func affinity(svcs []Service, nodes []NodeState, constraints []Constraint) []PlacementDecision {
	wn := workingCopy(nodes)
	groups, order := groupByAffinity(svcs)
	var decisions []PlacementDecision
	for _, gname := range order {
		group := sortServices(groups[gname])
		gnode := bestNodeForGroup(group, wn, constraints)
		if gnode == nil {
			continue
		}
		for _, svc := range group {
			cands := eligibleNodes(svc, wn, constraints)
			var t *NodeState
			for _, n := range cands {
				if n.Label == gnode.Label {
					t = n
					break
				}
			}
			reason := "Affinity group: " + gname
			if t == nil {
				rc := filterByRole(cands, ServiceRoleRequirements(svc.Name))
				if len(rc) > 0 {
					t = rc[0]
				} else if len(cands) > 0 {
					t = cands[0]
				}
				reason = "Fallback from affinity group: " + gname
			}
			if t == nil {
				continue
			}
			decisions = append(decisions, decision(svc, t, reason, score(svc, t, constraints)))
			allocate(t, svc)
		}
	}
	return decisions
}

func groupByAffinity(svcs []Service) (map[string][]Service, []string) {
	groups := map[string][]Service{}
	var order []string
	add := func(g string, s Service) {
		if _, ok := groups[g]; !ok {
			order = append(order, g)
		}
		groups[g] = append(groups[g], s)
	}
	var ungrouped []Service
	for _, s := range svcs {
		if g := FindAffinityGroup(s.Name); g != "" {
			add(g, s)
		} else {
			ungrouped = append(ungrouped, s)
		}
	}
	for _, s := range ungrouped {
		add("ns:"+s.Namespace, s)
	}
	return groups, order
}

func bestNodeForGroup(group []Service, nodes []NodeState, constraints []Constraint) *NodeState {
	var totalCPU int
	var totalMem int64
	for _, s := range group {
		if len(eligibleNodes(s, nodes, constraints)) == 0 {
			continue
		}
		totalCPU += ParseCPU(s.CPU)
		totalMem += ParseMemory(s.Memory)
	}
	var capable []*NodeState
	for i := range nodes {
		n := &nodes[i]
		if availCPU(n) >= totalCPU && availMemory(n) >= totalMem {
			capable = append(capable, n)
		}
	}
	names := map[string]bool{}
	for _, s := range group {
		names[s.Name] = true
	}
	pool := capable
	if len(pool) == 0 {
		for i := range nodes {
			pool = append(pool, &nodes[i])
		}
	}
	if len(pool) == 0 {
		return nil
	}
	best := pool[0]
	for _, n := range pool[1:] {
		if related(n, names) > related(best, names) {
			best = n
		} else if related(n, names) == related(best, names) && availMemory(n) > availMemory(best) {
			best = n
		}
	}
	return best
}

func related(n *NodeState, names map[string]bool) int {
	c := 0
	for _, s := range n.Services {
		if names[s] {
			c++
		}
	}
	return c
}

// spread maximises distribution for HA (fewest same-namespace per node).
func spread(svcs []Service, nodes []NodeState, constraints []Constraint) []PlacementDecision {
	wn := workingCopy(nodes)
	dist := map[string]map[string]int{} // node -> namespace -> count
	nsCount := func(node, ns string) int {
		if m, ok := dist[node]; ok {
			return m[ns]
		}
		return 0
	}
	var decisions []PlacementDecision
	for _, svc := range sortServices(svcs) {
		cands := filterByRole(eligibleNodes(svc, wn, constraints), ServiceRoleRequirements(svc.Name))
		if len(cands) == 0 {
			continue
		}
		sort.SliceStable(cands, func(i, j int) bool {
			si := spreadScore(cands[i], svc.Namespace, nsCount)
			sj := spreadScore(cands[j], svc.Namespace, nsCount)
			if si != sj {
				return si > sj
			}
			return availMemory(cands[i]) > availMemory(cands[j])
		})
		t := cands[0]
		n := nsCount(t.Label, svc.Namespace)
		reason := fmt.Sprintf("Spread: %d %s services", n+1, svc.Namespace)
		if n == 0 {
			reason = fmt.Sprintf("First %s service on node", svc.Namespace)
		}
		decisions = append(decisions, decision(svc, t, reason, score(svc, t, constraints)))
		allocate(t, svc)
		if dist[t.Label] == nil {
			dist[t.Label] = map[string]int{}
		}
		dist[t.Label][svc.Namespace]++
	}
	return decisions
}

func spreadScore(n *NodeState, ns string, nsCount func(string, string) int) int {
	s := 100
	s -= nsCount(n.Label, ns) * 20
	s -= len(n.Services) * 5
	s += int(float64(availMemory(n)) / float64(max1i64(n.TotalMemory)) * 100 * 0.2)
	return s
}

func util(n *NodeState) float64 {
	return float64(n.AllocatedMemory) / float64(max1i64(n.TotalMemory))
}

func max1(v int) int {
	if v < 1 {
		return 1
	}
	return v
}
func max1i64(v int64) int64 {
	if v < 1 {
		return 1
	}
	return v
}
