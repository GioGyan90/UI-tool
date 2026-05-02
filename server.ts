import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Cleanup old projects on restart
  try {
    const entries = fs.readdirSync(".");
    const systemPaths = ["node_modules", "dist", "src", "src_backup", "public", ".env.example", ".gemini", "package.json", "package-lock.json", "server.ts", "tsconfig.json", "vite.config.ts", "metadata.json", "firebase-applet-config.json", "firebase-blueprint.json", "firestore.rules"];
    entries.forEach((entry) => {
      if (systemPaths.includes(entry) || entry.startsWith(".")) return;
      try {
        const stats = fs.statSync(entry);
        if (stats.isDirectory()) {
          console.log(`Auto-cleaning up old project: ${entry}`);
          fs.rmSync(entry, { recursive: true, force: true });
        }
      } catch (e) {}
    });
  } catch (e) {
    console.error("Auto-cleanup failed:", e);
  }

  // API to list folders (excluding system directories)
  app.get("/api/folders", (req, res) => {
    try {
      const entries = fs.readdirSync(".");
      const folders = entries.filter((entry) => {
        if (entry === "node_modules" || entry === "dist" || entry === "src" || entry === "src_backup" || entry.startsWith(".")) {
          return false;
        }
        try {
          return fs.statSync(entry).isDirectory();
        } catch (e) {
          return false;
        }
      });
      res.json(folders);
    } catch (e) {
      res.status(500).json({ error: "Failed to list folders" });
    }
  });

  // API to create a new folder with a timestamped name
  app.post("/api/folders/create", (req, res) => {
    try {
      const timestamp = new Date().toISOString().replace(/[-:T]/g, "").split(".")[0];
      const folderName = `${timestamp}`;
      fs.mkdirSync(folderName);
      // Create a default index.html
      fs.writeFileSync(path.join(folderName, "index.html"), `<!DOCTYPE html><html><body><h1>New Project ${folderName}</h1></body></html>`);
      res.json({ name: folderName });
    } catch (e) {
      res.status(500).json({ error: "Failed to create folder" });
    }
  });

  // API to rename a folder
  app.post("/api/folders/rename", (req, res) => {
    const { oldName, newName } = req.body;
    if (!oldName || !newName) {
      return res.status(400).json({ error: "Missing oldName or newName" });
    }
    try {
      if (fs.existsSync(newName)) {
        return res.status(400).json({ error: "New name already exists" });
      }
      fs.renameSync(oldName, newName);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to rename folder" });
    }
  });

  // API to delete a folder
  app.post("/api/folders/delete", (req, res) => {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Missing name" });
    }
    try {
      if (!fs.existsSync(name)) {
        return res.status(404).json({ error: "Folder not found" });
      }
      fs.rmSync(name, { recursive: true, force: true });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete folder" });
    }
  });

  // API to clear all project folders
  app.post("/api/folders/clear", (req, res) => {
    try {
      const entries = fs.readdirSync(".");
      const systemPaths = ["node_modules", "dist", "src", "src_backup", "public", ".env.example", ".gemini", "package.json", "package-lock.json", "server.ts", "tsconfig.json", "vite.config.ts", "metadata.json", "firebase-applet-config.json", "firebase-blueprint.json", "firestore.rules"];
      
      const deleted = [];
      entries.forEach((entry) => {
        if (systemPaths.includes(entry) || entry.startsWith(".")) {
          return;
        }
        try {
          const stats = fs.statSync(entry);
          if (stats.isDirectory()) {
            fs.rmSync(entry, { recursive: true, force: true });
            deleted.push(entry);
          }
        } catch (e) {
          // Ignore
        }
      });
      res.json({ success: true, deleted });
    } catch (e) {
      res.status(500).json({ error: "Failed to clear folders" });
    }
  });

  // API to load files from a folder recursively
  app.get("/api/folders/:name/files", (req, res) => {
    const folderName = req.params.name;
    try {
      const allFiles = [];
      const getFilesRecursively = (dir: string, relativePath = "") => {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const relPath = path.join(relativePath, entry);
          if (fs.statSync(fullPath).isDirectory()) {
            getFilesRecursively(fullPath, relPath);
          } else {
            const content = fs.readFileSync(fullPath, "utf-8");
            const ext = path.extname(entry).toLowerCase();
            let language = "text";
            if (ext === ".html") language = "html";
            else if (ext === ".css") language = "css";
            else if (ext === ".js" || ext === ".jsx" || ext === ".ts" || ext === ".tsx") language = "javascript";
            else if (ext === ".md") language = "markdown";
            
            allFiles.push({ name: relPath, content, language });
          }
        }
      };
      
      if (fs.existsSync(folderName)) {
        getFilesRecursively(folderName);
      }
      res.json(allFiles);
    } catch (e) {
      res.status(500).json({ error: "Failed to load files" });
    }
  });

  // API to save files to a folder
  app.post("/api/folders/:name/files", (req, res) => {
    const folderName = req.params.name;
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: "Missing files array" });
    }
    try {
      if (!fs.existsSync(folderName)) {
        fs.mkdirSync(folderName);
      }
      for (const file of files) {
        const fullPath = path.join(folderName, file.name);
        // Ensure subdirectories exist if file.name contains slashes
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, file.content);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to save files" });
    }
  });

  // Serve static files for each project folder
  // This allows the iframe to point to /<folder-name>/index.html
  app.use((req, res, next) => {
    const folder = req.path.split("/")[1];
    if (folder && fs.existsSync(path.join(__dirname, folder, "index.html"))) {
      return express.static(path.join(__dirname, folder))(req, res, next);
    }
    next();
  });

  // Vite middleware for development (Meta-App)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
