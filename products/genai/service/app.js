import Groq from "groq-sdk";
import { tavily } from "@tavily/core";
import "dotenv/config";
import NodeCache from "node-cache";

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const cache = new NodeCache({ stdTTL: 60 * 60 * 24 }); // for 24 hrs

// Same testrix_network the gateway proxies to — container DNS names, matching each
// product's own docker-compose `container_name:`. Overridable via env for local/dev runs.
const AUTOMATION_BASE_URL = process.env.AUTOMATION_BASE_URL || "http://automation-portal-backend:8080";
const API_TESTING_BASE_URL = process.env.API_TESTING_BASE_URL || "http://api-testing-backend:8080";
const PERFORMANCE_BASE_URL = process.env.PERFORMANCE_BASE_URL || "http://performance-testing-backend:8080";

const TRUNCATE_LEN = 1500;
const truncate = (s) =>
  typeof s === "string" && s.length > TRUNCATE_LEN ? s.slice(0, TRUNCATE_LEN) + "…(truncated)" : s;


async function fetchJson(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = new Error(`Request failed: ${res.status} ${url}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  // automation-portal/performance-testing wrap in {success,message,data}; api-testing
  // returns raw bodies (Page<T>, entities) — same unwrap shell/App.jsx already does.
  return body?.data ?? body;
}

const asRows = (data) => (Array.isArray(data) ? data : Array.isArray(data?.content) ? data.content : []);

// ── search_testrix ───────────────────────────────────────────────────────────
function roundRobinCap(groups, limit) {
  const out = [];
  let i = 0;
  while (out.length < limit && groups.some((g) => i < g.length)) {
    for (const g of groups) {
      if (out.length >= limit) break;
      if (i < g.length) out.push(g[i]);
    }
    i++;
  }
  return out;
}

function searchSources(token) {
  return {
    automation: [
      {
        entityType: "execution",
        url: `${AUTOMATION_BASE_URL}/api/executions`,
        nameOf: (r) => [r.executionCode, r.moduleName, r.framework].filter(Boolean).join(" "),
        toItem: (r) => ({
          id: r.id,
          title: r.executionCode || `Execution #${r.id}`,
          subtitle: r.moduleName || r.framework || "",
          status: r.status,
          sub: "execution",
        }),
      },
      {
        entityType: "module",
        url: `${AUTOMATION_BASE_URL}/api/modules`,
        nameOf: (r) => r.name || "",
        toItem: (r) => ({ id: r.id, title: r.name, subtitle: r.framework || "", status: null, sub: "environments" }),
      },
    ],
    "api-testing": [
      {
        entityType: "collection",
        url: `${API_TESTING_BASE_URL}/api/v1/collections`,
        nameOf: (r) => r.name || "",
        toItem: (r) => ({ id: r.id, title: r.name, subtitle: "Collection", status: null, sub: "tester" }),
      },
      {
        entityType: "base_api",
        url: `${API_TESTING_BASE_URL}/api/v1/base-apis`,
        nameOf: (r) => r.name || "",
        toItem: (r) => ({ id: r.id, title: r.name, subtitle: r.method || "Base API", status: null, sub: "base-apis" }),
      },
      {
        entityType: "regular_api",
        url: `${API_TESTING_BASE_URL}/api/v1/regular-apis`,
        nameOf: (r) => r.name || "",
        toItem: (r) => ({ id: r.id, title: r.name, subtitle: r.method || "Regular API", status: null, sub: "regular-apis" }),
      },
      {
        entityType: "schedule",
        url: `${API_TESTING_BASE_URL}/api/v1/schedules`,
        nameOf: (r) => r.name || "",
        toItem: (r) => ({ id: r.id, title: r.name, subtitle: r.frequencyType || "Schedule", status: r.status, sub: "scheduler" }),
      },
    ],
    performance: [
      {
        entityType: "performance_test",
        url: `${PERFORMANCE_BASE_URL}/api/v1/performance-tests`,
        nameOf: (r) => r.name || "",
        toItem: (r) => ({ id: r.id, title: r.name, subtitle: "Performance Test", status: null, sub: "performance-tests" }),
      },
      {
        entityType: "load_test",
        url: `${PERFORMANCE_BASE_URL}/api/v1/load-tests`,
        nameOf: (r) => r.name || "",
        toItem: (r) => ({ id: r.id, title: r.name, subtitle: "Load Test", status: null, sub: "load-tests" }),
      },
      {
        entityType: "test_group",
        url: `${PERFORMANCE_BASE_URL}/api/v1/test-groups`,
        nameOf: (r) => r.name || "",
        toItem: (r) => ({ id: r.id, title: r.name, subtitle: "Test Group", status: null, sub: "groups" }),
      },
    ],
  };
}

