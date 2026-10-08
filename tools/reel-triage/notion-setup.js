/**
 * One-time setup: create the "Saved Video Triage" Notion database with the exact
 * property names and types triage.js expects.
 *
 *   NOTION_API_KEY=... NOTION_PARENT_PAGE_ID=... node notion-setup.js
 *
 * Prints the new database id to set as NOTION_TRIAGE_DB_ID.
 */

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID;

const PROPERTIES = {
  Name: { title: {} },
  URL: { url: {} },
  Status: {
    select: {
      options: [
        { name: 'New', color: 'blue' },
        { name: 'Triaged', color: 'green' },
        { name: 'Failed', color: 'red' }
      ]
    }
  },
  Verdict: {
    select: {
      options: [
        { name: 'Pursue', color: 'green' },
        { name: 'Maybe', color: 'yellow' },
        { name: 'Skip', color: 'gray' }
      ]
    }
  },
  Rating: { number: { format: 'number' } },
  Creator: { rich_text: {} },
  Summary: { rich_text: {} },
  Topics: { multi_select: { options: [] } },
  'Use For': { multi_select: { options: [] } },
  'My Note': { rich_text: {} },
  Duration: { number: { format: 'number' } },
  Error: { rich_text: {} }
};

async function main() {
  if (!NOTION_API_KEY) throw new Error('NOTION_API_KEY is not set');
  if (!NOTION_PARENT_PAGE_ID) {
    throw new Error('NOTION_PARENT_PAGE_ID is not set (the page the database is created inside)');
  }

  const res = await fetch('https://api.notion.com/v1/databases', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + NOTION_API_KEY,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: NOTION_PARENT_PAGE_ID },
      title: [{ type: 'text', text: { content: 'Saved Video Triage' } }],
      properties: PROPERTIES
    })
  });

  const body = await res.json();
  if (!res.ok) throw new Error('Notion ' + res.status + ': ' + (body.message || JSON.stringify(body)));

  console.log('Created database: ' + body.id);
  console.log('Set this as NOTION_TRIAGE_DB_ID (repo secret and local env).');
  console.log('URL: ' + body.url);
}

main().catch(function (err) {
  console.error(err.message);
  process.exit(1);
});
