import express, { Request, Response } from 'express';
import axios from 'axios';
import yaml from 'js-yaml';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Types for request body
interface UpdateYamlRequest {
  filePath: string;
  updateData: Record<string, any>; // Dynamic object with key-value pairs
}

// GitHub configuration (replace with your own values or environment variables)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN as string;
const GITHUB_OWNER = 'your-github-username';
const GITHUB_REPO = 'your-repo-name';
const BRANCH_NAME = 'feature/update-yaml'; // Temporary branch for the update

// Initialize GitHub API client using Octokit
const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

// Endpoint to update a YAML file in the GitHub repo
app.post('/update-yaml', async (req: Request, res: Response) => {
  const { filePath, updateData }: UpdateYamlRequest = req.body;

  try {
    // 1. Get the YAML file from GitHub
    const fileData = await octokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: filePath,
      ref: 'main',
    });

    // Type guard to ensure we're dealing with a file and not a directory or other type
    if (!Array.isArray(fileData.data) && fileData.data.type === 'file' && fileData.data.content) {
      // Decode the base64 file content
      const content = Buffer.from(fileData.data.content, 'base64').toString('utf8');

      // 2. Parse the YAML file
      let yamlData = yaml.load(content) as Record<string, any>;

      // 3. Update the YAML data (merge the new data with the old one)
      yamlData = { ...yamlData, ...updateData };

      // 4. Convert the updated YAML object back to a string
      const updatedYamlContent = yaml.dump(yamlData);

      // 5. Create a new branch for the update
      const refData = await octokit.git.getRef({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        ref: 'heads/main',
      });

      await octokit.git.createRef({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        ref: `refs/heads/${BRANCH_NAME}`,
        sha: refData.data.object.sha,
      });

      // 6. Commit the updated file to the new branch
      await octokit.repos.createOrUpdateFileContents({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: filePath,
        message: 'Updating YAML file via API',
        content: Buffer.from(updatedYamlContent).toString('base64'),
        branch: BRANCH_NAME,
        sha: fileData.data.sha as string, // Use the SHA from the original file
      });

      // 7. Create a pull request to merge the changes into the main branch
      const pr = await octokit.pulls.create({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        title: 'Update YAML file',
        head: BRANCH_NAME,
        base: 'main',
        body: 'This PR updates the YAML file via the API',
      });

      // Respond with the pull request URL
      res.json({ message: 'YAML file updated and pull request created', pr_url: pr.data.html_url });
    } else {
      // Handle cases where the file is not found or is a directory
      res.status(400).json({ error: 'The specified path is not a file or the file does not exist.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update YAML file and create pull request' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