async function searchTestrix({ query, scope = "all" }, token) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return { items: [], totalMatches: 0 };

  const sources = searchSources(token);
  const products = scope === "all" ? Object.keys(sources) : [scope].filter((p) => sources[p]);

  const matchGroups = await Promise.all(
    products.flatMap((product) =>
      sources[product].map(async (source) => {
        try {
          const rows = asRows(await fetchJson(source.url, token));
          return rows
            .filter((r) => source.nameOf(r).toLowerCase().includes(q))
            .map((r) => ({ type: "search", product, entityType: source.entityType, ...source.toItem(r) }));
        } catch {
          return []; // module not enabled for this project / transient error — skip, don't fail the whole search
        }
      })
    )
  );

  const totalMatches = matchGroups.reduce((sum, g) => sum + g.length, 0);
  return { items: roundRobinCap(matchGroups, 15), totalMatches };
}

// ── get_analytics_summary ────────────────────────────────────────────────────
const rangeToDays = (range) => ({ "7d": 7, "30d": 30, "90d": 90 }[range] || 7);

function trimSummary(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const trimmed = {};
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) trimmed[k] = v.slice(0, 5);
    else trimmed[k] = v;
  }
  return trimmed;
}

async function getAnalyticsSummary({ product = "all", range = "7d" }, token) {
  const wantsAll = product === "all";
  const result = { automation: null, apiTesting: null, performance: null };

  if (wantsAll || product === "automation") {
    try {
      result.automation = trimSummary(await fetchJson(`${AUTOMATION_BASE_URL}/api/dashboard/summary?range=${range}`, token));
    } catch {
      result.automation = null;
    }
  }
  if (wantsAll || product === "api-testing") {
    try {
      result.apiTesting = trimSummary(
        await fetchJson(`${API_TESTING_BASE_URL}/api/v1/dashboard/summary?days=${rangeToDays(range)}`, token)
      );
    } catch {
      result.apiTesting = null;
    }
  }
  if (wantsAll || product === "performance") {
    try {
      result.performance = trimSummary(await fetchJson(`${PERFORMANCE_BASE_URL}/api/v1/dashboard/stats?range=${range}`, token));
    } catch {
      result.performance = null;
    }
  }
  return result;
}

// ── get_failure_details ──────────────────────────────────────────────────────
async function getFailureDetails({ product, id, limit = 5 }, token) {
  const cappedLimit = Math.min(Number(limit) || 5, 10);

  if (product === "automation") {
    if (id) {
      const testCases = asRows(await fetchJson(`${AUTOMATION_BASE_URL}/api/executions/${id}/test-cases`, token));
      return {
        id,
        failures: testCases
          .filter((tc) => tc.status === "FAIL")
          .slice(0, cappedLimit)
          .map((tc) => ({
            name: tc.testCaseName || tc.name,
            failureReason: truncate(tc.failureReason),
            exceptionType: tc.exceptionType,
            stackTrace: truncate(tc.stackTrace),
          })),
      };
    }
    const rows = asRows(await fetchJson(`${AUTOMATION_BASE_URL}/api/executions?status=FAILED`, token));
    return { recent: rows.slice(0, cappedLimit).map((r) => ({ id: r.id, executionCode: r.executionCode, module: r.moduleName, status: r.status })) };
  }

  if (product === "api-testing") {
    if (id) {
      const detail = await fetchJson(`${API_TESTING_BASE_URL}/api/v1/history/${id}`, token);
      return {
        id,
        errorMessage: truncate(detail.errorMessage),
        responseStatusCode: detail.responseStatusCode,
        responseBody: truncate(detail.responseBody),
      };
    }
    const page = await fetchJson(`${API_TESTING_BASE_URL}/api/v1/history?status=FAILED&size=${cappedLimit}`, token);
    const rows = asRows(page);
    return { recent: rows.slice(0, cappedLimit).map((r) => ({ id: r.id, errorMessage: truncate(r.errorMessage), status: r.responseStatusCode })) };
  }

  if (product === "performance") {
    if (id) {
      const run = await fetchJson(`${PERFORMANCE_BASE_URL}/api/v1/runs/${id}`, token);
      return {
        id,
        errorMessage: truncate(run.errorMessage),
        errorRatePct: run.errorRatePct,
        status: run.status,
      };
    }
    const page = await fetchJson(`${PERFORMANCE_BASE_URL}/api/v1/runs?status=FAILED&size=${cappedLimit}`, token);
    const rows = asRows(page);
    return { recent: rows.slice(0, cappedLimit).map((r) => ({ id: r.id, testName: r.testName, errorMessage: truncate(r.errorMessage) })) };
  }

  return { error: `Unknown product '${product}'` };
}

