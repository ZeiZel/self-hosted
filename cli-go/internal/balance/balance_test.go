package balance

import "testing"

func sampleNodes() []NodeState {
	return []NodeState{
		{Label: "master-01", Roles: []string{"master"}, TotalCPU: 8000, TotalMemory: 16 << 30},
		{Label: "worker-01", Roles: []string{"worker"}, TotalCPU: 16000, TotalMemory: 32 << 30},
	}
}

func sampleServices() []Service {
	return []Service{
		{Name: "glance", Namespace: "infrastructure", CPU: "250m", Memory: "256Mi", Replicas: 1},
		{Name: "postgresql", Namespace: "db", CPU: "2000m", Memory: "2Gi", Replicas: 1},
		{Name: "vault", Namespace: "service", CPU: "500m", Memory: "256Mi", Replicas: 1},
	}
}

func TestParseHelpers(t *testing.T) {
	if ParseCPU("250m") != 250 || ParseCPU("2") != 2000 {
		t.Fatal("ParseCPU")
	}
	if ParseMemory("2Gi") != 2<<30 || ParseMemory("512Mi") != 512<<20 {
		t.Fatal("ParseMemory")
	}
}

func TestAllStrategiesPlaceEverything(t *testing.T) {
	for _, strat := range AllStrategies {
		plan := GeneratePlan(sampleServices(), sampleNodes(), Options{Strategy: strat, RespectConstraints: true})
		if len(plan.Placements) != 3 {
			t.Errorf("%s: placed %d/3", strat, len(plan.Placements))
		}
		if plan.Metrics.BalanceScore < 0 || plan.Metrics.BalanceScore > 100 {
			t.Errorf("%s: balance score out of range: %d", strat, plan.Metrics.BalanceScore)
		}
	}
}

func TestVaultPrefersMaster(t *testing.T) {
	plan := GeneratePlan(sampleServices(), sampleNodes(), Options{Strategy: BinPacking, RespectConstraints: true})
	for _, d := range plan.Placements {
		if d.Service == "vault" && d.TargetNode != "master-01" {
			t.Errorf("vault placed on %s, expected master-01 (role requirement)", d.TargetNode)
		}
	}
}

func TestRoleRequirementsDefault(t *testing.T) {
	if r := ServiceRoleRequirements("unknown-svc"); len(r) == 0 || r[0] != "worker" {
		t.Errorf("default role requirement = %v", r)
	}
	if FindAffinityGroup("postgresql") != "databases" {
		t.Errorf("postgresql affinity group")
	}
}
