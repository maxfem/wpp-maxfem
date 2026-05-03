import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Max rows per invocation. After this, the function re-invokes itself and returns.
const CHUNK_SIZE = 500;
// Soft time budget per invocation (ms). Leaves headroom under the 150s idle limit.
const TIME_BUDGET_MS = 60_000;

async function processJob(job_id: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startedAt = Date.now();

  const { data: job, error: jobError } = await supabase
    .from("background_jobs")
    .select("*")
    .eq("id", job_id)
    .single();

  if (jobError || !job) {
    console.error("Job not found", job_id, jobError?.message);
    return;
  }

  if (job.status === "completed") return;

  await supabase.from("background_jobs").update({ status: "processing" }).eq("id", job_id);

  const { tenant_id, payload } = job;
  const { list_id, rows, headers } = payload as { list_id: string; rows: any[][]; headers: string[] };

  const nameIdx = headers.indexOf("name");
  const emailIdx = headers.indexOf("email");
  const phoneIdx = headers.indexOf("phone");
  const documentIdx = headers.indexOf("document");

  let processed = job.progress || 0;
  const total = rows.length;

  try {
    while (processed < total) {
      // Stop this invocation if we've spent our budget or hit chunk size
      const elapsed = Date.now() - startedAt;
      if (elapsed > TIME_BUDGET_MS) break;

      const end = Math.min(processed + 50, total);
      for (let i = processed; i < end; i++) {
        const row = rows[i];
        const name = row[nameIdx];
        if (!name) continue;

        const email = emailIdx >= 0 ? row[emailIdx] || null : null;
        const phone = phoneIdx >= 0 ? row[phoneIdx] || null : null;
        const document = documentIdx >= 0 ? row[documentIdx] || null : null;

        let customerId: string | undefined;
        if (phone) {
          const { data } = await supabase.from("customers").select("id").eq("tenant_id", tenant_id).eq("phone", phone).maybeSingle();
          if (data) customerId = data.id;
        }
        if (!customerId && email) {
          const { data } = await supabase.from("customers").select("id").eq("tenant_id", tenant_id).eq("email", email).maybeSingle();
          if (data) customerId = data.id;
        }
        if (!customerId) {
          const { data, error } = await supabase.from("customers").insert({
            tenant_id, name, email, phone, document
          }).select("id").single();
          if (!error && data) customerId = data.id;
        } else {
          await supabase.from("customers").update({ name, document, email, phone }).eq("id", customerId);
        }

        if (customerId) {
          await supabase.from("contact_list_members").upsert(
            { list_id, customer_id: customerId },
            { onConflict: "list_id, customer_id" }
          );
        }
      }

      processed = end;
      await supabase
        .from("background_jobs")
        .update({ progress: Math.min(processed, total) })
        .eq("id", job_id);

      if (processed - (job.progress || 0) >= CHUNK_SIZE) break;
    }

    if (processed >= total) {
      // Finalize
      const { count } = await supabase
        .from("contact_list_members")
        .select("*", { count: "exact", head: true })
        .eq("list_id", list_id);

      await supabase.from("contact_lists").update({ customer_count: count }).eq("id", list_id);
      await supabase
        .from("background_jobs")
        .update({ status: "completed", progress: total })
        .eq("id", job_id);
      console.log(`Job ${job_id} completed (${total} rows)`);
    } else {
      // Re-invoke self to continue processing
      console.log(`Job ${job_id} chunk done at ${processed}/${total}, re-invoking`);
      await fetch(`${SUPABASE_URL}/functions/v1/background-import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ job_id }),
      });
    }
  } catch (err) {
    console.error(`Job ${job_id} error:`, err);
    await supabase
      .from("background_jobs")
      .update({ status: "failed", error: String((err as Error).message || err) })
      .eq("id", job_id);
  }
}

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

    // Run in background so the HTTP request returns immediately and avoids the 150s idle timeout.
    // @ts-ignore EdgeRuntime is provided by the Supabase edge runtime
    EdgeRuntime.waitUntil(processJob(job_id));

    return new Response(JSON.stringify({ success: true, job_id, status: "processing" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Background import error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