// ── webSearch (existing) ─────────────────────────────────────────────────────
async function webSearch({ query }) {
  console.log("Calling the Websearch tool......");
  const response = await tvly.search(query);
  return response.results.map((result) => result.content).join("\n\n");
}

// ── tool schema for Groq function-calling ────────────────────────────────────
const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_testrix",
      description:
        "Search across the user's own Testrix project data — automation executions/modules, API Testing collections/APIs/schedules, Performance Testing tests/groups — by free text. Use for 'find/search/show me X' requests about a specific named thing. Not for aggregate stats (use get_analytics_summary) or failure diagnosis (use get_failure_details).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Free-text term: execution code, module/API/collection/schedule/test name" },
          scope: { type: "string", enum: ["all", "automation", "api-testing", "performance"], description: "Limit the search to one product; default 'all'" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_analytics_summary",
      description:
        "Get aggregate dashboard analytics (pass rate, execution/run counts, trends, schedules) for one or more Testrix products. Use for 'report/stats/trend/how is X doing' requests, not for finding one specific item or diagnosing one failure.",
      parameters: {
        type: "object",
        properties: {
          product: { type: "string", enum: ["automation", "api-testing", "performance", "all"], description: "Which product to report on; default 'all'" },
          range: { type: "string", enum: ["7d", "30d", "90d"], description: "Time window; default '7d'" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_failure_details",
      description:
        "Diagnose failures. Without id: lists the most recent failing executions/runs for a product (short reasons only). With id: full failure detail (stack trace / exception / error message) for one specific execution (automation), history entry (api-testing), or run (performance). Use whenever the user asks why something failed, wants recent errors, or wants troubleshooting suggestions.",
      parameters: {
        type: "object",
        properties: {
          product: { type: "string", enum: ["automation", "api-testing", "performance"], description: "Which product the failure belongs to" },
          id: { type: "integer", description: "Specific execution/history/run id; omit to list recent failures instead" },
          limit: { type: "integer", description: "Max recent failures to list when id is omitted; default 5, max 10" },
        },
        required: ["product"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "webSearch",
      description: "Search the real time data and information on the Internet",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query to perform search on" },
        },
        required: ["query"],
      },
    },
  },
];

const TOOL_RESULT_TYPE = {
  search_testrix: "search",
  get_analytics_summary: "analytics",
  get_failure_details: "failure",
  webSearch: "webSearch",
};

// Groq's hosted Llama models occasionally emit a malformed function call as plain text
// instead of a proper tool_calls entry — the API rejects it as a 400 "tool_use_failed"
// but still hands back the raw attempt in failed_generation, e.g.
// `<function=get_analytics_summary{"product": "automation"}</function>`. Recover from
// this instead of failing the whole turn: parse it back into a real tool call.
function parseFailedGeneration(text) {
  const m = /<function=([a-zA-Z_][\w]*)\s*(\{[\s\S]*\})\s*<\/function>/.exec(String(text || ""));
  if (!m) return null;
  try {
    return { name: m[1], args: JSON.parse(m[2]) };
  } catch {
    return null;
  }
}

// Groq's free tier tracks tokens-per-day separately per model — so once the primary model's
// daily quota is exhausted, retrying the exact same request on a different free model has its
// own, still-fresh budget. This keeps the assistant answering instead of hard-failing for
// however many hours remain until the primary model's quota resets.
const FALLBACK_MODEL = "openai/gpt-oss-20b";

async function createCompletion(payload) {
  try {
    return await groq.chat.completions.create(payload);
  } catch (e) {
    // e.error is the full parsed response body, i.e. {"error": {message, code, failed_generation}}
    const body = e?.error?.error;

    const recovered = e?.status === 400 ? parseFailedGeneration(body?.failed_generation) : null;
    if (recovered) {
      return {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: `recovered_${Date.now()}`,
                  type: "function",
                  function: { name: recovered.name, arguments: JSON.stringify(recovered.args) },
                },
              ],
            },
          },
        ],
      };
    }

    const isDailyQuotaHit = e?.status === 429 && body?.code === "rate_limit_exceeded"
      && /tokens per day|TPD/i.test(body?.message || "");
    if (isDailyQuotaHit && payload.model !== FALLBACK_MODEL) {
      console.log(`${payload.model} daily quota hit — falling back to ${FALLBACK_MODEL}`);
      return createCompletion({ ...payload, model: FALLBACK_MODEL });
    }

    throw e;
  }
}

