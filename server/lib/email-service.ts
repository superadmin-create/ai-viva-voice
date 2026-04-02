import nodemailer from "nodemailer";
import { randomInt } from "crypto";

const SMTP_FROM = "superadmin@leapup.in";

function createTransporter() {
  const pass = (process.env.SMTP_PASSWORD || "").replace(/\s+/g, "");
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: SMTP_FROM,
      pass,
    },
  });
}

const otpStore = new Map<
  string,
  { otp: string; expiresAt: number; attempts: number }
>();
const sendCooldown = new Map<string, number>();

export function generateOTP(): string {
  return randomInt(100000, 999999).toString();
}

export async function sendOTP(
  email: string
): Promise<{ success: boolean; error?: string }> {
  const key = email.toLowerCase();

  const lastSent = sendCooldown.get(key);
  if (lastSent && Date.now() - lastSent < 30000) {
    return {
      success: false,
      error: "Please wait 30 seconds before requesting a new OTP",
    };
  }

  const otp = generateOTP();
  otpStore.set(key, {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000,
    attempts: 0,
  });
  sendCooldown.set(key, Date.now());

  try {
    const transporter = createTransporter();

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

    await transporter.sendMail({
      from: `"AI Mock Viva" <${SMTP_FROM}>`,
      to: email,
      subject: "Your OTP for AI Mock Viva Examination",
      html: htmlBody,
    });

    console.log(`[Email] OTP sent via SMTP to ${email}`);
    return { success: true };
  } catch (error: any) {
    console.error("[Email] Failed to send OTP:", error.message);
    return { success: false, error: "Failed to send email. Please try again." };
  }
}

export function verifyOTP(
  email: string,
  otp: string
): { valid: boolean; error?: string } {
  const key = email.toLowerCase();
  const entry = otpStore.get(key);
  if (!entry)
    return { valid: false, error: "No OTP found. Please request a new one." };

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return {
      valid: false,
      error: "OTP has expired. Please request a new one.",
    };
  }

  if (entry.attempts >= 5) {
    otpStore.delete(key);
    return {
      valid: false,
      error: "Too many failed attempts. Please request a new OTP.",
    };
  }

  if (entry.otp === otp) {
    otpStore.delete(key);
    return { valid: true };
  }

  entry.attempts++;
  return { valid: false, error: "Invalid OTP. Please try again." };
}
