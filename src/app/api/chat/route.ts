import { NextRequest, NextResponse } from "next/server";
import { streamRealLLM, StreamMessage } from "@/lib/providers/llm-stream";
import { agentRegistry } from "@/lib/agents/registry";
import { getApiKey } from "@/lib/providers/keys";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      message,
      messages: pastMessages,
      manualAgentId = "auto",
      provider: requestedProvider,
      model,
      apiKey: clientApiKey,
    } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message content is required." }, { status: 400 });
    }

    // Determine the active provider
    // Check which provider is configured (priority: user requested > gemini > openai > anthropic > groq > openrouter > ollama)
    let provider = requestedProvider;
    if (!provider || provider === "auto") {
      if (getApiKey("gemini")) provider = "gemini";
      else if (getApiKey("openai")) provider = "openai";
      else if (getApiKey("anthropic")) provider = "anthropic";
      else if (getApiKey("groq")) provider = "groq";
      else if (getApiKey("openrouter")) provider = "openrouter";
      else provider = "gemini"; // Default to Gemini
    }

    // Resolve Agent system prompt
    let systemPrompt = "You are MHP, a unified AI Super Agent platform. You provide direct, helpful, highly capable, and meticulously structured responses.";
    if (manualAgentId && manualAgentId !== "auto") {
      const agent = agentRegistry.getAgent(manualAgentId);
      if (agent) {
        systemPrompt = `You are the ${agent.name} within MHP Super Agent platform.\nDescription: ${agent.description}\nInstructions: ${agent.instructions}`;
      }
    }

    // Prepare message history
    const conversation: StreamMessage[] = [];
    if (Array.isArray(pastMessages) && pastMessages.length > 0) {
      for (const m of pastMessages) {
        if (m.role === "user" || m.role === "assistant") {
          conversation.push({ role: m.role, content: m.content });
        }
      }
    } else {
      conversation.push({ role: "user", content: message });
    }

    // Create Server-Sent Events stream
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          let fullText = "";

          for await (const token of streamRealLLM(conversation, {
            provider,
            model,
            systemPrompt,
            overrideApiKey: clientApiKey,
          })) {
            fullText += token;
            const eventPayload = JSON.stringify({ type: "token", delta: token });
            controller.enqueue(encoder.encode(`data: ${eventPayload}\n\n`));
          }

          // Emit completion event
          const donePayload = JSON.stringify({
            type: "done",
            fullText,
            provider,
            model: model || "default",
          });
          controller.enqueue(encoder.encode(`data: ${donePayload}\n\n`));
          controller.close();
        } catch (err: any) {
          const errPayload = JSON.stringify({
            type: "error",
            message: err.message || "Streaming error occurred",
          });
          controller.enqueue(encoder.encode(`data: ${errPayload}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}