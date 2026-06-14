import { GoogleAuth } from "google-auth-library";

const PROJECT = process.env.GCP_PROJECT || "";
const LOCATION = process.env.GCP_LOCATION || "us-central1";
const MODEL = process.env.VERTEX_MODEL || "gemini-2.5-flash";

// ADC (Application Default Credentials) — picked up from your gcloud login.
const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

/**
 * Call Gemini on Vertex AI and return the model's text response.
 * Optionally forces JSON output via responseMimeType.
 */
export async function generateText(
  prompt: string,
  opts: { json?: boolean } = {},
): Promise<string> {
  if (!PROJECT) throw new Error("GCP_PROJECT is not set");

  const token = await auth.getAccessToken();
  const url =
    `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}` +
    `/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.9,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-goog-user-project": PROJECT,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Vertex AI error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: { text?: string }) => p.text ?? "").join("").trim();
}