export async function generate(userMessage, cacheKey, token) {
  const baseMessage = [
    {
      role: "system",
      content: `You are the Testrix AI Assistant, built into the Testrix testing platform. Be polite and direct.

You have four tools:
- search_testrix(query, scope?): find a specific execution, module, collection, API, schedule, or test by name inside the user's own Testrix project.
- get_analytics_summary(product?, range?): aggregate stats/trends/pass-rates for Automation, API Testing, and/or Performance Testing.
- get_failure_details(product, id?, limit?): recent failures for a product, or full error/stack-trace detail for one specific execution/history/run.
- webSearch(query): background knowledge needed to support a Testrix question only (e.g. what a framework error message means, testing best practices) — never for topics unrelated to Testrix or software testing.

Every Testrix tool result is already scoped to the user's own current project — never ask which project they mean, and never claim to see other projects' data. Prefer the Testrix tools over webSearch whenever the question is about the user's own tests, executions, runs, or results. Answer directly when you already know the answer; otherwise pick the right tool. Do not mention tool names to the user.

How to answer:
- Never return raw numbers/lists on their own. After any data (from a tool or from the conversation), add a short insight in plain language: what it means, whether it's good/bad/normal, and what stands out (e.g. "Pass rate dropped 12% vs last week, driven mostly by API Testing failures").
- Ground every number, name, and trend you state strictly in what a tool result actually returned — never invent or guess a figure, module name, or comparison that isn't in the data. If a tool result field is null, empty, or missing, say plainly that there's no data available for that (e.g. "No automation data found for the last 7 days — this could mean no runs happened, or the service is temporarily unreachable"), and stop there instead of making something up.
- If the user asks what to do about an insight (a failing test, a dropping pass rate, a slow response time, an error), give a concrete, actionable suggestion grounded in the actual failure detail/analytics returned — not generic advice.
- If the user only shares an observation without asking for a fix, offer one proactively in one short line, and let them ask to go deeper.

Scope restriction: you only discuss the Testrix platform — the user's tests, executions, runs, reports, failures, analytics, and how to use Testrix's own features. If the user asks something with no connection to Testrix or their testing data (general knowledge, personal advice, coding help unrelated to Testrix, other tools/products, casual chit-chat, etc.), politely decline in one line and steer back, e.g. "I can only help with your Testrix data and testing questions — ask me about your executions, reports, or failures." Do not use webSearch to answer an out-of-scope question.

Current date and time: ${new Date().toLocaleString()}.`,
    },
  ];

  const messages = cache.get(cacheKey) ?? baseMessage;
  messages.push({ role: "user", content: userMessage });

  const toolResults = [];
  const maxRetry = 10;
  let count = 0;

  while (true) {
    if (count > maxRetry) {
      return { message: "Sorry result not found, Please try after some time.", toolResults };
    }
    count++;
    const completions = await createCompletion({
      temperature: 0,
      model: "openai/gpt-oss-120b",
      messages,
      tools: TOOLS,
      tool_choice: "auto",
    });

    const choiceMessage = completions.choices[0].message;
    messages.push(choiceMessage);
    const toolCalls = choiceMessage.tool_calls;

    if (!toolCalls) {
      cache.set(cacheKey, messages);
      return { message: choiceMessage.content, toolResults };
    }

    for (const tool of toolCalls) {
      const funName = tool.function.name;
      const args = JSON.parse(tool.function.arguments || "{}");
      let toolResult;
      try {
        if (funName === "search_testrix") toolResult = await searchTestrix(args, token);
        else if (funName === "get_analytics_summary") toolResult = await getAnalyticsSummary(args, token);
        else if (funName === "get_failure_details") toolResult = await getFailureDetails(args, token);
        else if (funName === "webSearch") toolResult = await webSearch(args);
        else toolResult = { error: `Unknown tool ${funName}` };
      } catch (e) {
        toolResult = { error: e.message || "Tool call failed" };
      }

      if (funName !== "webSearch") {
        toolResults.push({ type: TOOL_RESULT_TYPE[funName] || "unknown", tool: funName, args, data: toolResult });
      }

      messages.push({
        tool_call_id: tool.id,
        role: "tool",
        content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
        name: funName,
      });
    }
  }
}
