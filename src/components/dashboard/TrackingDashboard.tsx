import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MousePointerClick, Target, DollarSign, PercentIcon } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { subDays, format } from "date-fns";
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

const PERIOD_OPTIONS = [
  { value: "7", label: "7 dias" },
  { value: "14", label: "14 dias" },
  { value: "30", label: "30 dias" },
];

const fmtNumber = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtMoney = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

function buildDayEntries(days: number) {
  const entries: { key: string; label: string }[] = [];
  for (let i = 0; i < days; i++) {
    const d = subDays(new Date(), days - 1 - i);
    entries.push({ key: format(d, "yyyy-MM-dd"), label: format(d, "dd/MM") });
  }
  return entries;
}

export default function TrackingDashboard() {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id;
  const [periodDays, setPeriodDays] = useState(14);
  const periodStart = subDays(new Date(), periodDays).toISOString();

  // Fetch tracked links for this tenant
  const { data: trackedLinks = [] } = useQuery({
    queryKey: ["tracking-links", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tracked_links")
        .select("id, campaign_id, created_at")
        .eq("tenant_id", tenantId!);
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Fetch clicks for period
  const { data: clicks = [] } = useQuery({
    queryKey: ["tracking-clicks", tenantId, trackedLinks.length, periodDays],
    queryFn: async () => {
      if (trackedLinks.length === 0) return [];
      const linkIds = trackedLinks.map((l) => l.id);
      const { data } = await supabase
        .from("link_clicks")
        .select("link_id, clicked_at")
        .in("link_id", linkIds)
        .gte("clicked_at", periodStart);
      return data || [];
    },
    enabled: !!tenantId && trackedLinks.length > 0,
  });

  // Fetch activities with conversions
  const { data: activities = [] } = useQuery({
    queryKey: ["tracking-activities", tenantId, periodDays],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaign_activities")
        .select("campaign_id, status, delivered_at, clicked_at, converted_at, conversion_value, created_at")
        .eq("tenant_id", tenantId!)
        .gte("created_at", periodStart);
      return data || [];
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
    { label: "Receita Atribuída", value: fmtMoney(attributedRevenue), icon: DollarSign },
  ];

  // Clicks by day chart
  const dayEntries = buildDayEntries(periodDays);
  const clickDayMap: Record<string, number> = {};
  dayEntries.forEach(({ key }) => { clickDayMap[key] = 0; });
  clicks.forEach((c: any) => {
    const key = format(new Date(c.clicked_at), "yyyy-MM-dd");
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
        <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v))}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="border border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
                <kpi.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground">
              Cliques por Dia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={clicksPerDay}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="cliques" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground">
              Top Campanhas por Cliques
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rankedCampaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhum dado de cliques por campanha ainda.
              </p>
            ) : (
              <div className="overflow-auto max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Campanha</TableHead>
                      <TableHead className="text-xs text-right">Cliques</TableHead>
                      <TableHead className="text-xs text-right">Conv.</TableHead>
                      <TableHead className="text-xs text-right">Receita</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankedCampaigns.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {c.kind === "automation" ? "Régua" : "Camp."}
                            </span>
                            {c.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-right">{fmtNumber(c.clicks)}</TableCell>
                        <TableCell className="text-sm text-right">{fmtNumber(c.conversions)}</TableCell>
                        <TableCell className="text-sm text-right">{fmtMoney(c.revenue)}</TableCell>
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
