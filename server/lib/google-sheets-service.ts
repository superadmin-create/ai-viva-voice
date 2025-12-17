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

async function getUncachableGoogleSheetClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

async function getGoogleDriveClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

// Sheet name where all viva results are stored
export const VIVA_RESULTS_SHEET_NAME = "Viva Results";

// Get or create the viva results spreadsheet
async function getOrCreateSpreadsheet(): Promise<string> {
  const sheets = await getUncachableGoogleSheetClient();
  const drive = await getGoogleDriveClient();
  
  // Search for existing spreadsheet named "AI Viva Results"
  const searchResponse = await drive.files.list({
    q: "name='AI Viva Results' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: 'files(id, name)',
    spaces: 'drive'
  });

  if (searchResponse.data.files && searchResponse.data.files.length > 0) {
    const spreadsheetId = searchResponse.data.files[0].id!;
    console.log(`Found existing spreadsheet: ${spreadsheetId}`);
    return spreadsheetId;
  }

  // Create new spreadsheet
  const createResponse = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: 'AI Viva Results'
      },
      sheets: [{
        properties: {
          title: VIVA_RESULTS_SHEET_NAME
        }
      }]
    }
  });

  const spreadsheetId = createResponse.data.spreadsheetId!;
  console.log(`Created new spreadsheet: ${spreadsheetId}`);

  // Add headers
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${VIVA_RESULTS_SHEET_NAME}!A1:P1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        'ID',
        'Date & Time',
        'Student Name',
        'Email',
        'Phone',
        'Subject',
        'Total Score',
        'Max Score',
        'Percentage',
        'Grade',
        'Status',
        'Q1', 'A1', 'F1', 'S1',
        'Q2', 'A2', 'F2', 'S2',
        'Q3', 'A3', 'F3', 'S3',
        'Q4', 'A4', 'F4', 'S4',
        'Q5', 'A5', 'F5', 'S5'
      ]]
    }
  });

  return spreadsheetId;
}

function calculateGrade(percentage: number): string {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 60) return 'C';
  if (percentage >= 50) return 'D';
  return 'F';
}

export async function syncVivaResultToSheet(result: VivaResult): Promise<void> {
  try {
    const spreadsheetId = await getOrCreateSpreadsheet();
    const sheets = await getUncachableGoogleSheetClient();

    const percentage = (result.score / result.maxScore) * 100;
    const grade = calculateGrade(percentage);

    // Build row with Q&A pairs
    const rowData: (string | number)[] = [
      result.id.toString(),
      new Date(result.timestamp).toLocaleString(),
      result.studentName,
      result.studentEmail,
      result.studentPhone,
      result.subject,
      result.score,
      result.maxScore,
      `${percentage.toFixed(1)}%`,
      grade,
      result.status
    ];

    // Add Q&A pairs (up to 5 questions)
    for (let i = 0; i < 5; i++) {
      if (result.transcript[i]) {
        const t = result.transcript[i];
        rowData.push(t.question, t.answer, t.feedback, t.score.toString());
      } else {
        rowData.push('', '', '', '');
      }
    }

    // Append the row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${VIVA_RESULTS_SHEET_NAME}!A:Z`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [rowData]
      }
    });

    console.log(`Synced viva result ${result.id} to Google Sheet: AI Viva Results`);
  } catch (error: any) {
    console.error('Error syncing to Google Sheets:', error.message);
    throw error;
  }
}
