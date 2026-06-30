package commands

import (
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

	add := &cobra.Command{
		Use:   "add <name>",
		Short: "Add a node to the cluster (runs the kubespray scale playbook)",
		Args:  cobra.ExactArgs(1),
		RunE: func(c *cobra.Command, args []string) error {
			ui.Info("adding node %s to the cluster", args[0])
			if err := node.Add(args[0]); err != nil {
				return err
			}
			ui.OK("node %s added", args[0])
			return nil
		},
	}

	remove := &cobra.Command{
		Use:   "remove <name>",
		Short: "Remove a node from the cluster (drains, then runs the kubespray playbook)",
		Args:  cobra.ExactArgs(1),
		RunE: func(c *cobra.Command, args []string) error {
			ui.Warn("removing node %s from the cluster", args[0])
			if err := node.Remove(args[0]); err != nil {
				return err
			}
			ui.OK("node %s removed", args[0])
			return nil
		},
	}

	cmd.AddCommand(list, cordon, uncordon, drain, add, remove)
	return cmd
}
