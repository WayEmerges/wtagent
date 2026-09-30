export async function webSearchTool(searchTerm, config) {
    const term = searchTerm.trim();
    if (!term) {
        throw new Error("search_term is required");
    }
    const provider = config?.provider ?? "none";
    if (provider === "none" || !config) {
        throw new Error("web_search is not configured. Set webSearch.provider (e.g. \"brave\" or \"tavily\") and webSearch.apiKey in ~/.waytech-agent/config.json");
    }
    if (provider === "brave") {
        const key = config.apiKey?.trim();
        if (!key) {
            throw new Error("webSearch.apiKey is required for brave provider");
        }
        const url = new URL("https://api.search.brave.com/res/v1/web/search");
        url.searchParams.set("q", term);
        url.searchParams.set("count", "5");
        const res = await fetch(url, {
            headers: {
                Accept: "application/json",
                "X-Subscription-Token": key,
            },
        });
        if (!res.ok) {
            throw new Error(`brave search HTTP ${res.status}`);
        }
        const data = (await res.json());
        const results = data.web?.results ?? [];
        if (results.length === 0) {
            return "(no results)";
        }
        return results
            .map((r, i) => `${i + 1}. ${r.title ?? "?"}\n   ${r.url ?? ""}\n   ${r.description ?? ""}`)
            .join("\n\n");
    }
    if (provider === "tavily") {
        const key = config.apiKey?.trim();
        if (!key) {
            throw new Error("webSearch.apiKey is required for tavily provider");
        }
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: key, query: term, max_results: 5 }),
        });
        if (!res.ok) {
            throw new Error(`tavily search HTTP ${res.status}`);
        }
        const data = (await res.json());
        const results = data.results ?? [];
        if (results.length === 0) {
            return "(no results)";
        }
        return results
            .map((r, i) => `${i + 1}. ${r.title ?? "?"}\n   ${r.url ?? ""}\n   ${r.content ?? ""}`)
            .join("\n\n");
    }
    throw new Error(`unsupported webSearch.provider: ${provider}`);
}
//# sourceMappingURL=websearch.js.map