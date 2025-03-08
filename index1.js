const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const app = express();
app.use(express.json());
app.use(cors());
const TIMEOUT_SECONDS = 5;
const SANDBOX_DIR = "/sandbox";

// Ensure sandbox directory exists
if (!fs.existsSync(SANDBOX_DIR)) {
    fs.mkdirSync(SANDBOX_DIR, { recursive: true });
}

app.post("/execute", async (req, res) => {
    const { language, code } = req.body;

    // Validate language
    if (!["python", "javascript"].includes(language)) {
        return res.status(400).json({ error: "Unsupported language" });
    }

    const filename = `code.${language === "python" ? "py" : "js"}`;
    const filepath = path.join(SANDBOX_DIR, filename);

    try {
        // Write code to a temporary file
        await fs.promises.writeFile(filepath, code, { mode: 0o666 });

        // Command selection
        const cmd = language === "python" ? "python3" : "node";
        const args = [filepath];

        // Spawn process with a timeout
        const process = spawn(cmd, args, {
            timeout: TIMEOUT_SECONDS * 1000, // Kill process after timeout
        });

        let output = "";
        let errorOutput = "";

        process.stdout.on("data", (data) => {
            output += data.toString();
            console.log(data.toString());
        });

        process.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });

        process.on("close", async (code) => {
            await fs.promises.unlink(filepath).catch(() => {}); // Delete file after execution

            res.json({
                output: output.trim(),
                error: errorOutput.trim(),
                exitCode: code
            });
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health Check
app.get("/health", (req, res) => {
    res.status(200).json({ status: "healthy" });
});

// Start Server
app.listen(3000, () => console.log("🚀 Code Execution Server running on port 3000"));
