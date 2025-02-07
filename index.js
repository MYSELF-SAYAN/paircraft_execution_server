const express = require("express");
const fs = require("fs");
const path = require("path");
const Docker = require("dockerode");

const app = express();
const docker = new Docker();
app.use(express.json());

const TIMEOUT_SECONDS = 5;
const SANDBOX_IMAGE = {
    python: "python:3.9-alpine",
    javascript: "node:20-alpine"
};

// Simplified paths
const SANDBOX_DIR = "/sandbox";

// Debug endpoint to check directory and permissions
app.get("/debug", async (req, res) => {
    try {
        const files = await fs.promises.readdir(SANDBOX_DIR);
        const stats = await fs.promises.stat(SANDBOX_DIR);
        res.json({
            files,
            permissions: stats.mode,
            exists: fs.existsSync(SANDBOX_DIR)
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.post("/execute", async (req, res) => {
    const { language, code } = req.body;
    if (!SANDBOX_IMAGE[language]) {
        return res.status(400).json({ error: "Unsupported language" });
    }

    const filename = `code.${language === "python" ? "py" : "js"}`;
    const filepath = path.join(SANDBOX_DIR, filename);

    try {
        // Debug info
        console.log("Directory check:", {
            sandboxExists: fs.existsSync(SANDBOX_DIR),
            filepath: filepath
        });

        // Ensure directory exists
        await fs.promises.mkdir(SANDBOX_DIR, { recursive: true });

        // Write file with explicit mode
        await fs.promises.writeFile(filepath, code, { mode: 0o666 });
        console.log(`✔ Code written to ${filepath}`);

        // Verify file
        const fileExists = fs.existsSync(filepath);
        const fileContents = await fs.promises.readFile(filepath, 'utf8');
        console.log('File verification:', {
            exists: fileExists,
            size: fileContents.length,
            contents: fileContents
        });

        // Create container with same path
        const container = await docker.createContainer({
            Image: SANDBOX_IMAGE[language],
            Cmd: language === "python"
                ? ["python3", "-u", filepath]
                : ["node", filepath],
            HostConfig: {
                Memory: 100 * 1024 * 1024,
                CpuShares: 1024,
                NetworkMode: "none",
                Binds: [`${SANDBOX_DIR}:${SANDBOX_DIR}`],
                AutoRemove: true
            },
            AttachStdout: true,
            AttachStderr: true,
            Tty: false
        });

        console.log(`🚀 Starting ${language} container...`);
        await container.start();

        // Get logs with timeout
        const output = await Promise.race([
            new Promise((resolve, reject) => {
                container.logs({
                    follow: true,
                    stdout: true,
                    stderr: true
                }, (err, stream) => {
                    if (err) return reject(err);
                    let output = '';
                    stream.on('data', chunk => output += chunk);
                    stream.on('end', () => resolve(output));
                });
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Execution timeout')), 
                TIMEOUT_SECONDS * 1000)
            )
        ]);

        // Clean up
        try {
            await fs.promises.unlink(filepath);
        } catch (err) {
            console.warn('Warning: Could not delete file:', err.message);
        }

        return res.json({ 
            output: output.toString('utf8')
                .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
                .trim() 
        });

    } catch (error) {
        console.error("❌ Error:", error);
        return res.status(500).json({ error: error.message });
    }
});
// Add this endpoint to your index.js
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});
app.listen(3000, () => console.log("🚀 Docker Sandbox running on port 3000"));