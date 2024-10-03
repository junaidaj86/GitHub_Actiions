import express, { Request, Response } from "express";
import axios from "axios";
import yaml from "js-yaml";
import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";
import merge from "lodash.merge"; // Importing lodash.merge for deep merging

dotenv.config();

const app = express();
app.use(express.json());

// GitHub configuration (replace with your own values or environment variables)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN as string;
const GITHUB_OWNER = process.env.GITHUB_OWNER as string;
const GITHUB_REPO = process.env.GITHUB_REPO as string;
let BRANCH_NAME = "test"; // Temporary branch for the update

// Initialize GitHub API client using Octokit
const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

// Function to deeply merge existing data with new data
const deepMergeWithChanges = (target: any, source: any) => {
    for (const key in source) {
        if (source.hasOwnProperty(key)) {
            if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                deepMergeWithChanges(target[key], source[key]);
            } else {
                if (target[key] !== source[key]) {
                    target[key] = source[key];
                }
            }
        }
    }
};

// Function to add new objects if they are not already present
const addNewObjectsIfNotPresent = (target: any, source: any) => {
    console.log("asdasd")
    for (const key in source) {
        console.log(key)
        if (source.hasOwnProperty(key)) {
            console.log("inside 1")
            if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                // If the target doesn't have this key, add the entire object from the source
                console.log("inside 2")
                if (!target[key]) {
                    console.log("inside 3")
                    target[key] = source[key]; // Assign the whole object from source
                } else {
                    console.log("inside 4")
                    // If the key exists, recurse into nested objects
                    addNewObjectsIfNotPresent(target[key], source[key]);
                }
            } else {
                console.log("inside 5")
                // If the target key is undefined, add the new value
                if (target[key] === undefined) {
                    target[key] = source[key]; // Add new key-value pair
                }
            }
        }
    }
};


// Endpoint to update a YAML file in the GitHub repo
app.post("/update", async (req: Request, res: Response) => {
    const { filePath, updateData }: { filePath: string; updateData: any; branchName: string } = req.body;
    BRANCH_NAME = req.body.branchName;
    try {
        // 1. Get the YAML file from GitHub
        const fileData = await octokit.repos.getContent({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: filePath,
            ref: "main",
        });

        // Ensure we're dealing with a file
        if (!Array.isArray(fileData.data) && fileData.data.type === "file" && fileData.data.content) {
            const content = Buffer.from(fileData.data.content, "base64").toString("utf8");
            let yamlData = yaml.load(content) as Record<string, any>;

            // 3. Deep merge the new data with the existing data
            deepMergeWithChanges(yamlData, updateData);

            // Log the merged YAML data for debugging
            console.log("Merged YAML Data:", JSON.stringify(yamlData, null, 2));

            // Convert the updated YAML object back to a string
            const updatedYamlContent = yaml.dump(yamlData);

            // Create a new branch for the update
            const refData = await octokit.git.getRef({
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO,
                ref: "heads/main",
            });

            await octokit.git.createRef({
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO,
                ref: `refs/heads/${BRANCH_NAME}`,
                sha: refData.data.object.sha,
            });

            // Commit the updated file to the new branch
            await octokit.repos.createOrUpdateFileContents({
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO,
                path: filePath,
                message: "Updating YAML file via API",
                content: Buffer.from(updatedYamlContent).toString("base64"),
                branch: BRANCH_NAME,
                sha: fileData.data.sha as string, // Use the SHA from the original file
            });

            // Create a pull request to merge the changes into the main branch
            const pr = await octokit.pulls.create({
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO,
                title: "Update YAML file",
                head: BRANCH_NAME,
                base: "main",
                body: "This PR updates the YAML file via the API",
            });

            res.json({
                message: "YAML file updated and pull request created",
                pr_url: pr.data.html_url,
            });
        } else {
            res.status(400).json({
                error: "The specified path is not a file or the file does not exist.",
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update YAML file and create pull request" });
    }
});

// API to add a new section to the YAML file
app.post("/add", async (req: Request, res: Response) => {
    const { filePath, newSection, branchName }: { filePath: string; newSection: any; branchName: string } = req.body;
    BRANCH_NAME = branchName;
    try {
        // Fetch the YAML file from GitHub
        const fileData = await octokit.repos.getContent({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: filePath,
            ref: "main",
        });

        if (!Array.isArray(fileData.data) && fileData.data.type === "file" && fileData.data.content) {
            const content = Buffer.from(fileData.data.content, "base64").toString("utf8");
            let yamlData = yaml.load(content) as Record<string, any>;

            // Log the original YAML data for debugging
            //console.log("Original YAML Data:", JSON.stringify(yamlData, null, 2));

            // Add the new section (merge)
            addNewObjectsIfNotPresent(yamlData, newSection);

            // Log the updated YAML data after adding new sections
            //console.log("Updated YAML Data after Adding New Section:", JSON.stringify(yamlData, null, 2));

            // Convert updated YAML to string
            const updatedYamlContent = yaml.dump(yamlData);

            // Create a new branch and commit the changes
            const refData = await octokit.git.getRef({
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO,
                ref: "heads/main",
            });

            await octokit.git.createRef({
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO,
                ref: `refs/heads/${BRANCH_NAME}`,
                sha: refData.data.object.sha,
            });

            await octokit.repos.createOrUpdateFileContents({
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO,
                path: filePath,
                message: "Add new section to YAML file",
                content: Buffer.from(updatedYamlContent).toString("base64"),
                branch: BRANCH_NAME,
                sha: fileData.data.sha as string,
            });

            const pr = await octokit.pulls.create({
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO,
                title: "Add new section to YAML file",
                head: BRANCH_NAME,
                base: "main",
                body: "This PR adds a new section to the YAML file.",
            });

            res.json({
                message: "New section added and pull request created",
                pr_url: pr.data.html_url,
            });
        } else {
            res.status(400).json({ error: "File not found or not valid." });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add new section" });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
