import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload = await req.json();
    const { action, tenantId, collaboratorData } = payload;

    if (action === "create") {
      const { email, password, name, role, permissions } = collaboratorData;

      // 1. Create user in Auth
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: name }
      });

      if (authError) throw authError;

      // 2. Create profile
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert([{
          id: authUser.user.id,
          user_id: authUser.user.id,
          display_name: name,
          status: 'active'
        }]);

      if (profileError) throw profileError;

      // 3. Create tenant member with role and permissions
      const { error: memberError } = await supabaseAdmin
        .from("tenant_members")
        .insert([{
          tenant_id: tenantId,
          user_id: authUser.user.id,
          role: role || 'collaborator',
          permissions: permissions || []
        }]);

      if (memberError) throw memberError;

      // 4. Send invitation email via SES (calling the other function or reusing logic)
      try {
        await supabaseAdmin.functions.invoke("send-email-ses", {
          body: {
            to: email,
            subject: "Bem-vindo ao Maxfem CRM",
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #ED2B75;">Olá, ${name}!</h2>
                <p>Você foi convidado para colaborar no Maxfem CRM.</p>
                <p>Seus dados de acesso:</p>
                <ul>
                  <li><strong>E-mail:</strong> ${email}</li>
                  <li><strong>Senha:</strong> ${password}</li>
                </ul>
                <p>Sua função: <strong>${role === 'admin' ? 'Administrador' : 'Colaborador'}</strong></p>
                <p style="margin-top: 30px;">
                  <a href="${req.headers.get("origin") || ""}/auth" style="background-color: #ED2B75; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Acessar Plataforma</a>
                </p>
              </div>
            `
          }
        });
      } catch (emailErr) {
        console.error("Erro ao enviar e-mail de convite:", emailErr);
        // We don't throw here to avoid failing the whole process if only email fails
      }

      // 5. Log activity
      await supabaseAdmin.from("collaborator_activities").insert({
        user_id: authUser.user.id,
        tenant_id: tenantId,
        activity_type: 'user_created',
        description: `Usuário ${name} (${email}) criado com a função ${role}.`,
        metadata: { permissions }
      });

      return new Response(JSON.stringify({ success: true, user: authUser.user }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const { data: members, error } = await supabaseAdmin
        .from("tenant_members")
        .select("user_id, role, permissions")
        .eq("tenant_id", tenantId);

      if (error) throw error;

      const userIds = (members ?? []).map((m: any) => m.user_id);
      let profilesMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profiles, error: pErr } = await supabaseAdmin
          .from("profiles")
          .select("user_id, display_name, status, avatar_url")
          .in("user_id", userIds);
        if (pErr) throw pErr;
        profilesMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.user_id, p]));
      }

      // Fetch emails from auth
      const emailsMap: Record<string, string> = {};
      await Promise.all(
        userIds.map(async (uid: string) => {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
          if (u?.user?.email) emailsMap[uid] = u.user.email;
        })
      );

      const collaborators = (members ?? []).map((m: any) => ({
        user_id: m.user_id,
        role: m.role,
        permissions: m.permissions,
        email: emailsMap[m.user_id] ?? null,
        profiles: profilesMap[m.user_id] ?? null,
      }));

      return new Response(JSON.stringify({ success: true, collaborators }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
        const { userId } = payload;
        // Delete tenant member first
        await supabaseAdmin.from("tenant_members").delete().eq("user_id", userId).eq("tenant_id", tenantId);
        // Optionally delete auth user (dangerous if they belong to other tenants, but here it's likely 1:1)
        // const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        // if (error) throw error;
        
        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });

  } catch (error: any) {
    console.error("Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
