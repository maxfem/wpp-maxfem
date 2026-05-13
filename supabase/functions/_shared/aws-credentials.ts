// Helper: resolve credenciais AWS da tabela integrations (provider=aws),
// com fallback para variáveis de ambiente da Edge Function.
//
// Uso:
//   const creds = await getAwsCredentials(supabase, { tenantId });
//   if (!creds.accessKeyId) return jsonError("AWS não configurado");

export type AwsCreds = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  senderEmail: string | null;
  source: "db" | "env" | "mixed" | "none";
  tenantId?: string;
  configurationSet?: string | null;
  snsTopicArn?: string | null;
};

type Supa = {
  from: (table: string) => {
    select: (...args: any[]) => any;
  };
};

export async function getAwsCredentials(
  supabase: Supa,
  opts: { tenantId?: string } = {},
): Promise<AwsCreds> {
  const envAccess = (Deno.env.get("AWS_ACCESS_KEY_ID") || "").trim();
  const envSecret = (Deno.env.get("AWS_SECRET_ACCESS_KEY") || "").trim();
  const envRegion = (Deno.env.get("AWS_REGION") || "").trim();

  // Busca a integração AWS mais recente (independente de is_active — credenciais
  // ficam disponíveis pras Edge Functions assim que salvas, antes mesmo da
  // validação/ativação). Prioriza linhas ativas se houver.
  let dbConfig: Record<string, any> | null = null;
  let dbTenantId: string | undefined;
  try {
    let q: any = supabase
      .from("integrations")
      .select("tenant_id, config, is_active, updated_at")
      .eq("provider", "aws");
    if (opts.tenantId) q = q.eq("tenant_id", opts.tenantId);
    const { data } = await q
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.config) {
      dbConfig = data.config as Record<string, any>;
      dbTenantId = data.tenant_id as string;
    }
  } catch (err) {
    console.error("[aws-credentials] db lookup failed:", (err as Error).message);
  }

  const dbAccess = (dbConfig?.aws_access_key_id || "").trim();
  const dbSecret = (dbConfig?.aws_secret_access_key || "").trim();
  const dbRegion = (dbConfig?.aws_region || "").trim();

  const accessKeyId = dbAccess || envAccess;
  const secretAccessKey = dbSecret || envSecret;
  const region = dbRegion || envRegion || "us-east-1";

  const fromDb = Boolean(dbAccess && dbSecret);
  const fromEnv = Boolean(envAccess && envSecret);
  const source: AwsCreds["source"] = fromDb && fromEnv
    ? "mixed"
    : fromDb
      ? "db"
      : fromEnv
        ? "env"
        : "none";

  return {
    accessKeyId,
    secretAccessKey,
    region,
    senderEmail: dbConfig?.sender_email || null,
    source,
    tenantId: dbTenantId,
    configurationSet: dbConfig?.configuration_set || null,
    snsTopicArn: dbConfig?.sns_topic_arn || null,
  };
}

export function awsCredsStatus(creds: AwsCreds) {
  return {
    has_access_key: Boolean(creds.accessKeyId),
    has_secret_key: Boolean(creds.secretAccessKey),
    has_region: Boolean(creds.region),
    region: creds.region || null,
    access_key_prefix: creds.accessKeyId ? creds.accessKeyId.slice(0, 6) + "..." : null,
    source: creds.source,
  };
}
