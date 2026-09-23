"use client";

import MarketingChart from "./MarketingChart";
import MarketingInsights from "./MarketingInsights";
import type { MarketingCentre, MarketingEntry, MarketingPlatform } from "@/lib/marketingMetrics";
import styles from "./marketing.module.css";

export default function MarketingCharts({ centres, platforms, entries, platform, days, date, monthLabel, excluded, onToggle }: {
   centres: MarketingCentre[]; platforms: MarketingPlatform[]; entries: MarketingEntry[];
   platform?: MarketingPlatform; days: string[]; date: string; monthLabel: string;
   excluded: ReadonlySet<string>; onToggle: (id: string, checked: boolean) => void;
}) {
   const selected = centres.filter((centre) => !excluded.has(centre.id));
   return <>
      <fieldset className={styles.centrePicker}>
         <legend>Learning centres in these charts</legend>
         {centres.map((centre) => <label key={centre.id}>
            <input type="checkbox" checked={!excluded.has(centre.id)} onChange={(event) => onToggle(centre.id, event.target.checked)} />
            <i style={{ background: centre.color }} />{centre.name}
         </label>)}
      </fieldset>
      {!selected.length ? <p className={styles.loading}>Select at least one learning centre to draw charts.</p> : <>
         <MarketingChart kind="total" centres={selected} platforms={platforms} entries={entries} platformId="" platformName="All platforms" days={days} date={date} monthLabel={monthLabel} />
         {platform && (["daily", "change", "trend", "growth"] as const).map((kind) => <MarketingChart
            key={`${platform.id}-${kind}`} kind={kind} centres={selected} entries={entries}
            platformId={platform.id} platformName={platform.name} platformLogo={platform.logo_data_url}
            days={days} date={date} monthLabel={monthLabel} fitTrend
         />)}
         {platform && <MarketingInsights centres={selected} platforms={platforms} entries={entries} platform={platform} days={days} monthLabel={monthLabel} />}
      </>}
   </>;
}
