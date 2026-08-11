import OpenAI from "openai";

const cache = new Map<string, OpenAI>();

export function getClient(baseURL: string, apiKey: string): OpenAI {
  const key = `${baseURL}\0${apiKey}`;
  let client = cache.get(key);
  if (!client) {
    client = new OpenAI({
      baseURL,
      apiKey: apiKey.length > 0 ? apiKey : "local",
      timeout: 60 * 60 * 1000,
      maxRetries: 0,
    });
    cache.set(key, client);
  }
  return client;
}
