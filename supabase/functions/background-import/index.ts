import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Process this many rows per HTTP invocation, then re-invoke self.
const CHUNK_SIZE = 2000;
// Batch size for DB lookups/inserts within the chunk.
const BATCH_SIZE = 200;
// Soft time budget per invocation (ms). Well under the 150s idle limit.
const TIME_BUDGET_MS = 90_000;

function norm(v: any): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

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
  const chunkStart = processed;

  console.log(`[bg-import] Job ${job_id} resume at ${processed}/${total}`);

  try {
    while (processed < total) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      if (processed - chunkStart >= CHUNK_SIZE) break;

      const end = Math.min(processed + BATCH_SIZE, total);
      const slice = rows.slice(processed, end);

      // Build normalized records
      const recs = slice.map((row) => ({
        name: nameIdx >= 0 ? norm(row[nameIdx]) : null,
        email: emailIdx >= 0 ? norm(row[emailIdx]) : null,
        phone: phoneIdx >= 0 ? norm(row[phoneIdx]) : null,
        document: documentIdx >= 0 ? norm(row[documentIdx]) : null,
      })).filter((r) => r.name || r.email || r.phone || r.document);

      if (recs.length === 0) {
        processed = end;
        continue;
      }

      // Batch lookup existing customers by phone, email, document
      const phones = [...new Set(recs.map((r) => r.phone).filter(Boolean) as string[])];
      const emails = [...new Set(recs.map((r) => r.email).filter(Boolean) as string[])];
      const docs = [...new Set(recs.map((r) => r.document).filter(Boolean) as string[])];

      const byPhone = new Map<string, string>();
      const byEmail = new Map<string, string>();
      const byDoc = new Map<string, string>();

      if (phones.length) {
        const { data } = await supabase
          .from("customers")
          .select("id, phone")
          .eq("tenant_id", tenant_id)
          .in("phone", phones);
        data?.forEach((c: any) => c.phone && byPhone.set(c.phone, c.id));
      }
      if (emails.length) {
        const { data } = await supabase
          .from("customers")
          .select("id, email")
          .eq("tenant_id", tenant_id)
          .in("email", emails);
        data?.forEach((c: any) => c.email && byEmail.set(c.email, c.id));
      }
      if (docs.length) {
        const { data } = await supabase
          .from("customers")
          .select("id, document")
          .eq("tenant_id", tenant_id)
          .in("document", docs);
        data?.forEach((c: any) => c.document && byDoc.set(c.document, c.id));
      }

      // Resolve / collect inserts
      const toInsert: any[] = [];
      const resolved: (string | null)[] = recs.map((r) => {
        const id =
          (r.phone && byPhone.get(r.phone)) ||
          (r.email && byEmail.get(r.email)) ||
          (r.document && byDoc.get(r.document)) ||
          null;
        if (!id) {
          toInsert.push({
            tenant_id,
            name: r.name || "Novo Contato",
            email: r.email,
            phone: r.phone,
            document: r.document,
          });
        }
        return id;
      });

      // Bulk insert new customers
      let insertedIds: string[] = [];
      if (toInsert.length) {
        const { data: ins, error: insErr } = await supabase
          .from("customers")
          .insert(toInsert)
          .select("id");
        if (insErr) {
          console.error(`[bg-import] insert error:`, insErr.message);
        } else {
          insertedIds = (ins || []).map((c: any) => c.id);
        }
      }

      // Map inserted ids back into resolved list (in order)
      let insIdx = 0;
      const customerIds: string[] = [];
      for (let i = 0; i < recs.length; i++) {
        if (resolved[i]) customerIds.push(resolved[i] as string);
        else if (insIdx < insertedIds.length) customerIds.push(insertedIds[insIdx++]);
      }

      // Bulk upsert list members
      if (customerIds.length) {
        const members = customerIds.map((cid) => ({ list_id, customer_id: cid }));
        const { error: memErr } = await supabase
          .from("contact_list_members")
          .upsert(members, { onConflict: "list_id,customer_id" });
        if (memErr) console.error(`[bg-import] member upsert error:`, memErr.message);
      }

      processed = end;
      await supabase.from("background_jobs").update({ progress: processed }).eq("id", job_id);
    }

    if (processed >= total) {
      const { count } = await supabase
        .from("contact_list_members")
        .select("*", { count: "exact", head: true })
        .eq("list_id", list_id);
      await supabase.from("contact_lists").update({ customer_count: count }).eq("id", list_id);
      await supabase
        .from("background_jobs")
        .update({ status: "completed", progress: total })
        .eq("id", job_id);
      console.log(`[bg-import] Job ${job_id} COMPLETED (${total} rows)`);
    } else {
      console.log(`[bg-import] Job ${job_id} chunk done at ${processed}/${total}, re-invoking`);
      // Fire-and-forget re-invoke; don't await response body.
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/background-import`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({ job_id }),
        });
        console.log(`[bg-import] re-invoke status: ${r.status}`);
      } catch (e) {
        console.error(`[bg-import] re-invoke failed:`, (e as Error).message);
      }
    }
  } catch (err) {
    console.error(`[bg-import] Job ${job_id} error:`, err);
    await supabase
      .from("background_jobs")
      .update({ status: "failed" })
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
