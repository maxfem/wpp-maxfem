import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MousePointerClick, Target, DollarSign, PercentIcon, Info } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { subDays } from "date-fns";
import { formatSP, getStandardPeriodRange, fetchAll, type DatePeriodKey } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PERIOD_OPTIONS: { value: DatePeriodKey; label: string }[] = [
  { value: "7d", label: "7 dias" },
  { value: "14d", label: "14 dias" },
  { value: "30d", label: "30 dias" },
];

const fmtNumber = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtMoney = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

function buildDayEntries(days: number) {
  const entries: { key: string; label: string }[] = [];
  for (let i = 0; i < days; i++) {
    const d = subDays(new Date(), days - 1 - i);
    entries.push({ key: formatSP(d, "yyyy-MM-dd"), label: formatSP(d, "dd/MM") });
  }
  return entries;
}

export default function TrackingDashboard() {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id;
  const [periodKey, setPeriodKey] = useState<DatePeriodKey>("14d");
  
  const { from: periodFrom, to: periodTo, days: periodDays } = useMemo(
    () => getStandardPeriodRange(periodKey),
    [periodKey]
  );

  // Fetch tracked links for this tenant
  const { data: trackedLinks = [] } = useQuery({
    queryKey: ["tracking-links", tenantId],
    queryFn: async () => {
      return fetchAll<{ id: string; campaign_id: string | null; created_at: string }>(
        supabase
          .from("tracked_links")
          .select("id, campaign_id, created_at")
          .eq("tenant_id", tenantId!)
      );
    },
    enabled: !!tenantId,
  });

  // Fetch clicks for period
  const { data: clicks = [] } = useQuery({
    queryKey: ["tracking-clicks", tenantId, trackedLinks.length, periodKey],
    queryFn: async () => {
      if (trackedLinks.length === 0) return [];
      const linkIds = trackedLinks.map((l) => l.id);
      
      // We still use link_id filter, but we fetch all pages
      // To optimize, if linkIds is too large, we might need a different approach, 
      // but fetchAll handles the result set size, not the linkIds array size.
      return fetchAll<{ link_id: string; clicked_at: string }>(
        supabase
          .from("link_clicks")
          .select("link_id, clicked_at")
          .in("link_id", linkIds)
          .gte("clicked_at", periodFrom.toISOString())
          .lte("clicked_at", periodTo.toISOString())
      );
    },
    enabled: !!tenantId && trackedLinks.length > 0,
  });

  // Fetch activities with conversions
  const { data: activities = [] } = useQuery({
    queryKey: ["tracking-activities", tenantId, periodKey],
    queryFn: async () => {
      return fetchAll<{ campaign_id: string | null; status: string; delivered_at: string | null; clicked_at: string | null; converted_at: string | null; conversion_value: number | null; created_at: string }>(
        supabase
          .from("campaign_activities")
          .select("campaign_id, status, delivered_at, clicked_at, converted_at, conversion_value, created_at")
          .eq("tenant_id", tenantId!)
          .gte("created_at", periodFrom.toISOString())
          .lte("created_at", periodTo.toISOString())
      );
    },
    enabled: !!tenantId,
  });

  // Fetch campaign names for ranking
  const { data: campaigns = [] } = useQuery({
    queryKey: ["tracking-campaigns", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("id, name, kind")
        .eq("tenant_id", tenantId!);
      return data || [];
    },
    enabled: !!tenantId,
  });

  // KPIs
  const totalClicks = clicks.length;
  const totalDelivered = activities.filter((a) => a.delivered_at).length;
  const ctr = totalDelivered > 0 ? totalClicks / totalDelivered : 0;
  const totalConversions = activities.filter((a) => a.converted_at).length;
  const attributedRevenue = activities
    .filter((a) => a.converted_at)
    .reduce((s, a) => s + Number(a.conversion_value || 0), 0);

  const kpis = [
    { label: "Cliques", value: fmtNumber(totalClicks), icon: MousePointerClick },
    { label: "CTR", value: fmtPct(ctr), icon: PercentIcon },
    { label: "Conversões", value: fmtNumber(totalConversions), icon: Target },
    { 
      label: "Receita Atribuída", 
      value: fmtMoney(attributedRevenue), 
      icon: DollarSign,
      tooltip: "Receita gerada via cliques diretos nos links rastreados (rastreio.maxfem.com.br) dentro da janela de 72h."
    },
  ];

  // Clicks by day chart
  const dayEntries = buildDayEntries(periodDays);
  const clickDayMap: Record<string, number> = {};
  dayEntries.forEach(({ key }) => { clickDayMap[key] = 0; });
  clicks.forEach((c: any) => {
    const key = formatSP(new Date(c.clicked_at), "yyyy-MM-dd");
    if (clickDayMap[key] !== undefined) clickDayMap[key]++;
  });
  const clicksPerDay = dayEntries.map(({ key, label }) => ({
    day: label,
    cliques: clickDayMap[key],
  }));

  // Campaign ranking
  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));
  const campaignStats: Record<string, { name: string; kind: string; clicks: number; conversions: number; revenue: number }> = {};

  // Build link→campaign map
  const linkCampaignMap = new Map(trackedLinks.filter((l) => l.campaign_id).map((l) => [l.id, l.campaign_id!]));

  clicks.forEach((c: any) => {
    const campaignId = linkCampaignMap.get(c.link_id);
    if (!campaignId) return;
    if (!campaignStats[campaignId]) {
      const camp = campaignMap.get(campaignId);
      campaignStats[campaignId] = {
        name: camp?.name || "Desconhecida",
        kind: camp?.kind || "campaign",
        clicks: 0,
        conversions: 0,
        revenue: 0,
      };
    }
    campaignStats[campaignId].clicks++;
  });

  activities.forEach((a) => {
    if (!a.campaign_id) return;
    if (!campaignStats[a.campaign_id]) {
      const camp = campaignMap.get(a.campaign_id);
      campaignStats[a.campaign_id] = {
        name: camp?.name || "Desconhecida",
        kind: camp?.kind || "campaign",
        clicks: 0,
        conversions: 0,
        revenue: 0,
      };
    }
    if (a.converted_at) {
      campaignStats[a.campaign_id].conversions++;
      campaignStats[a.campaign_id].revenue += Number(a.conversion_value || 0);
    }
  });

  const rankedCampaigns = Object.values(campaignStats)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-end">
        <Select value={periodKey} onValueChange={(v) => setPeriodKey(v as DatePeriodKey)}>
          <SelectTrigger className="w-[130px] h-8 text-xs font-medium border-border glass">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <TooltipProvider>
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="border border-border glass shadow-sm overflow-hidden group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{kpi.label}</span>
                    {kpi.tooltip && (
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground/50 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[200px] text-[11px] p-2 leading-tight">
                          {kpi.tooltip}
                        </TooltipContent>
                      </UITooltip>
                    )}
                  </div>
                  <kpi.icon className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                </div>
                <div className="text-2xl font-bold text-foreground tracking-tight">{kpi.value}</div>
              </CardContent>
            </Card>
          ))}
        </TooltipProvider>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border border-border glass shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
              Cliques por Dia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={clicksPerDay}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis 
                  dataKey="day" 
                  className="text-[10px]" 
                  tick={{ fill: "hsl(var(--muted-foreground))" }} 
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  className="text-[10px]" 
                  tick={{ fill: "hsl(var(--muted-foreground))" }} 
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "11px",
                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Bar 
                  dataKey="cliques" 
                  fill="hsl(var(--primary))" 
                  radius={[3, 3, 0, 0]} 
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border border-border glass shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
              Top Campanhas por Cliques
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rankedCampaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">
                Nenhum dado de cliques por campanha ainda.
              </p>
            ) : (
              <div className="overflow-auto max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border">
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground h-10">Campanha</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-right h-10">Cliques</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-right h-10">Conv.</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-right h-10">Receita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankedCampaigns.map((c, i) => (
                      <TableRow key={i} className="border-border hover:bg-muted/30 transition-colors">
                        <TableCell className="py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-tight">
                              {c.kind === "automation" ? "Régua" : "Camp."}
                            </span>
                            <span className="text-xs font-medium truncate max-w-[150px]">{c.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right py-2.5 font-mono">{fmtNumber(c.clicks)}</TableCell>
                        <TableCell className="text-xs text-right py-2.5 font-mono">{fmtNumber(c.conversions)}</TableCell>
                        <TableCell className="text-xs text-right py-2.5 font-mono font-semibold">{fmtMoney(c.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
