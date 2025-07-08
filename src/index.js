import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import jira from './jiraClient.js';
import { z } from 'zod';
import fetch from 'node-fetch';

// Log to stderr instead of stdout for debug messages
const debug = (message) => {
  console.error(message);
};

// Create an MCP server
const server = new McpServer({
  name: 'jira-mcp',
  version: '1.0.0',
  description: 'A Model Context Protocol server for JIRA integration'
});

// Helper function to enhance response with a clickable link
function addClickableLink(response, issueKey, message = 'View in JIRA') {
  const url = `${process.env.JIRA_BASE_URL}/browse/${issueKey}`;
  return {
    ...response,
    issue_url: url,
    clickable_link: `[${message} (${issueKey})](${url})`
  };
}

// New helper function that formats response with a direct clickable link at the end
function responseWithDirectLink(responseObj, issueKey, message = 'View in JIRA') {
  const url = `${process.env.JIRA_BASE_URL}/browse/${issueKey}`;
  // First create the enhanced JSON response
  const enhancedResponse = addClickableLink(responseObj, issueKey, message);
  
  // Return an array of content items - first the JSON, then the clickable link
  return [
    { type: 'text', text: JSON.stringify(enhancedResponse, null, 2) },
    { type: 'text', text: `\n[${issueKey}](${url})` }
  ];
}

// Add a new helper for linked issues
function responseWithMultipleLinks(responseObj, links) {
  // Return an array of content items - first the JSON, then the clickable links
  const content = [
    { type: 'text', text: JSON.stringify(responseObj, null, 2) },
    { type: 'text', text: '\n' }
  ];
  
  // Add each link
  links.forEach((link) => {
    content.push({ 
      type: 'text', 
      text: `[${link.text}](${link.url}) ` 
    });
  });
  
  return content;
}

// Helper function to convert markdown-style text to Atlassian Document Format
function convertToAtlassianDoc(text) {
  // Split the text into lines
  const lines = text.split('\n');
  const content = [];
  
  let inOrderedList = false;
  let orderedListItems = [];

  // Process each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if the line is a heading (starts with ## )
    if (line.startsWith('## ') || line.startsWith('h2. ')) {
      // If we were in a list, add it before starting a new element
      if (inOrderedList) {
        content.push({
          type: "orderedList",
          content: orderedListItems
        });
        orderedListItems = [];
        inOrderedList = false;
      }
      
      content.push({
        type: "heading",
        attrs: { level: 2 },
        content: [
          {
            type: "text",
            text: line.startsWith('## ') ? line.substring(3) : line.substring(4) // Remove the '## ' or 'h2. ' prefix
          }
        ]
      });
    }
    // Check if it's a level 1 heading (starts with # or h1.)
    else if (line.startsWith('# ') || line.startsWith('h1. ')) {
      // If we were in a list, add it before starting a new element
      if (inOrderedList) {
        content.push({
          type: "orderedList",
          content: orderedListItems
        });
        orderedListItems = [];
        inOrderedList = false;
      }
      
      content.push({
        type: "heading",
        attrs: { level: 1 },
        content: [
          {
            type: "text",
            text: line.startsWith('# ') ? line.substring(2) : line.substring(4) // Remove the '# ' or 'h1. ' prefix
          }
        ]
      });
    }
    // Check if it's a level 3 heading (starts with ### or h3.)
    else if (line.startsWith('### ') || line.startsWith('h3. ')) {
      // If we were in a list, add it before starting a new element
      if (inOrderedList) {
        content.push({
          type: "orderedList",
          content: orderedListItems
        });
        orderedListItems = [];
        inOrderedList = false;
      }
      
      content.push({
        type: "heading",
        attrs: { level: 3 },
        content: [
          {
            type: "text",
            text: line.startsWith('### ') ? line.substring(4) : line.substring(4) // Remove the '### ' or 'h3. ' prefix
          }
        ]
      });
    }
    // Check if it's a numbered list item (starts with digit followed by period)
    else if (/^\d+\.\s/.test(line)) {
      inOrderedList = true;
      // Extract the text after the number and period
      const listText = line.replace(/^\d+\.\s/, '');
      
      orderedListItems.push({
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: listText
              }
            ]
          }
        ]
      });
    }
    // Otherwise, treat it as a regular paragraph
    else if (line !== '') {
      // If we were in a list, add it before starting a new element
      if (inOrderedList) {
        content.push({
          type: "orderedList",
          content: orderedListItems
        });
        orderedListItems = [];
        inOrderedList = false;
      }
      
      content.push({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: line
          }
        ]
      });
    }
    // Add empty paragraph for blank lines
    else if (line === '') {
      // Only add blank lines between content, not at the start or end
      if (i > 0 && i < lines.length - 1) {
        // If we were in a list and encounter a blank line, close the list
        if (inOrderedList) {
          content.push({
            type: "orderedList",
            content: orderedListItems
          });
          orderedListItems = [];
          inOrderedList = false;
        }
        
        content.push({
          type: "paragraph",
          content: []
        });
      }
    }
  }
  
  // If we ended while still in a list, add it
  if (inOrderedList) {
    content.push({
      type: "orderedList",
      content: orderedListItems
    });
  }

  return {
    type: "doc",
    version: 1,
    content: content
  };
}

