package commands

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/ZeiZel/self-hosted/cli/internal/node"
	"github.com/ZeiZel/self-hosted/cli/internal/ui"
	"github.com/spf13/cobra"
)

func newNodeCmd(g *Global) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "node",
		Short: "Manage Kubernetes cluster nodes",
	}

	list := &cobra.Command{
		Use:   "list",
		Short: "List cluster nodes (kubectl get nodes -o wide)",
		RunE: func(c *cobra.Command, _ []string) error {
			return node.List()
		},
	}

	cordon := &cobra.Command{
		Use:   "cordon <name>",
		Short: "Mark a node as unschedulable",
		Args:  cobra.ExactArgs(1),
		RunE: func(c *cobra.Command, args []string) error {
			ui.Info("cordoning node %s", args[0])
			if err := node.Cordon(args[0]); err != nil {
				return err
			}
			ui.OK("node %s cordoned", args[0])
			return nil
		},
	}

	uncordon := &cobra.Command{
		Use:   "uncordon <name>",
		Short: "Mark a node as schedulable",
		Args:  cobra.ExactArgs(1),
		RunE: func(c *cobra.Command, args []string) error {
			ui.Info("uncordoning node %s", args[0])
			if err := node.Uncordon(args[0]); err != nil {
				return err
			}
			ui.OK("node %s uncordoned", args[0])
			return nil
		},
	}

	var force bool
	drain := &cobra.Command{
		Use:   "drain <name>",
		Short: "Evict pods from a node (ignores daemonsets, deletes emptyDir data)",
		Args:  cobra.ExactArgs(1),
		RunE: func(c *cobra.Command, args []string) error {
			ui.Info("draining node %s (force=%v)", args[0], force)
			if err := node.Drain(args[0], force); err != nil {
				return err
			}
			ui.OK("node %s drained", args[0])
			return nil
		},
	}
	drain.Flags().BoolVar(&force, "force", false, "Evict pods not managed by a controller")

	var inventory string
	add := &cobra.Command{
		Use:   "add <label>",
		Short: "Add a node to the cluster (kubespray scale)",
		Long: "Joins a node to the cluster. The node must first be registered with " +
			"'selfhost inventory add'; this regenerates the Ansible inventory from the " +
			"machine database, then runs the scale playbook (OS prep + kubespray scale).",
		Args: cobra.ExactArgs(1),
		RunE: func(c *cobra.Command, args []string) error {
			if err := regenInventory(inventory); err != nil {
				return err
			}
			ui.Info("adding node %s to the cluster", args[0])
			if err := node.Add(args[0], inventory); err != nil {
				return err
			}
			ui.OK("node %s added", args[0])
			return nil
		},
	}
	add.Flags().StringVar(&inventory, "inventory", "hosts.ini", "Inventory file under ansible/inventory/")

	var removeKeep bool
	remove := &cobra.Command{
		Use:   "remove <label>",
		Short: "Remove a node from the cluster (kubespray remove-node)",
		Long: "Gracefully removes a node (cordon + drain + reset of that node only via " +
			"kubespray remove-node), then drops it from the machine inventory unless --keep.",
		Args: cobra.ExactArgs(1),
		RunE: func(c *cobra.Command, args []string) error {
			ok, err := confirm("Remove node " + args[0] + " from the cluster?")
			if err != nil {
				return err
			}
			if !ok {
				ui.Info("cancelled")
				return nil
			}
			ui.Warn("removing node %s from the cluster", args[0])
			if err := node.Remove(args[0], inventory); err != nil {
				return err
			}
			if !removeKeep {
				if d, derr := openDB(); derr == nil {
					if _, e := d.DeleteMachine(args[0]); e == nil {
						ui.Info("removed %s from the machine inventory", args[0])
					}
					d.Close()
				}
			}
			ui.OK("node %s removed", args[0])
			return nil
		},
	}
	remove.Flags().StringVar(&inventory, "inventory", "hosts.ini", "Inventory file under ansible/inventory/")
	remove.Flags().BoolVar(&removeKeep, "keep", false, "Keep the node in the machine inventory DB")

	cmd.AddCommand(list, cordon, uncordon, drain, add, remove)
	return cmd
}

// regenInventory writes the Ansible inventory from the machine DB so a newly
// registered node is present before kubespray scale runs.
func regenInventory(inventory string) error {
	paths, err := repoRoot()
	if err != nil {
		return err
	}
	d, err := openDB()
	if err != nil {
		return err
	}
	defer d.Close()
	machines, err := d.ListMachines()
	if err != nil {
		return err
	}
	if len(machines) == 0 {
		return fmt.Errorf("no machines in inventory — add the node first with 'selfhost inventory add'")
	}
	out := filepath.Join(paths.Inventory, inventory)
	if err := os.MkdirAll(paths.Inventory, 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(out, []byte(renderAnsibleInventory(machines)), 0o644); err != nil {
		return err
	}
	ui.Info("regenerated inventory %s (%d machines)", out, len(machines))
	return nil
}
