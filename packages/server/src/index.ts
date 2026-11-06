const port = Number(process.env.PORT ?? 8787);

Bun.serve({
  port,
  fetch: () => new Response("neon-racer server"),
});

console.log(`server on :${port}`);
