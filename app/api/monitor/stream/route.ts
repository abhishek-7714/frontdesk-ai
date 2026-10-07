import { bus, type CallEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const onEvent = (e: CallEvent) => send(`id: ${e.id}\nevent: fd\ndata: ${JSON.stringify(e)}\n\n`);
      const ping = setInterval(() => send(`: ping\n\n`), 15_000);
      bus().on("event", onEvent);
      send(`retry: 1500\n: connected\n\n`);
      cleanup = () => {
        clearInterval(ping);
        bus().off("event", onEvent);
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
