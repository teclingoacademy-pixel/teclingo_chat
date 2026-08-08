import express from "express";
import path from "path";
import { app } from "./api/server";

const PORT = 3000;

export async function startServer() {
  if (process.env.VERCEL) return;

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Venus AI Tutor] Server active at http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}
