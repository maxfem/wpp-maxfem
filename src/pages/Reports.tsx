import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarIcon } from "lucide-react";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatSP, getStandardPeriodRange, type DatePeriodKey } from "@/lib/utils";

import RevenueBySourceReport from "@/components/reports/RevenueBySourceReport";
import SalesReport from "@/components/reports/SalesReport";
import CampaignsReport from "@/components/reports/CampaignsReport";
import CustomersReport from "@/components/reports/CustomersReport";

const PERIOD_OPTIONS: { key: DatePeriodKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "custom", label: "Personalizado" },
];

const TABS = [
  { value: "revenue", label: "Receita por origem" },
  { value: "sales", label: "Vendas" },
  { value: "campaigns", label: "Campanhas" },
  { value: "customers", label: "Clientes / RFM" },
];

export default function Reports() {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id;
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = TABS.some((t) => t.value === searchParams.get("tab")) ? searchParams.get("tab")! : "revenue";
  const setTab = (v: string) => setSearchParams((prev) => { prev.set("tab", v); return prev; }, { replace: true });

  const [periodKey, setPeriodKey] = useState<DatePeriodKey>("30d");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { from, to } = useMemo(
    () => getStandardPeriodRange(periodKey, customRange),
    [periodKey, customRange]
  );

  const periodLabel = useMemo(() => {
    if (periodKey === "custom" && customRange?.from && customRange?.to) {
      return `${formatSP(customRange.from, "dd/MM")} — ${formatSP(customRange.to, "dd/MM")}`;
    }
    return PERIOD_OPTIONS.find((o) => o.key === periodKey)?.label ?? "";
  }, [periodKey, customRange]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl font-bold font-heading text-foreground">Relatórios</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {currentTenant?.name || "sua loja"} • {periodLabel}
            </p>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {PERIOD_OPTIONS.map((opt) =>
              opt.key === "custom" ? (
                <Popover key={opt.key} open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button variant={periodKey === "custom" ? "default" : "outline"} size="sm" className="gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {periodKey === "custom" && customRange?.from && customRange?.to
                        ? `${formatSP(customRange.from, "dd/MM")} — ${formatSP(customRange.to, "dd/MM")}`
                        : opt.label}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="range"
                      selected={customRange}
                      onSelect={(range) => {
                        setCustomRange(range);
                        if (range?.from && range?.to) {
                          setPeriodKey("custom");
                          setCalendarOpen(false);
                        }
                      }}
                      locale={ptBR}
                      numberOfMonths={2}
                      disabled={{ after: new Date() }}
                    />
                  </PopoverContent>
                </Popover>
              ) : (
                <Button
                  key={opt.key}
                  variant={periodKey === opt.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPeriodKey(opt.key)}
                >
                  {opt.label}
                </Button>
              )
            )}
          </div>
        </motion.div>

        {!tenantId ? (
          <p className="text-muted-foreground">Selecione uma loja para ver os relatórios.</p>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="flex-wrap h-auto">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="revenue" className="mt-4">
              <RevenueBySourceReport tenantId={tenantId} from={from} to={to} periodLabel={periodLabel} />
            </TabsContent>
            <TabsContent value="sales" className="mt-4">
              <SalesReport tenantId={tenantId} from={from} to={to} />
            </TabsContent>
            <TabsContent value="campaigns" className="mt-4">
              <CampaignsReport tenantId={tenantId} from={from} to={to} />
            </TabsContent>
            <TabsContent value="customers" className="mt-4">
              <CustomersReport tenantId={tenantId} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
