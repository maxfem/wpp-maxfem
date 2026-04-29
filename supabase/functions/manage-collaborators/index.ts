import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const findUserByEmail = async (supabaseAdmin: ReturnType<typeof createClient>, email: string) => {
  const targetEmail = email.trim().toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const existingUser = data.users.find((user) => user.email?.toLowerCase() === targetEmail);
    if (existingUser) return existingUser;
    if (data.users.length < perPage) break;
  }

  return null;
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
      const { password, name, role, permissions } = collaboratorData;
      const email = String(collaboratorData.email ?? "").trim().toLowerCase();
      const selectedRole = role === "admin" ? "admin" : "collaborator";

      if (!tenantId || !email || !name || !password) {
        return jsonResponse({ error: "Dados obrigatórios ausentes para criar colaborador." }, 400);
      }

      // 1. Create user in Auth, or reuse an already registered user with the same email.
      let createdNewUser = true;
      let authUser = null;
      const { data: createdAuthUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: name }
      });

      if (authError) {
        const isDuplicateEmail = authError.message?.toLowerCase().includes("already been registered");
        if (!isDuplicateEmail) throw authError;

        const existingUser = await findUserByEmail(supabaseAdmin, email);
        if (!existingUser) {
          return jsonResponse({ error: "Este e-mail já existe, mas não foi possível localizar o usuário para vinculá-lo." }, 409);
        }

        createdNewUser = false;
        authUser = { user: existingUser };
      } else {
        authUser = createdAuthUser;
      }

      if (!authUser?.user?.id) {
        return jsonResponse({ error: "Não foi possível identificar o usuário do colaborador." }, 400);
      }

      // 2. We use upsert for everything to handle the race condition with handle_new_user trigger
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert(
          [{
            user_id: authUser.user.id,
            display_name: name,
            status: 'active'
          }],
          { onConflict: 'user_id' }
        );

      if (profileError) throw profileError;

      // 3. Ensure the user is a member of the CORRECT tenant with the CORRECT role/permissions.
      // Only clean up trigger side-effects when this function really created the auth user.
      
      // First, get any auto-created tenant_id from the trigger so we can potentially cleanup the auto-created tenant too
      if (createdNewUser) {
        const { data: autoMembers } = await supabaseAdmin
          .from("tenant_members")
          .select("tenant_id")
          .eq("user_id", authUser.user.id);

        const autoTenantIds = (autoMembers ?? []).map(m => m.tenant_id).filter(id => id !== tenantId);

        if (autoTenantIds.length > 0) {
          await supabaseAdmin
            .from("tenant_members")
            .delete()
            .eq("user_id", authUser.user.id)
            .in("tenant_id", autoTenantIds);
          
          // Optional: delete the auto-created tenants themselves if they are empty
          // for (const id of autoTenantIds) {
          //   await supabaseAdmin.from("tenants").delete().eq("id", id);
          // }
        }
      }

      // 4. Create or Update the intended membership
      const { error: memberError } = await supabaseAdmin
        .from("tenant_members")
        .upsert([{
          tenant_id: tenantId,
          user_id: authUser.user.id,
          role: selectedRole,
          permissions: permissions || []
        }], { onConflict: 'tenant_id,user_id' });

      if (memberError) throw memberError;

      // 5. Cleanup user_roles only for users created by this flow, because the signup trigger
      // grants a global admin role that collaborators should not receive automatically.
      if (createdNewUser) {
        await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", authUser.user.id);
      }


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
                <p>${createdNewUser ? 'Seus dados de acesso:' : 'Seu usuário já existia. Use sua senha atual para acessar.'}</p>
                <ul>
                  <li><strong>E-mail:</strong> ${email}</li>
                  ${createdNewUser ? `<li><strong>Senha:</strong> ${password}</li>` : ''}
                </ul>
                <p>Sua função: <strong>${selectedRole === 'admin' ? 'Administrador' : 'Colaborador'}</strong></p>
                <p style="margin-top: 30px;">
                  <a href="https://wpp.maxapps.com.br/auth" style="background-color: #ED2B75; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Acessar Plataforma</a>
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
        activity_type: createdNewUser ? 'user_created' : 'user_linked',
        description: `Usuário ${name} (${email}) ${createdNewUser ? 'criado' : 'vinculado'} com a função ${selectedRole}.`,
        metadata: { permissions, createdNewUser }
      });

      return jsonResponse({ success: true, user: authUser.user, createdNewUser });
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

    if (action === "update") {
      const { userId, collaboratorData: updateData } = payload;
      const { name, role, permissions, password } = updateData;

      if (!userId || !tenantId) {
        return jsonResponse({ error: "UserId e TenantId são obrigatórios para atualizar." }, 400);
      }

      // 1. Update Profile (Name)
      if (name) {
        const { error: pErr } = await supabaseAdmin
          .from("profiles")
          .update({ display_name: name })
          .eq("user_id", userId);
        if (pErr) throw pErr;
      }

      // 2. Update Membership (Role/Permissions)
      if (role || permissions) {
        const updateObj: any = {};
        if (role) updateObj.role = role === "admin" ? "admin" : "collaborator";
        if (permissions) updateObj.permissions = permissions;

        const { error: mErr } = await supabaseAdmin
          .from("tenant_members")
          .update(updateObj)
          .eq("user_id", userId)
          .eq("tenant_id", tenantId);
        if (mErr) throw mErr;
      }

      // 3. Update Password in Auth
      if (password) {
        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: password
        });
        if (authErr) throw authErr;
      }

      // 4. Log Activity
      await supabaseAdmin.from("collaborator_activities").insert({
        user_id: userId,
        tenant_id: tenantId,
        activity_type: 'user_updated',
        description: `Colaborador atualizado. Alterações: ${[name && 'nome', role && 'função', permissions && 'permissões', password && 'senha'].filter(Boolean).join(', ')}.`,
        metadata: { updateData }
      });

      return jsonResponse({ success: true });
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
