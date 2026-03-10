// Reference: google-mail integration
import { google } from "googleapis";
import { randomInt } from "crypto";

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error("X-Replit-Token not found for repl/depl");
  }

  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-mail",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    }
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error("Gmail not connected");
  }
  return accessToken;
}

async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

const otpStore = new Map<string, { otp: string; expiresAt: number; attempts: number }>();
const sendCooldown = new Map<string, number>();

export function generateOTP(): string {
  return randomInt(100000, 999999).toString();
}

function buildMimeMessage(to: string, subject: string, htmlBody: string): string {
  const lines = [
    `To: ${to}`,
    `From: "AI Mock Viva" <me>`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    htmlBody,
  ];
  return lines.join("\r\n");
}

export async function sendOTP(email: string): Promise<{ success: boolean; error?: string }> {
  const key = email.toLowerCase();

  const lastSent = sendCooldown.get(key);
  if (lastSent && Date.now() - lastSent < 30000) {
    return { success: false, error: "Please wait 30 seconds before requesting a new OTP" };
  }

  const otp = generateOTP();
  otpStore.set(key, {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000,
    attempts: 0,
  });
  sendCooldown.set(key, Date.now());

  try {
    const gmail = await getUncachableGmailClient();

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #7c3aed; margin-bottom: 16px;">AI Mock Viva - Email Verification</h2>
        <p>Your One-Time Password (OTP) for the examination is:</p>
        <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #7c3aed;">${otp}</span>
        </div>
        <p style="color: #6b7280; font-size: 14px;">This OTP is valid for 5 minutes. Do not share it with anyone.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">This email was sent by AI Mock Viva platform. If you did not request this, please ignore it.</p>
      </div>
    `;

    const rawMessage = buildMimeMessage(email, "Your OTP for AI Mock Viva Examination", htmlBody);
    const encodedMessage = Buffer.from(rawMessage)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to send OTP email:", error);
    return { success: false, error: "Failed to send email. Please try again." };
  }
}

export function verifyOTP(email: string, otp: string): { valid: boolean; error?: string } {
  const key = email.toLowerCase();
  const entry = otpStore.get(key);
  if (!entry) return { valid: false, error: "No OTP found. Please request a new one." };

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return { valid: false, error: "OTP has expired. Please request a new one." };
  }

  if (entry.attempts >= 5) {
    otpStore.delete(key);
    return { valid: false, error: "Too many failed attempts. Please request a new OTP." };
  }

  if (entry.otp === otp) {
    otpStore.delete(key);
    return { valid: true };
  }

  entry.attempts++;
  return { valid: false, error: "Invalid OTP. Please try again." };
}