// Tool: Get JIRA issue details
server.tool(
  'jira_get_issue',
  { issue_key: z.string().describe('The JIRA issue key (e.g., FLOP-123)') },
  async ({ issue_key }) => {
    try {
      const issue = await jira.findIssue(issue_key);
      const response = {
        key: issue.key,
        summary: issue.fields.summary,
        description: issue.fields.description,
        status: issue.fields.status.name,
        assignee: issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned',
        creator: issue.fields.creator ? issue.fields.creator.displayName : 'Unknown',
        created: issue.fields.created,
        updated: issue.fields.updated,
        issuetype: issue.fields.issuetype.name,
        priority: issue.fields.priority ? issue.fields.priority.name : 'Not set',
        labels: issue.fields.labels,
        url: `${process.env.JIRA_BASE_URL}/browse/${issue.key}`
      };
      
      // Use new helper function for direct clickable link
      return {
        content: responseWithDirectLink(response, issue.key)
      };
    } catch (error) {
      return { 
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Search JIRA issues with JQL
server.tool(
  'jira_search',
  { 
    jql: z.string().describe('The JQL query (e.g., "project = FLOP AND status = \'In Progress\'")'),
    max_results: z.number().optional().default(10).describe('Maximum number of results to return')
  },
  async ({ jql, max_results = 10 }) => {
    try {
      const searchResults = await jira.searchJira(jql, {
        maxResults: max_results,
        fields: ['summary', 'status', 'assignee', 'issuetype', 'priority', 'created', 'updated']
      });
      
      const issues = searchResults.issues.map(issue => {
        const baseIssue = {
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status.name,
          assignee: issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned',
          issuetype: issue.fields.issuetype.name,
          priority: issue.fields.priority ? issue.fields.priority.name : 'Not set',
          created: issue.fields.created,
          updated: issue.fields.updated,
          url: `${process.env.JIRA_BASE_URL}/browse/${issue.key}`
        };
        
        // Add clickable link to each issue
        return addClickableLink(baseIssue, issue.key);
      });
      
      const response = {
        total: searchResults.total,
        issues
      };
      
      // Create an array of content items
      const content = [
        { type: 'text', text: JSON.stringify(response, null, 2) }
      ];
      
      // If we found issues, add clickable links for each one
      if (issues.length > 0) {
        content.push({ type: 'text', text: '\n' });
        issues.forEach(issue => {
          const issueLink = `[${issue.key}](${issue.url}) `;
          content.push({ type: 'text', text: issueLink });
        });
      }
      
      return { content };
    } catch (error) {
      return { 
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Create a new JIRA issue
server.tool(
  'jira_create_issue',
  { 
    project_key: z.string().optional().describe('The JIRA project key (e.g., FLOP)'),
    summary: z.string().describe('Issue summary (title)'),
    description: z.string().optional().describe('Issue description'),
    issue_type: z.string().optional().default('Task').describe('Issue type (e.g., Bug, Story, Task)'),
    component: z.string().optional().describe('Component name to add to the issue (e.g., "SSO Hosted App")'),
    epic_key: z.string().optional().describe('Epic issue key to link this issue to (e.g., "FLOP-123")')
  },
  async ({ project_key, summary, description = '', issue_type = 'Task', component, epic_key }) => {
    try {
      // Use default project from environment if not provided
      const effectiveProjectKey = project_key || process.env.DEFAULT_JIRA_PROJECT;
      
      if (!effectiveProjectKey) {
        throw new Error('No project key provided and DEFAULT_JIRA_PROJECT not set in environment');
      }
      
      // Check if component is missing - if so, fetch available components and return a helpful error
      if (!component) {
        // Create a direct HTTP request to get components
        const apiBase = process.env.JIRA_BASE_URL;
        const username = process.env.JIRA_EMAIL;
        const password = process.env.JIRA_API_TOKEN;
        
        const apiUrl = `${apiBase}/rest/api/3/project/${effectiveProjectKey}/components`;
        const authToken = Buffer.from(`${username}:${password}`).toString('base64');
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${authToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch components: ${response.status} ${response.statusText}`);
        }
        
        const components = await response.json();
        const componentNames = components.map(c => c.name).join(', ');
        
        throw new Error(`Component is required. Available components for ${effectiveProjectKey}: ${componentNames}`);
      }

      // Convert plain text description to Atlassian Document Format
      const formattedDescription = convertToAtlassianDoc(description);

      // Prepare issue data
      const issueData = {
        fields: {
          project: {
            key: effectiveProjectKey
          },
          summary: summary,
          description: formattedDescription,
          issuetype: {
            name: issue_type
          },
          components: [{ name: component }]
        }
      };

      const newIssue = await jira.addNewIssue(issueData);
      
      // If epic_key is provided, link the new issue to the epic
      if (epic_key) {
        try {
          // Get available link types
          const apiBase = process.env.JIRA_BASE_URL;
          const username = process.env.JIRA_EMAIL;
          const password = process.env.JIRA_API_TOKEN;
          
          const apiUrl = `${apiBase}/rest/api/3/issueLinkType`;
          const authToken = Buffer.from(`${username}:${password}`).toString('base64');
          
          const fetchResponse = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${authToken}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (!fetchResponse.ok) {
            throw new Error(`Failed to fetch link types: ${fetchResponse.status} ${fetchResponse.statusText}`);
          }
          
          const linkTypes = await fetchResponse.json();
          
          // Find a suitable link type for epics (Relates or similar)
          const linkType = linkTypes.issueLinkTypes.find(type => 
            type.name === 'Relates' || type.name === 'relates to' ||
            type.inward === 'relates to' || type.outward === 'relates to'
          );
          
          if (!linkType) {
            throw new Error('Could not find a suitable link type for epic relationship');
          }
          
          // Create the link using the identified type
          await jira.issueLink({
            inwardIssue: {
              key: newIssue.key
            },
            outwardIssue: {
              key: epic_key
            },
            type: {
              name: linkType.name
            }
          });
        } catch (linkError) {
          console.error(`Error linking issue to epic: ${linkError.message}`);
          // Don't fail the whole operation if just the linking fails
          return {
            content: responseWithDirectLink(
              {
                key: newIssue.key,
                id: newIssue.id,
                self: newIssue.self,
                url: `${process.env.JIRA_BASE_URL}/browse/${newIssue.key}`,
                message: `Issue ${newIssue.key} created successfully, but failed to link to epic ${epic_key}: ${linkError.message}`,
                component: component,
                epic_link_error: linkError.message
              }, 
              newIssue.key, 
              'Open newly created issue'
            )
          };
        }
      }
      
      const response = {
        key: newIssue.key,
        id: newIssue.id,
        self: newIssue.self,
        url: `${process.env.JIRA_BASE_URL}/browse/${newIssue.key}`,
        message: `Issue ${newIssue.key} created successfully${epic_key ? ` and linked to epic ${epic_key}` : ''}`,
        component: component,
        epic_key: epic_key
      };
      
      // Use helper function for direct clickable link
      return {
        content: responseWithDirectLink(response, newIssue.key, 'Open newly created issue')
      };
    } catch (error) {
      return { 
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Update a JIRA issue
server.tool(
  'jira_update_issue',
  { 
    issue_key: z.string().describe('The JIRA issue key to update (e.g., FLOP-123)'),
    summary: z.string().optional().describe('New issue summary (title)'),
    description: z.string().optional().describe('New issue description'),
    assignee: z.string().optional().describe('Account ID or email of the user to assign the issue to'),
    status: z.string().optional().describe('Transition the issue to this status (e.g., "In Progress", "Done")'),
    component: z.string().optional().describe('Component name to add to the issue (e.g., "SSO Hosted App")')
  },
  async ({ issue_key, summary, description, assignee, status, component }) => {
    try {
      const updates = {};
      const result = { key: issue_key, updated_fields: [] };
      
      // Update summary if provided
      if (summary) {
        await jira.updateIssue(issue_key, {
          fields: { summary }
        });
        updates.summary = summary;
        result.updated_fields.push('summary');
      }
      
      // Update description if provided
      if (description) {
        // Convert plain text description to Atlassian Document Format
        const formattedDescription = convertToAtlassianDoc(description);

        await jira.updateIssue(issue_key, {
          fields: { 
            description: formattedDescription
          }
        });
        updates.description = description;
        result.updated_fields.push('description');
      }
      
      // Update assignee if provided (can be email or account ID)
      if (assignee) {
        await jira.updateIssue(issue_key, {
          fields: { 
            assignee: { 
              accountId: assignee.includes('@') ? null : assignee,
              emailAddress: assignee.includes('@') ? assignee : null
            } 
          }
        });
        updates.assignee = assignee;
        result.updated_fields.push('assignee');
      }
      
      // Update component if provided
      if (component) {
        await jira.updateIssue(issue_key, {
          fields: { 
            components: [{ name: component }]
          }
        });
        updates.component = component;
        result.updated_fields.push('component');
      }
      
      // Update status if provided (requires transition ID)
      if (status) {
        // Get available transitions
        const transitions = await jira.listTransitions(issue_key);
        const transition = transitions.transitions.find(t => 
          t.name.toLowerCase() === status.toLowerCase() || 
          t.to.name.toLowerCase() === status.toLowerCase()
        );
        
        if (transition) {
          await jira.transitionIssue(issue_key, {
            transition: { id: transition.id }
          });
          updates.status = status;
          result.updated_fields.push('status');
        } else {
          result.status_error = `Status '${status}' is not a valid transition for this issue`;
        }
      }
      
      result.updates = updates;
      result.message = `Issue ${issue_key} updated successfully`;
      result.url = `${process.env.JIRA_BASE_URL}/browse/${issue_key}`;
      
      // Use new helper function for direct clickable link
      return {
        content: responseWithDirectLink(result, issue_key, 'View updated issue')
      };
    } catch (error) {
      return { 
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Link JIRA issues
server.tool(
  'jira_link_issues',
  { 
    inward_issue: z.string().describe('The JIRA issue key that is linked from (e.g., FLOP-123)'),
    outward_issue: z.string().describe('The JIRA issue key that is linked to (e.g., MOB-456)'),
    link_type: z.string().default('Relates').describe('The type of link (e.g., "Relates", "Blocks", "Epic-Story")')
  },
  async ({ inward_issue, outward_issue, link_type = 'Relates' }) => {
    try {
      // First, get available link types
      const apiBase = process.env.JIRA_BASE_URL;
      const username = process.env.JIRA_EMAIL;
      const password = process.env.JIRA_API_TOKEN;
      
      const apiUrl = `${apiBase}/rest/api/3/issueLinkType`;
      const authToken = Buffer.from(`${username}:${password}`).toString('base64');
      
      const fetchResponse = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!fetchResponse.ok) {
        throw new Error(`Failed to fetch link types: ${fetchResponse.status} ${fetchResponse.statusText}`);
      }
      
      const linkTypes = await fetchResponse.json();
      
      // Check if the requested link type exists
      const matchingType = linkTypes.issueLinkTypes.find(type => 
        type.name.toLowerCase() === link_type.toLowerCase() ||
        type.inward.toLowerCase() === link_type.toLowerCase() ||
        type.outward.toLowerCase() === link_type.toLowerCase()
      );
      
      if (!matchingType) {
        const availableTypes = linkTypes.issueLinkTypes.map(type => 
          `"${type.name}" (inward: "${type.inward}", outward: "${type.outward}")`
        ).join(', ');
        
        throw new Error(`Link type "${link_type}" not found. Available types: ${availableTypes}`);
      }
      
      // Create the link using the correct name
      await jira.issueLink({
        inwardIssue: {
          key: inward_issue
        },
        outwardIssue: {
          key: outward_issue
        },
        type: {
          name: matchingType.name
        }
      });
      
      const resultData = {
        inward_issue,
        outward_issue,
        link_type: matchingType.name,
        inward_description: matchingType.inward,
        outward_description: matchingType.outward,
        message: `Issues ${inward_issue} and ${outward_issue} linked successfully with type "${matchingType.name}"`,
        inward_url: `${process.env.JIRA_BASE_URL}/browse/${inward_issue}`,
        outward_url: `${process.env.JIRA_BASE_URL}/browse/${outward_issue}`
      };
      
      // Add clickable links for both issues using our new helper
      return {
        content: responseWithMultipleLinks(resultData, [
          { text: inward_issue, url: resultData.inward_url },
          { text: outward_issue, url: resultData.outward_url }
        ])
      };
    } catch (error) {
      return { 
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Get project components
server.tool(
  'jira_get_project_components',
  { 
    project_key: z.string().describe('The JIRA project key (e.g., IDO)')
  },
  async ({ project_key }) => {
    try {
      // Create a direct HTTP request instead of using the jira client method
      const apiBase = process.env.JIRA_BASE_URL;
      const username = process.env.JIRA_EMAIL;
      const password = process.env.JIRA_API_TOKEN;
      
      const apiUrl = `${apiBase}/rest/api/3/project/${project_key}/components`;
      const authToken = Buffer.from(`${username}:${password}`).toString('base64');
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch components: ${response.status} ${response.statusText}`);
      }
      
      const components = await response.json();
      
      const result = {
        project_key,
        project_url: `${process.env.JIRA_BASE_URL}/projects/${project_key}`,
        components: components.map(component => ({
          id: component.id,
          name: component.name,
          description: component.description || null
        }))
      };
      
      // Include a direct link to the project
      return {
        content: [
          { type: 'text', text: JSON.stringify(result, null, 2) },
          { type: 'text', text: `\n[${project_key}](${result.project_url})` }
        ]
      };
    } catch (error) {
      console.error('Error fetching project components:', error);
      return { 
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Link issue to epic
server.tool(
  'jira_link_to_epic',
  { 
    issue_key: z.string().describe('The JIRA issue key to link (e.g., FLOP-123)'),
    epic_key: z.string().describe('The epic to link to (e.g., FLOP-456)')
  },
  async ({ issue_key, epic_key }) => {
    try {
      // Try multiple approaches to link the issue to the epic
      let success = false;
      let errorMessages = [];
      
      // Approach 1: Try to update the issue with the parent field
      try {
        const apiBase = process.env.JIRA_BASE_URL;
        const username = process.env.JIRA_EMAIL;
        const password = process.env.JIRA_API_TOKEN;
        
        const apiUrl = `${apiBase}/rest/api/3/issue/${issue_key}`;
        const authToken = Buffer.from(`${username}:${password}`).toString('base64');
        
        const parentResponse = await fetch(apiUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Basic ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            update: {
              parent: [{ set: { key: epic_key } }]
            }
          })
        });
        
        if (parentResponse.ok) {
          success = true;
        } else {
          const error = await parentResponse.json();
          errorMessages.push(`Parent field approach failed: ${JSON.stringify(error)}`);
        }
      } catch (e) {
        errorMessages.push(`Parent field error: ${e.message}`);
      }
      
      // Approach 2: Try to find the Epic Link custom field
      if (!success) {
        try {
          // Get field metadata to find customfields
          const apiBase = process.env.JIRA_BASE_URL;
          const username = process.env.JIRA_EMAIL;
          const password = process.env.JIRA_API_TOKEN;
          
          const fieldUrl = `${apiBase}/rest/api/3/field`;
          const authToken = Buffer.from(`${username}:${password}`).toString('base64');
          
          const fieldResponse = await fetch(fieldUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${authToken}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (!fieldResponse.ok) {
            throw new Error(`Failed to get fields: ${fieldResponse.status} ${fieldResponse.statusText}`);
          }
          
          const fields = await fieldResponse.json();
          
          // Look for epic link field
          const epicLinkField = fields.find(field => 
            field.name.toLowerCase().includes('epic') && 
            field.name.toLowerCase().includes('link')
          );
          
          if (epicLinkField) {
            // Try to update the issue with the epic link field
            const epicUpdateUrl = `${apiBase}/rest/api/3/issue/${issue_key}`;
            const updateBody = {
              fields: {}
            };
            updateBody.fields[epicLinkField.id] = epic_key;
            
            const epicUpdateResponse = await fetch(epicUpdateUrl, {
              method: 'PUT',
              headers: {
                'Authorization': `Basic ${authToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(updateBody)
            });
            
            if (epicUpdateResponse.ok) {
              success = true;
            } else {
              const error = await epicUpdateResponse.json();
              errorMessages.push(`Epic Link field approach failed: ${JSON.stringify(error)}`);
            }
          } else {
            errorMessages.push("Epic Link field not found");
          }
        } catch (e) {
          errorMessages.push(`Epic Link field error: ${e.message}`);
        }
      }
      
      // Approach 3: Try to use JIRA API to create an issue link
      if (!success) {
        try {
          // Try to find a suitable link type
          const apiBase = process.env.JIRA_BASE_URL;
          const username = process.env.JIRA_EMAIL;
          const password = process.env.JIRA_API_TOKEN;
          
          const linkTypeUrl = `${apiBase}/rest/api/3/issueLinkType`;
          const authToken = Buffer.from(`${username}:${password}`).toString('base64');
          
          const linkTypeResponse = await fetch(linkTypeUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${authToken}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (!linkTypeResponse.ok) {
            throw new Error(`Failed to get link types: ${linkTypeResponse.status} ${linkTypeResponse.statusText}`);
          }
          
          const linkTypes = await linkTypeResponse.json();
          
          // Look for epic-story relationship or similar
          const epicStoryLink = linkTypes.issueLinkTypes.find(type => 
            type.name.toLowerCase().includes('epic') || 
            type.inward.toLowerCase().includes('epic') ||
            type.outward.toLowerCase().includes('epic')
          ) || linkTypes.issueLinkTypes.find(type => 
            type.name === 'Relates'
          );
          
          if (epicStoryLink) {
            // Create the link
            await jira.issueLink({
              inwardIssue: {
                key: issue_key
              },
              outwardIssue: {
                key: epic_key
              },
              type: {
                name: epicStoryLink.name
              }
            });
            success = true;
          } else {
            errorMessages.push("No suitable link type found");
          }
        } catch (e) {
          errorMessages.push(`Issue link error: ${e.message}`);
        }
      }
      
      // Approach 4: Try to update the issue description with Epic Link tag
      if (!success) {
        try {
          // Get current issue
          const issue = await jira.findIssue(issue_key);
          const currentDescription = issue.fields.description;
          
          // If description is an object (Atlassian Document Format), we need to handle that
          if (typeof currentDescription === 'object') {
            // Try to find an Epic section
            let hasEpicSection = false;
            let epicLinkAdded = false;
            
            // Create a copy of the content to modify
            const newContent = [...currentDescription.content];
            
            // Check if there's an 'Epic' heading
            for (let i = 0; i < newContent.length; i++) {
              const item = newContent[i];
              
              // Check if it's a heading with text 'Epic'
              if (item.type === 'heading' && 
                  item.content && 
                  item.content.length > 0 && 
                  item.content[0].type === 'text' && 
                  item.content[0].text.toLowerCase().includes('epic')) {
                
                hasEpicSection = true;
                
                // Look for the epic-link tag in the following paragraphs
                for (let j = i + 1; j < newContent.length; j++) {
                  const nextItem = newContent[j];
                  
                  // If we hit another heading, stop looking
                  if (nextItem.type === 'heading') {
                    break;
                  }
                  
                  // If it's a paragraph with the epic-link tag, update it
                  if (nextItem.type === 'paragraph' && 
                      nextItem.content && 
                      nextItem.content.length > 0 && 
                      nextItem.content[0].type === 'text' && 
                      nextItem.content[0].text.includes('{epic-link:')) {
                    
                    // Update the text to point to the new epic
                    nextItem.content[0].text = `{epic-link:${epic_key}}`;
                    epicLinkAdded = true;
                    break;
                  }
                }
                
                // If we found the Epic section but no epic-link tag, add it
                if (!epicLinkAdded) {
                  newContent.splice(i + 1, 0, {
                    type: 'paragraph',
                    content: [{
                      type: 'text',
                      text: `{epic-link:${epic_key}}`
                    }]
                  });
                  epicLinkAdded = true;
                }
                
                break;
              }
            }
            
            // If there's no Epic section, add it at the end
            if (!hasEpicSection) {
              newContent.push({
                type: 'heading',
                attrs: { level: 2 },
                content: [{
                  type: 'text',
                  text: 'Epic'
                }]
              });
              
              newContent.push({
                type: 'paragraph',
                content: [{
                  type: 'text',
                  text: `{epic-link:${epic_key}}`
                }]
              });
              
              epicLinkAdded = true;
            }
            
            if (epicLinkAdded) {
              // Update the issue with the new description
              await jira.updateIssue(issue_key, {
                fields: { 
                  description: {
                    ...currentDescription,
                    content: newContent
                  }
                }
              });
              success = true;
            }
          } else if (typeof currentDescription === 'string') {
            // Plain text description - easier to handle
            let newDescription = currentDescription;
            
            // Check if there's an Epic section
            const epicSectionMatch = /h[123]\.\s*Epic/i.exec(newDescription);
            
            if (epicSectionMatch) {
              // Check if there's an epic-link tag
              const epicLinkMatch = /{epic-link:[^}]+}/i.exec(newDescription);
              
              if (epicLinkMatch) {
                // Replace the existing epic-link tag
                newDescription = newDescription.replace(epicLinkMatch[0], `{epic-link:${epic_key}}`);
              } else {
                // Add the epic-link tag after the Epic heading
                const epicHeadingEnd = epicSectionMatch.index + epicSectionMatch[0].length;
                newDescription = newDescription.substring(0, epicHeadingEnd) + 
                               `\n\n{epic-link:${epic_key}}` + 
                               newDescription.substring(epicHeadingEnd);
              }
            } else {
              // Add an Epic section at the end
              newDescription += `\n\nh2. Epic\n\n{epic-link:${epic_key}}`;
            }
            
            // Update the issue with the new description
            await jira.updateIssue(issue_key, {
              fields: { 
                description: newDescription
              }
            });
            success = true;
          }
        } catch (e) {
          errorMessages.push(`Description update error: ${e.message}`);
        }
      }
      
      if (success) {
        const response = {
          issue_key,
          epic_key,
          message: `Issue ${issue_key} linked to epic ${epic_key} successfully`,
          issue_url: `${process.env.JIRA_BASE_URL}/browse/${issue_key}`,
          epic_url: `${process.env.JIRA_BASE_URL}/browse/${epic_key}`
        };
        
        // Add clickable links for both issues
        return {
          content: responseWithMultipleLinks(response, [
            { text: issue_key, url: response.issue_url },
            { text: epic_key, url: response.epic_url }
          ])
        };
      } else {
        // If all approaches failed, return the error messages
        return { 
          content: [{ 
            type: 'text', 
            text: `Error linking issue ${issue_key} to epic ${epic_key}. Tried multiple approaches but all failed with errors:\n${errorMessages.join('\n')}` 
          }],
          isError: true
        };
      }
    } catch (error) {
      return { 
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Log to stderr, not stdout
debug('JIRA MCP server starting up...');

// Start the MCP server with stdio transport
// The HttpServerTransport isn't available in the current version of the SDK
// In the future, when it becomes available, we can update this
const transport = new StdioServerTransport();
debug('Starting MCP server with stdio transport');
await server.connect(transport);