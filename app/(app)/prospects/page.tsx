"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Search, Download, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";

interface Prospect {
  id: string;
  name: string;
  firstName: string;
  title: string;
  company: string;
  companyDomain: string;
  email: string | null;
  emailStatus: string | null;
  linkedinUrl: string | null;
  createdAt: string;
}

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: "50", search });
      const res = await fetch(`/api/prospects?${params}`);
      if (res.ok) {
        const data = await res.json();
        setProspects(data.prospects);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);

  const handleExport = async (format: "csv" | "json") => {
    const res = await fetch("/api/exports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, type: "contacts" }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prospects.${format}`;
    a.click();
  };

  const emailStatusBadge = (status: string | null) => {
    if (!status) return <span className="badge badge-muted">No Email</span>;
    const map: Record<string, string> = {
      VALID: "badge-success",
      CATCH_ALL: "badge-warning",
      INVALID: "badge-error",
      UNKNOWN: "badge-muted",
    };
    return <span className={`badge ${map[status] ?? "badge-muted"}`}>{status}</span>;
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-1" style={{ color: "#E8EAF6" }}>Prospects</h1>
          <p style={{ color: "#6B7BA4" }}>{total.toLocaleString()} contacts found across all pipeline runs</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleExport("csv")} className="btn-ghost flex items-center gap-2 text-sm py-2 px-4">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={() => handleExport("json")} className="btn-ghost flex items-center gap-2 text-sm py-2 px-4">
            <Download className="w-4 h-4" /> JSON
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#6B7BA4" }} />
        <input
          id="prospects-search"
          type="text"
          placeholder="Search by name, title, or company..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="input-field pl-11"
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "rgba(18,25,43,0.7)", border: "1px solid rgba(109,93,246,0.15)" }}>
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
              style={{ borderColor: "#6D5DF6", borderTopColor: "transparent" }} />
            <p style={{ color: "#6B7BA4" }}>Loading prospects...</p>
          </div>
        ) : prospects.length === 0 ? (
          <div className="py-20 text-center">
            <Users className="w-12 h-12 mx-auto mb-4" style={{ color: "rgba(109,93,246,0.3)" }} />
            <p className="font-medium mb-2" style={{ color: "#E8EAF6" }}>No prospects yet</p>
            <p style={{ color: "#6B7BA4" }}>Run a pipeline to discover decision makers</p>
          </div>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Title</th>
                  <th>Company</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {prospects.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                          style={{ background: "rgba(109,93,246,0.15)", color: "#8B7CFF" }}>
                          {p.firstName?.charAt(0) ?? "?"}
                        </div>
                        <span className="font-medium" style={{ color: "#E8EAF6" }}>{p.name}</span>
                      </div>
                    </td>
                    <td><span style={{ color: "#6B7BA4" }}>{p.title ?? "—"}</span></td>
                    <td>
                      <div>
                        <div className="font-medium text-sm" style={{ color: "#E8EAF6" }}>{p.company}</div>
                        <div className="text-xs" style={{ color: "#6B7BA4" }}>{p.companyDomain}</div>
                      </div>
                    </td>
                    <td>
                      <span className="text-sm font-mono" style={{ color: "#E8EAF6" }}>
                        {p.email ?? "—"}
                      </span>
                    </td>
                    <td>{emailStatusBadge(p.emailStatus)}</td>
                    <td>
                      <span className="text-sm" style={{ color: "#6B7BA4" }}>
                        {new Date(p.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td>
                      {p.linkedinUrl && (
                        <a href={p.linkedinUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm" style={{ color: "#6D5DF6" }}>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t"
              style={{ borderColor: "rgba(109,93,246,0.1)" }}>
              <span className="text-sm" style={{ color: "#6B7BA4" }}>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="btn-ghost p-2" style={{ opacity: page === 1 ? 0.4 : 1 }}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="btn-ghost p-2" style={{ opacity: page === totalPages ? 0.4 : 1 }}>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
