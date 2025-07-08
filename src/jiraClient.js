import JiraClient from 'jira-client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Get the directory name of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from the env file
const envPath = path.resolve(__dirname, '../env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

// Set environment variables
Object.keys(envConfig).forEach(key => {
  process.env[key] = envConfig[key];
});

// Initialize Jira client
const jira = new JiraClient({
  protocol: 'https',
  host: process.env.JIRA_BASE_URL.replace('https://', ''),
  username: process.env.JIRA_EMAIL,
  password: process.env.JIRA_API_TOKEN,
  apiVersion: '3',
  strictSSL: true
});

// Add custom method to get project components using simple fetch approach
jira.getProjectComponents = async function(projectKey) {
  try {
    // Use native fetch for simplicity
    const apiURL = `${this.protocol}://${this.host}/rest/api/3/project/${projectKey}/components`;
    const response = await fetch(apiURL, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${this.username}:${this.password}`).toString('base64'),
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch components: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting project components:', error);
    throw error;
  }
};

export default jira;