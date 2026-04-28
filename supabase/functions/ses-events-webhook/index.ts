// SES Event Webhook - receives SNS notifications and stores in email_events
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const raw = await req.text();
    const snsType = req.headers.get("x-amz-sns-message-type");
    let payload: any;
    try { payload = JSON.parse(raw); } catch { payload = {}; }

    // Handle SNS subscription confirmation
    if (snsType === "SubscriptionConfirmation" && payload.SubscribeURL) {
      console.log("[ses-webhook] Confirming SNS subscription:", payload.SubscribeURL);
      await fetch(payload.SubscribeURL);
      return new Response(JSON.stringify({ confirmed: true }), { status: 200 });
    }

    // SNS Notification wraps the SES event in Message
    let sesEvent: any = payload;
    if (snsType === "Notification" && payload.Message) {
      try { sesEvent = JSON.parse(payload.Message); } catch {}
    }

    const eventType = sesEvent.eventType || sesEvent.notificationType;
    const mail = sesEvent.mail || {};
    const messageId = mail.messageId;
    const recipients: string[] = mail.destination || [];
    const tags = mail.tags || {};
    const tenantId = Array.isArray(tags["tenant_id"]) ? tags["tenant_id"][0] : null;
    const campaignId = Array.isArray(tags["campaign_id"]) ? tags["campaign_id"][0] : null;
    const customerId = Array.isArray(tags["customer_id"]) ? tags["customer_id"][0] : null;
    const configSet = mail.configurationSet || sesEvent.configurationSet;

    if (!messageId || !eventType) {
      console.log("[ses-webhook] Skipping - no messageId or eventType");
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const events: any[] = [];
    const baseEvent = {
      tenant_id: tenantId,
      message_id: messageId,
      event_type: eventType,
      configuration_set: configSet,
      source_email: mail.source,
      source_ip: mail.sourceIp,
      timestamp: mail.timestamp || new Date().toISOString(),
      raw: sesEvent,
    };

    if (eventType === "Bounce" && sesEvent.bounce) {
      const b = sesEvent.bounce;
      for (const r of b.bouncedRecipients || []) {
        events.push({
          ...baseEvent,
          recipient: r.emailAddress,
          bounce_type: b.bounceType,
          bounce_subtype: b.bounceSubType,
          smtp_response: r.diagnosticCode,
          diagnostic_code: r.diagnosticCode,
          timestamp: b.timestamp || baseEvent.timestamp,
        });
      }
    } else if (eventType === "Complaint" && sesEvent.complaint) {
      const c = sesEvent.complaint;
      for (const r of c.complainedRecipients || []) {
        events.push({
          ...baseEvent,
          recipient: r.emailAddress,
          complaint_type: c.complaintFeedbackType,
          timestamp: c.timestamp || baseEvent.timestamp,
        });
      }
    } else if (eventType === "Open" && sesEvent.open) {
      events.push({
        ...baseEvent,
        recipient: recipients[0],
        user_agent: sesEvent.open.userAgent,
        source_ip: sesEvent.open.ipAddress,
        timestamp: sesEvent.open.timestamp || baseEvent.timestamp,
      });
    } else if (eventType === "Click" && sesEvent.click) {
      events.push({
        ...baseEvent,
        recipient: recipients[0],
        user_agent: sesEvent.click.userAgent,
        source_ip: sesEvent.click.ipAddress,
        link_url: sesEvent.click.link,
        timestamp: sesEvent.click.timestamp || baseEvent.timestamp,
      });
    } else if (eventType === "Delivery" && sesEvent.delivery) {
      for (const recipient of sesEvent.delivery.recipients || recipients) {
        events.push({
          ...baseEvent,
          recipient,
          smtp_response: sesEvent.delivery.smtpResponse,
          timestamp: sesEvent.delivery.timestamp || baseEvent.timestamp,
        });
      }
    } else {
      // Send, Reject, RenderingFailure, DeliveryDelay
      for (const recipient of recipients) {
        events.push({ ...baseEvent, recipient });
      }
      if (recipients.length === 0) events.push(baseEvent);
    }

    if (events.length > 0) {
      const { error } = await supabase.from("email_events").insert(events);
      if (error) console.error("[ses-webhook] insert error:", error.message);

      // Update email_logs counters / status
      for (const ev of events) {
        const updates: any = { last_event_at: ev.timestamp };
        if (ev.event_type === "Delivery") updates.status = "delivered";
        else if (ev.event_type === "Bounce") {
          updates.status = "bounced";
          updates.bounce_type = ev.bounce_type;
          updates.bounce_subtype = ev.bounce_subtype;
          updates.error_message = ev.diagnostic_code;
        }
        else if (ev.event_type === "Complaint") {
          updates.status = "complained";
          updates.complaint_type = ev.complaint_type;
        }
        else if (ev.event_type === "Reject") {
          updates.status = "rejected";
          updates.error_message = "Rejected by SES";
        }

        await supabase.from("email_logs").update(updates).eq("aws_message_id", messageId);

        if (ev.event_type === "Open") {
          await supabase.rpc("exec_sql_safe").then(() => {}).catch(() => {});
          // increment opens via raw query fallback
          const { data: log } = await supabase.from("email_logs").select("id, opens").eq("aws_message_id", messageId).maybeSingle();
          if (log) await supabase.from("email_logs").update({ opens: (log.opens || 0) + 1, last_event_at: ev.timestamp }).eq("id", log.id);
        }
        if (ev.event_type === "Click") {
          const { data: log } = await supabase.from("email_logs").select("id, clicks").eq("aws_message_id", messageId).maybeSingle();
          if (log) await supabase.from("email_logs").update({ clicks: (log.clicks || 0) + 1, last_event_at: ev.timestamp }).eq("id", log.id);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: events.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[ses-webhook] error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 200 }); // 200 to avoid SNS retry storm on bad data
  }
});
