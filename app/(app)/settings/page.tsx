import { auth } from "@/lib/auth/auth.config";
import { Settings, Key, Building, User } from "lucide-react";

// Check which API keys are actually set in the environment (server-side only)
function getApiKeyStatus() {
  return [
    {
      label: "Ocean.io",
      var: "OCEAN_API_KEY",
      status: process.env.OCEAN_API_KEY ? "Connected" : "Not Configured",
      connected: !!process.env.OCEAN_API_KEY,
    },
    {
      label: "Prospeo",
      var: "PROSPEO_API_KEY",
      status: process.env.PROSPEO_API_KEY ? "Connected" : "Not Configured",
      connected: !!process.env.PROSPEO_API_KEY,
    },

    {
      label: "Resend",
      var: "RESEND_API_KEY",
      status: process.env.RESEND_API_KEY ? "Connected" : "Not Configured",
      connected: !!process.env.RESEND_API_KEY,
    },
  ];
}

export default async function SettingsPage() {
  const session = await auth();
  const apiKeys = getApiKeyStatus();

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-1" style={{ color: "#E8EAF6" }}>Settings</h1>
        <p style={{ color: "#6B7BA4" }}>Manage your account, organization, and API configurations</p>
      </div>

      {/* Profile */}
      <div className="rounded-2xl p-6 mb-4"
        style={{ background: "rgba(18,25,43,0.7)", border: "1px solid rgba(109,93,246,0.15)" }}>
        <div className="flex items-center gap-3 mb-4">
          <User className="w-5 h-5" style={{ color: "#6D5DF6" }} />
          <h2 className="font-semibold" style={{ color: "#E8EAF6" }}>Profile</h2>
        </div>
        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "#E8EAF6" }}>Full Name</label>
            <input type="text" defaultValue={session?.user?.name ?? ""} className="input-field" readOnly />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "#E8EAF6" }}>Email</label>
            <input type="email" defaultValue={session?.user?.email ?? ""} className="input-field"
              disabled style={{ opacity: 0.6, cursor: "not-allowed" }} />
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="rounded-2xl p-6 mb-4"
        style={{ background: "rgba(18,25,43,0.7)", border: "1px solid rgba(109,93,246,0.15)" }}>
        <div className="flex items-center gap-3 mb-4">
          <Key className="w-5 h-5" style={{ color: "#6D5DF6" }} />
          <h2 className="font-semibold" style={{ color: "#E8EAF6" }}>API Integrations</h2>
        </div>
        <p className="text-sm mb-4" style={{ color: "#6B7BA4" }}>
          API keys are configured via environment variables for security. Update them in your .env file.
        </p>
        <div className="space-y-3">
          {apiKeys.map((api) => (
            <div key={api.label} className="flex items-center justify-between p-4 rounded-xl"
              style={{ background: "rgba(11,16,32,0.5)", border: "1px solid rgba(109,93,246,0.1)" }}>
              <div>
                <div className="font-medium text-sm" style={{ color: "#E8EAF6" }}>{api.label}</div>
                <div className="text-xs font-mono mt-0.5" style={{ color: "#6B7BA4" }}>{api.var}</div>
              </div>
              <span className={`badge ${api.connected ? "badge-success" : "badge-error"}`}>
                {api.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Organization */}
      <div className="rounded-2xl p-6"
        style={{ background: "rgba(18,25,43,0.7)", border: "1px solid rgba(109,93,246,0.15)" }}>
        <div className="flex items-center gap-3 mb-4">
          <Building className="w-5 h-5" style={{ color: "#6D5DF6" }} />
          <h2 className="font-semibold" style={{ color: "#E8EAF6" }}>Organization</h2>
        </div>
        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "#E8EAF6" }}>Organization Name</label>
            <input type="text" placeholder="Your Organization" className="input-field" />
          </div>
          <div className="p-3 rounded-xl"
            style={{ background: "rgba(109,93,246,0.05)", border: "1px solid rgba(109,93,246,0.15)" }}>
            <p className="text-xs" style={{ color: "#6B7BA4" }}>
              <Settings className="w-3.5 h-3.5 inline mr-1" />
              Deployment: Local · Environment: Development
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
