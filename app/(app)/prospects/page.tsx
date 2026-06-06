"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr-fetcher";
import type { Prospect } from "@/types/prospect";

interface ProspectsResponse {
  prospects: Prospect[];
  hasMore: boolean;
}
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useDebounce } from "@/hooks/use-debounce";
import { Card } from "@/components/ui/card";

export default function ProspectsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const { data, error, isLoading, mutate } = useSWR<ProspectsResponse>(
    `/api/prospects?page=${page}&q=${encodeURIComponent(debouncedSearch)}`,
    fetcher
  );

  const handleExport = async (format: "csv" | "json") => {
    try {
      const res = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      const data = await res.json();
      window.location.href = data.url;
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Prospects</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleExport("csv")}>Export CSV</Button>
        </div>
      </div>

      <div className="mb-6">
        <Input 
          type="text" 
          placeholder="Search prospects..." 
          value={search} 
          onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
          className="max-w-md"
        />
      </div>

      <Card className="p-6">
        {isLoading ? (
           <div className="flex justify-center py-20"><Spinner /></div>
        ) : error ? (
           <ErrorState message="Failed to load prospects." onRetry={() => mutate()} />
        ) : !data?.prospects || data.prospects.length === 0 ? (
           <EmptyState title="No prospects found" description="Try a different search or run a new pipeline." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-6 py-4 font-semibold text-muted-foreground uppercase text-xs">Name</th>
                    <th className="px-6 py-4 font-semibold text-muted-foreground uppercase text-xs">Title</th>
                    <th className="px-6 py-4 font-semibold text-muted-foreground uppercase text-xs">Company</th>
                    <th className="px-6 py-4 font-semibold text-muted-foreground uppercase text-xs">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data?.prospects?.map((p: Prospect) => (
                    <tr key={p.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4 text-foreground font-medium">{p.firstName} {p.lastName}</td>
                      <td className="px-6 py-4 text-muted-foreground">{p.title}</td>
                      <td className="px-6 py-4 text-muted-foreground">{p.companyName}</td>
                      <td className="px-6 py-4 text-foreground font-mono">{p.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center mt-6">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-muted-foreground text-sm font-medium">Page {page}</span>
              <Button variant="outline" disabled={!data?.hasMore} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}