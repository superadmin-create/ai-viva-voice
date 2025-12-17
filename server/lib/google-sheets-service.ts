// Reference: google-sheet integration
import { google } from 'googleapis';
import type { VivaResult } from '@shared/schema';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Sheet not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
async function getUncachableGoogleSheetClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || '';

export async function syncVivaResultToSheet(result: VivaResult): Promise<void> {
  if (!SPREADSHEET_ID) {
    console.warn('GOOGLE_SHEET_ID not set, skipping Google Sheets sync');
    return;
  }

  try {
    const sheets = await getUncachableGoogleSheetClient();

    // Check if the sheet exists, if not create headers
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Viva Results!A1:A1',
      });

      // If sheet doesn't have headers, add them
      if (!response.data.values || response.data.values.length === 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: 'Viva Results!A1:M1',
          valueInputOption: 'RAW',
          requestBody: {
            values: [[
              'ID',
              'Student Name',
              'Email',
              'Phone',
              'Subject',
              'Score',
              'Max Score',
              'Percentage',
              'Date',
              'Status',
              'Questions',
              'Answers',
              'Feedback'
            ]]
          }
        });
      }
    } catch (error) {
      // Sheet might not exist, headers will be added in the append call
      console.log('Sheet not found or empty, will create headers');
    }

    // Prepare the row data
    const percentage = ((result.score / result.maxScore) * 100).toFixed(2);
    const questions = result.transcript.map(t => t.question).join(' | ');
    const answers = result.transcript.map(t => t.answer).join(' | ');
    const feedbacks = result.transcript.map(t => t.feedback).join(' | ');

    const rowData = [
      result.id.toString(),
      result.studentName,
      result.studentEmail,
      result.studentPhone,
      result.subject,
      result.score.toString(),
      result.maxScore.toString(),
      `${percentage}%`,
      new Date(result.timestamp).toLocaleString(),
      result.status,
      questions,
      answers,
      feedbacks
    ];

    // Append the data to the sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Viva Results!A:M',
      valueInputOption: 'RAW',
      requestBody: {
        values: [rowData]
      }
    });

    console.log(`Successfully synced viva result ${result.id} to Google Sheets`);
  } catch (error: any) {
    console.error('Error syncing to Google Sheets:', error.message);
    throw error;
  }
}

export async function createVivaResultsSheet(): Promise<string> {
  try {
    const sheets = await getUncachableGoogleSheetClient();

    // Create a new spreadsheet
    const response = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: 'AI Viva Results'
        },
        sheets: [{
          properties: {
            title: 'Viva Results'
          }
        }]
      }
    });

    const spreadsheetId = response.data.spreadsheetId;
    
    if (!spreadsheetId) {
      throw new Error('Failed to create spreadsheet');
    }

    // Add headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Viva Results!A1:M1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'ID',
          'Student Name',
          'Email',
          'Phone',
          'Subject',
          'Score',
          'Max Score',
          'Percentage',
          'Date',
          'Status',
          'Questions',
          'Answers',
          'Feedback'
        ]]
      }
    });

    console.log(`Created new spreadsheet with ID: ${spreadsheetId}`);
    console.log(`Set GOOGLE_SHEET_ID environment variable to: ${spreadsheetId}`);
    
    return spreadsheetId;
  } catch (error: any) {
    console.error('Error creating spreadsheet:', error.message);
    throw error;
  }
}
