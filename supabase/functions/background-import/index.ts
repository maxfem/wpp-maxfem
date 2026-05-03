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
      const customersToInsert = [];

      for (const row of batch) {
        const name = row[nameIdx];
        if (!name) continue;

        customersToInsert.push({
          tenant_id,
          name,
          email: emailIdx >= 0 ? row[emailIdx] || null : null,
          phone: phoneIdx >= 0 ? row[phoneIdx] || null : null,
          document: documentIdx >= 0 ? row[documentIdx] || null : null,
        });
      }

      if (customersToInsert.length > 0) {
        // Upsert customers to avoid duplicates if possible, or just insert
        // Using onConflict: 'tenant_id, email' or similar would be good but depends on DB constraints
        // For now, let's do a simple insert and get IDs
        const { data: insertedCustomers, error: insertErr } = await supabase
          .from("customers")
          .upsert(customersToInsert, { 
            onConflict: 'tenant_id, phone', // Assuming phone is unique per tenant for this logic
            ignoreDuplicates: false 
          })
          .select("id");

        if (insertErr) {
          console.error("Error inserting customers:", insertErr);
          // If upsert fails due to missing constraint, fallback to loop or handle error
        }

        if (insertedCustomers) {
          const membersToInsert = insertedCustomers.map(c => ({
            list_id,
            customer_id: c.id
          }));

          await supabase.from("contact_list_members").upsert(membersToInsert, {
            onConflict: 'list_id, customer_id'
          });
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
