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
    const data: any = await res.json();
    const company = data?.companies?.[0]?.company;
    if (company) {
      console.log("Company keys:", Object.keys(company));
      console.log("Company domains & urls:", {
        domain: company.domain,
        rootUrl: company.rootUrl,
        website: company.website,
      });
    } else {
      console.log("No company found in results:", data);
    }
  } catch (err: any) {
    console.error("Fetch failed:", err.message ?? err);
  }
}

main();
