import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, UserPlus, Shield, Mail, Lock, User, Trash2, History, CheckCircle2, Edit2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const PERMISSIONS = [
  { id: "customers", label: "Gestão de Clientes" },
  { id: "campaigns", label: "Gestão de Campanhas" },
  { id: "automations", label: "Gestão de Automações" },
  { id: "chat", label: "Atendimento (Chat)" },
  { id: "settings", label: "Configurações do Sistema" },
  { id: "activities", label: "Visualizar Atividades" },
];

const ROLE_LABELS: Record<string, string> = {
  owner: "Dono",
  admin: "Administrador",
  manager: "Gerente",
  collaborator: "Colaborador",
  agent: "Agente",
  viewer: "Observador",
};

export default function SettingsCollaborators() {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    user_id: "",
    name: "",
    email: "",
    password: "",
    role: "collaborator",
    permissions: [] as string[],
  });
  const [isEditing, setIsEditing] = useState(false);

  const { data: collaborators, isLoading } = useQuery({
    queryKey: ["collaborators", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-collaborators", {
        body: { action: "list", tenantId: currentTenant?.id },
      });
      if (error) throw error;
      return data.collaborators;
    },
    enabled: !!currentTenant,
  });

  const { data: activities } = useQuery({
    queryKey: ["collaborator-activities", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborator_activities")
        .select(`
          id,
          activity_type,
          description,
          created_at,
          profiles:user_id (display_name)
        `)
        .eq("tenant_id", currentTenant?.id)
        .order("created_at", { ascending: false })
        .limit(10) as any;
      if (error) throw error;
      return data;
    },
    enabled: !!currentTenant,
  });

  const createMutation = useMutation({
    mutationFn: async (newData: typeof formData) => {
      const { data, error } = await supabase.functions.invoke("manage-collaborators", {
        body: {
          action: "create",
          tenantId: currentTenant?.id,
          collaboratorData: newData,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Colaborador criado com sucesso!");
      setIsModalOpen(false);
      setFormData({ user_id: "", name: "", email: "", password: "", role: "collaborator", permissions: [] });
      queryClient.invalidateQueries({ queryKey: ["collaborators"] });
      queryClient.invalidateQueries({ queryKey: ["collaborator-activities"] });
    },
    onError: (error: any) => {
      toast.error(`Erro ao criar colaborador: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("manage-collaborators", {
        body: {
          action: "delete",
          tenantId: currentTenant?.id,
          userId,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Colaborador removido.");
      queryClient.invalidateQueries({ queryKey: ["collaborators"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: res, error } = await supabase.functions.invoke("manage-collaborators", {
        body: {
          action: "update",
          tenantId: currentTenant?.id,
          userId: data.user_id,
          collaboratorData: {
            name: data.name,
            role: data.role,
            permissions: data.permissions,
            password: data.password || undefined,
          },
        },
      });
      if (error) throw error;
      return res;
    },
    onSuccess: () => {
      toast.success("Colaborador atualizado com sucesso!");
      setIsModalOpen(false);
      setIsEditing(false);
      setFormData({ user_id: "", name: "", email: "", password: "", role: "collaborator", permissions: [] });
      queryClient.invalidateQueries({ queryKey: ["collaborators"] });
      queryClient.invalidateQueries({ queryKey: ["collaborator-activities"] });
    },
    onError: (error: any) => {
      toast.error(`Erro ao atualizar colaborador: ${error.message}`);
    },
  });

  const handleEdit = (collab: any) => {
    setFormData({
      user_id: collab.user_id,
      name: collab.profiles?.display_name || "",
      email: collab.email || "",
      password: "",
      role: collab.role || "collaborator",
      permissions: collab.permissions || [],
    });
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const togglePermission = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(id)
        ? prev.permissions.filter((p) => p !== id)
        : [...prev.permissions, id],
    }));
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" /> Equipe e Permissões
              </h1>
              <p className="text-sm text-muted-foreground">Governança e controle de acesso granular (RBAC)</p>
            </div>
          </div>

          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="h-4 w-4" /> Novo Colaborador
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{isEditing ? "Editar Colaborador" : "Adicionar Colaborador"}</DialogTitle>
                <DialogDescription>
                  Defina o nível de acesso adequado para cada membro.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Nome Completo</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="name"
                      placeholder="Ex: João Silva"
                      className="pl-9"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="email">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@exemplo.com"
                      className="pl-9"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      disabled={isEditing}
                    />
                  </div>
                </div>

                {!isEditing && (
                  <div className="grid gap-2">
                    <Label htmlFor="password">Senha Temporária</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        className="pl-9"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="role">Nível de Acesso (Role)</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a função" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Observador (Leitura)</SelectItem>
                      <SelectItem value="agent">Agente (Atendimento)</SelectItem>
                      <SelectItem value="collaborator">Colaborador</SelectItem>
                      <SelectItem value="manager">Gerente</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="owner">Dono</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2 mt-2">
                  <Label>Permissões Customizadas</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {PERMISSIONS.map((perm) => (
                      <div key={perm.id} className="flex items-center space-x-2 border rounded-md p-2 hover:bg-secondary/20 transition-colors">
                        <Checkbox
                          id={perm.id}
                          checked={formData.permissions.includes(perm.id)}
                          onCheckedChange={() => togglePermission(perm.id)}
                        />
                        <label
                          htmlFor={perm.id}
                          className="text-[10px] font-medium leading-none cursor-pointer"
                        >
                          {perm.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setIsModalOpen(false);
                  setIsEditing(false);
                  setFormData({ user_id: "", name: "", email: "", password: "", role: "collaborator", permissions: [] });
                }}>Cancelar</Button>
                <Button 
                  onClick={() => isEditing ? updateMutation.mutate(formData) : createMutation.mutate(formData)}
                  disabled={createMutation.isPending || updateMutation.isPending || !formData.email || (!isEditing && !formData.password) || !formData.name}
                >
                  {createMutation.isPending || updateMutation.isPending ? "Salvando..." : (isEditing ? "Salvar" : "Convidar")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Membros Ativos</CardTitle>
                <CardDescription>Gerencie quem pode acessar este tenant</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Nível</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8">Carregando...</TableCell>
                      </TableRow>
                    ) : collaborators?.map((collab: any) => (
                      <TableRow key={collab.user_id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                              {collab.profiles?.display_name?.substring(0, 1) || "U"}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{collab.profiles?.display_name || "Usuário"}</span>
                              <span className="text-xs text-muted-foreground">{collab.email}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={collab.role === 'owner' || collab.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">
                            {ROLE_LABELS[collab.role] || collab.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/20 bg-green-500/5">Ativo</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(collab)} className="h-8 w-8">
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => {
                              if(confirm("Deseja remover este membro?")) deleteMutation.mutate(collab.user_id);
                            }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-primary/5 border-primary/10">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2 text-primary">
                  <ShieldAlert className="h-4 w-4" /> Logs de Auditoria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-4">Todas as alterações de permissões e convites são registradas para conformidade.</p>
                <Button variant="link" className="p-0 h-auto text-xs" onClick={() => navigate("/settings/audit")}>
                  Acessar logs completos →
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Atividades da Equipe</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activities?.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Nenhuma atividade recente.</p>
                  ) : activities?.map((activity: any) => (
                    <div key={activity.id} className="flex gap-3 text-xs">
                      <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
                      <div className="flex flex-col">
                        <span className="font-medium">{activity.profiles?.display_name || "Sistema"}</span>
                        <span className="text-muted-foreground">{activity.description}</span>
                        <span className="text-[10px] opacity-50">{new Date(activity.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
