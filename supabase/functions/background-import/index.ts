import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { job_id } = await req.json();

    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get the job
    const { data: job, error: jobError } = await supabase
      .from("background_jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.status === "completed") {
      return new Response(JSON.stringify({ message: "Job already completed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as processing
    await supabase.from("background_jobs").update({ status: "processing" }).eq("id", job_id);

    const { tenant_id, payload } = job;
    const { list_id, rows, headers } = payload;

    const nameIdx = headers.indexOf("name");
    const emailIdx = headers.indexOf("email");
    const phoneIdx = headers.indexOf("phone");
    const documentIdx = headers.indexOf("document");

    const batchSize = 100;
    let processed = job.progress || 0;
    const total = rows.length;

    // Process in batches
    for (let i = processed; i < total; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      for (const row of batch) {
        const name = row[nameIdx];
        if (!name) continue;

        const email = emailIdx >= 0 ? row[emailIdx] || null : null;
        const phone = phoneIdx >= 0 ? row[phoneIdx] || null : null;
        const document = documentIdx >= 0 ? row[documentIdx] || null : null;

        // Find or create customer (more robust than bulk upsert with single conflict)
        // Try phone first
        let customerId;
        if (phone) {
          const { data } = await supabase.from("customers").select("id").eq("tenant_id", tenant_id).eq("phone", phone).maybeSingle();
          if (data) customerId = data.id;
        }

        // Try email if phone not found
        if (!customerId && email) {
          const { data } = await supabase.from("customers").select("id").eq("tenant_id", tenant_id).eq("email", email).maybeSingle();
          if (data) customerId = data.id;
        }

        // Create if not found
        if (!customerId) {
          const { data, error } = await supabase.from("customers").insert({
            tenant_id, name, email, phone, document
          }).select("id").single();
          if (!error && data) customerId = data.id;
        } else {
          // Update existing
          await supabase.from("customers").update({ name, document, email, phone }).eq("id", customerId);
        }

        if (customerId) {
          await supabase.from("contact_list_members").upsert({
            list_id,
            customer_id: customerId
          }, { onConflict: 'list_id, customer_id' });
        }
      }

      processed += batch.length;
      
      // Update progress
      await supabase
        .from("background_jobs")
        .update({ progress: Math.min(processed, total) })
        .eq("id", job_id);
        
      // Check for timeout (leaving some buffer)
      // Deno.serve doesn't have a simple way to check elapsed time since start of request easily 
      // without manual tracking, but we can just process everything if it's not millions.
    }

    // Finalize list count
    const { count } = await supabase
      .from("contact_list_members")
      .select("*", { count: 'exact', head: true })
      .eq("list_id", list_id);

    await supabase
      .from("contact_lists")
      .update({ customer_count: count })
      .eq("id", list_id);

    // Mark as completed
    await supabase
      .from("background_jobs")
      .update({ status: "completed", progress: total })
      .eq("id", job_id);

    return new Response(JSON.stringify({ success: true, processed: total }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Background import error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
