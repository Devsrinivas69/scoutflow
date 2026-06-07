import "dotenv/config";

const apiKey = process.env.OCEAN_API_KEY;

async function main() {
  if (!apiKey) {
    console.error("No OCEAN_API_KEY found");
    return;
  }

  const headers = {
    "Content-Type": "application/json",
    "X-Api-Token": apiKey
  };

  const url = "https://api.ocean.io/v3/search/companies";
  const body = {
    size: 1,
    companiesFilters: {
      lookalikeDomains: ["stripe.com"]
    }
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Full Response Data:", JSON.stringify(data, null, 2));
  } catch (err: any) {
    console.error("Fetch failed:", err.message ?? err);
  }
}

main();
