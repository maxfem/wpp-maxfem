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
import { ArrowLeft, Plus, UserPlus, Shield, Mail, Lock, User, Trash2, History, CheckCircle2, Edit2 } from "lucide-react";
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
        .limit(10);
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
      toast.success("Colaborador criado com sucesso! E-mail de convite enviado via SES.");
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
      password: "", // Senha vazia a menos que queira mudar
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
              <h1 className="text-2xl font-bold text-foreground">Colaboradores</h1>
              <p className="text-sm text-muted-foreground">Gerencie sua equipe e permissões de acesso</p>
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
                  {isEditing 
                    ? "Atualize os dados do colaborador. Deixe a senha em branco para manter a atual." 
                    : "Preencha os dados abaixo. Um e-mail será enviado com as credenciais de acesso."}
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

                <div className="grid gap-2">
                  <Label htmlFor="password">{isEditing ? "Nova Senha (opcional)" : "Senha Temporária"}</Label>
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

                <div className="grid gap-2">
                  <Label htmlFor="role">Função Principal</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a função" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="collaborator">Colaborador</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2 mt-2">
                  <Label>Permissões Específicas (Atividades)</Label>
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
                          className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
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
                  {createMutation.isPending || updateMutation.isPending ? "Salvando..." : (isEditing ? "Salvar Alterações" : "Criar e Enviar Convite")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Membros da Equipe</CardTitle>
                <CardDescription>Lista de todos os usuários com acesso a este tenant</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Função</TableHead>
                      <TableHead>Permissões</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Carregando membros...
                        </TableCell>
                      </TableRow>
                    ) : collaborators?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Nenhum colaborador encontrado.
                        </TableCell>
                      </TableRow>
                    ) : collaborators?.map((collab: any) => (
                      <TableRow key={collab.user_id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs uppercase">
                              {collab.profiles?.display_name?.substring(0, 2) || "U"}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{collab.profiles?.display_name || "Usuário"}</span>
                              <span className="text-xs text-muted-foreground">ID: {collab.user_id.substring(0, 8)}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={collab.role === 'admin' ? 'default' : 'secondary'} className="text-[10px] px-2 py-0 h-5">
                            {collab.role === 'admin' ? <Shield className="h-3 w-3 mr-1" /> : null}
                            {collab.role === 'admin' ? 'Admin' : 'Colaborador'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {collab.permissions?.length > 0 ? collab.permissions.slice(0, 2).map((p: string) => (
                              <Badge key={p} variant="outline" className="text-[10px] px-1 py-0 h-4 bg-muted/50 border-none">
                                {PERMISSIONS.find(item => item.id === p)?.label || p}
                              </Badge>
                            )) : <span className="text-xs text-muted-foreground italic">Padrão</span>}
                            {collab.permissions?.length > 2 && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                +{collab.permissions.length - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] gap-1 text-green-500 border-green-500/20 bg-green-500/5">
                            <CheckCircle2 className="h-2 w-2" /> Ativo
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              onClick={() => handleEdit(collab)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                if(confirm("Tem certeza que deseja remover este colaborador?")) {
                                  deleteMutation.mutate(collab.user_id);
                                }
                              }}
                            >
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
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" /> Atividades Recentes
                </CardTitle>
                <CardDescription>Logs de alterações na equipe</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {activities?.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma atividade registrada.</p>
                ) : activities?.map((activity: any) => (
                  <div key={activity.id} className="relative pl-4 pb-4 border-l border-border last:pb-0">
                    <div className="absolute left-[-5px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <p className="text-sm font-medium">{activity.description}</p>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-[10px] text-muted-foreground italic">Por: {activity.profiles?.display_name || 'Sistema'}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(activity.created_at).toLocaleDateString()} {new Date(activity.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
                {activities?.length > 0 && (
                  <Button variant="link" className="w-full text-xs" onClick={() => navigate("/activities")}>
                    Ver todos os logs
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Envio Automático</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Ao criar um novo usuário, o sistema utiliza o <strong>Amazon SES</strong> configurado em sua conta para disparar um e-mail de boas-vindas com a senha gerada.
                </p>
                <Button 
                  variant="link" 
                  className="p-0 h-auto text-xs mt-2"
                  onClick={() => navigate("/settings/integrations/aws")}
                >
                  Ver configurações AWS SES →
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
