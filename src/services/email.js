const { env } = require('../config/env');

async function sendWithdrawalOtp(email, code) {
  if (!env.email.resendApiKey || !env.email.from) {
    const error = new Error('Email delivery is not configured');
    error.status = 503;
    throw error;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.email.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.email.from,
      to: [email],
      subject: 'Kode OTP penarikan dana LoakinAja',
      text: `Kode OTP untuk mengonfirmasi penarikan dana Anda adalah ${code}. Kode berlaku selama 10 menit. Jangan bagikan kode ini kepada siapa pun. Jika Anda tidak meminta penarikan, abaikan email ini.`,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const error = new Error('Email OTP tidak dapat dikirim. Silakan coba lagi.');
    error.status = 502;
    throw error;
  }
}

module.exports = { sendWithdrawalOtp };
