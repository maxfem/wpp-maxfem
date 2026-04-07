import { useState, useCallback, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  type Connection,
  type Node,
  type Edge,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { X, Save } from "lucide-react";
import { toast } from "sonner";

import { FlowSidebar } from "@/components/campaign-flow/FlowSidebar";
import FlowNodeComponent from "@/components/campaign-flow/FlowNodeComponent";
import StartNode from "@/components/campaign-flow/StartNode";
import { NodeConfigPanel } from "@/components/campaign-flow/NodeConfigPanel";

const initialNodes: Node[] = [
  {
    id: "start",
    type: "startNode",
    position: { x: 400, y: 60 },
    data: { label: "Lead inserido" },
    deletable: false,
  },
];

const initialEdges: Edge[] = [];

let nodeId = 0;
const getNodeId = () => `node_${++nodeId}`;

function FlowEditorInner() {
  const navigate = useNavigate();
  const { id } = useParams();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [campaignName, setCampaignName] = useState("Sem nome");
  const [isActive, setIsActive] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const nodeTypes = useMemo(
    () => ({
      flowNode: FlowNodeComponent,
      startNode: StartNode,
    }),
    []
  );

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { strokeDasharray: "5 5", stroke: "#22c55e" } }, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData("application/reactflow");
      if (!raw || !reactFlowInstance) return;

      const nodeData = JSON.parse(raw);
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: getNodeId(),
        type: "flowNode",
        position,
        data: {
          ...nodeData,
          nodeType: nodeData.type,
        },
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === "startNode") return;
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleNodeDataUpdate = useCallback((nodeId: string, newData: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: newData } : n))
    );
    setSelectedNode((prev) => (prev && prev.id === nodeId ? { ...prev, data: newData } : prev));
  }, [setNodes]);

  const handleSave = () => {
    toast.success("Campanha salva!");
  };

  // Keep selectedNode in sync with nodes state
  const currentSelectedNode = selectedNode
    ? nodes.find((n) => n.id === selectedNode.id) || null
    : null;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Topbar */}
      <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-background z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/campaigns")} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold text-foreground">{campaignName}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Ativo</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <Button variant="outline" size="sm" onClick={handleSave}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Salvar
          </Button>
          <Button size="sm" onClick={() => { handleSave(); navigate("/campaigns"); }}>
            Salvar e fechar
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <FlowSidebar campaignName={campaignName} onNameChange={setCampaignName} />

        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            className="bg-muted/30"
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Controls className="!bg-background !border-border !shadow-sm" />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--muted-foreground) / 0.15)" />
          </ReactFlow>
        </div>

        {currentSelectedNode && (
          <NodeConfigPanel
            node={currentSelectedNode}
            onClose={() => setSelectedNode(null)}
            onUpdate={handleNodeDataUpdate}
          />
        )}
      </div>
    </div>
  );
}

export default function CampaignFlowEditor() {
  return (
    <ReactFlowProvider>
      <FlowEditorInner />
    </ReactFlowProvider>
  );
}
