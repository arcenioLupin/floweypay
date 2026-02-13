export function otpEmailTemplate(params: { code: string; minutesValid: number }) {
  const { code, minutesValid } = params;

  const subject = `Tu código de acceso FloweyPay: ${code}`;
  const text = `Tu código FloweyPay es: ${code}. Válido por ${minutesValid} minutos.`;

  const html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.4;">
    <h2>Tu código de acceso</h2>
    <p>Usa este código para iniciar sesión:</p>
    <div style="font-size: 28px; font-weight: bold; letter-spacing: 3px; margin: 16px 0;">${code}</div>
    <p>Este código expira en <b>${minutesValid} minutos</b>.</p>
    <p style="color:#666; font-size: 12px;">Si no solicitaste este código, ignora este mensaje.</p>
  </div>
  `;

  return { subject, text, html };
}
