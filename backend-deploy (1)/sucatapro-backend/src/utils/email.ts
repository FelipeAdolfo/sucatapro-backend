import nodemailer from 'nodemailer';

// Email configuration
const transporter = nodemailer.createTransporter({
  service: 'SendGrid',
  auth: {
    user: 'apikey',
    pass: process.env.SENDGRID_API_KEY || '',
  },
});

// Fallback to SMTP if SendGrid not configured
const getTransporter = () => {
  if (process.env.SENDGRID_API_KEY) {
    return nodemailer.createTransporter({
      service: 'SendGrid',
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY,
      },
    });
  }
  
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  
  // Development: log emails instead of sending
  return {
    sendMail: async (options: any) => {
      console.log('📧 Email (development mode):');
      console.log('To:', options.to);
      console.log('Subject:', options.subject);
      console.log('---');
      return { messageId: 'dev-mode' };
    },
  } as any;
};

const emailFrom = {
  name: process.env.EMAIL_FROM_NAME || 'SucataPro',
  address: process.env.EMAIL_FROM || 'noreply@sucalog.com.br',
};

// Email templates
export const emailTemplates = {
  // Password reset email
  passwordReset: (code: string, name: string) => ({
    subject: 'SucataPro - Recuperação de Senha',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
          .header { background: #059669; padding: 30px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .code { background: #f0fdf4; border: 2px dashed #059669; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #059669; margin: 20px 0; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>♻️ SucataPro</h1>
          </div>
          <div class="content">
            <h2>Olá, ${name}!</h2>
            <p>Recebemos uma solicitação para recuperar sua senha. Use o código abaixo:</p>
            <div class="code">${code}</div>
            <p>Este código expira em <strong>30 minutos</strong>.</p>
            <p>Se você não solicitou esta recuperação, ignore este email.</p>
          </div>
          <div class="footer">
            <p>SucataPro - Sistema de Gestão de Compras de Sucata</p>
            <p>© 2024 Sucalog. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Olá ${name}!\n\nSeu código de recuperação de senha é: ${code}\n\nEste código expira em 30 minutos.\n\nSe você não solicitou esta recuperação, ignore este email.\n\nSucataPro - Sucalog`,
  }),

  // Access code email
  accessCode: (code: string, name: string, role: string) => ({
    subject: 'SucataPro - Seu Código de Acesso',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
          .header { background: #059669; padding: 30px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .welcome { background: #f0fdf4; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .code { background: #059669; color: white; padding: 20px; text-align: center; font-size: 36px; font-weight: bold; letter-spacing: 8px; border-radius: 8px; margin: 20px 0; }
          .steps { background: #f9fafb; padding: 20px; border-radius: 8px; }
          .steps ol { margin: 0; padding-left: 20px; }
          .steps li { margin: 10px 0; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>♻️ SucataPro</h1>
          </div>
          <div class="content">
            <div class="welcome">
              <h2>Bem-vindo, ${name}! 🎉</h2>
              <p>Você foi convidado para fazer parte do time SucataPro como <strong>${role}</strong>.</p>
            </div>
            <p>Seu código de acesso é:</p>
            <div class="code">${code}</div>
            <div class="steps">
              <h3>Como acessar:</h3>
              <ol>
                <li>Acesse: <a href="https://lzbcotyfc2tzw.ok.kimi.link">https://lzbcotyfc2tzw.ok.kimi.link</a></li>
                <li>Clique em "Acesso Interno"</li>
                <li>Informe seu email</li>
                <li>Use o código acima no primeiro acesso</li>
              </ol>
            </div>
            <p>Este código é válido por <strong>7 dias</strong>.</p>
          </div>
          <div class="footer">
            <p>SucataPro - Sistema de Gestão de Compras de Sucata</p>
            <p>© 2024 Sucalog. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Bem-vindo ${name}!\n\nVocê foi convidado para o SucataPro como ${role}.\n\nSeu código de acesso: ${code}\n\nComo acessar:\n1. Acesse: https://lzbcotyfc2tzw.ok.kimi.link\n2. Clique em "Acesso Interno"\n3. Informe seu email\n4. Use o código acima no primeiro acesso\n\nCódigo válido por 7 dias.\n\nSucataPro - Sucalog`,
  }),

  // Application received
  applicationReceived: (name: string) => ({
    subject: 'SucataPro - Candidatura Recebida',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
          .header { background: #059669; padding: 30px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>♻️ SucataPro</h1>
          </div>
          <div class="content">
            <h2>Olá, ${name}!</h2>
            <p>Recebemos sua candidatura com sucesso!</p>
            <p>Nossa equipe vai analisar seu perfil e entraremos em contato em até <strong>48 horas</strong>.</p>
            <p>Obrigado pelo interesse em fazer parte do time Sucalog!</p>
          </div>
          <div class="footer">
            <p>SucataPro - Sistema de Gestão de Compras de Sucata</p>
            <p>© 2024 Sucalog. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Olá ${name}!\n\nRecebemos sua candidatura com sucesso!\n\nNossa equipe vai analisar seu perfil e entraremos em contato em até 48 horas.\n\nObrigado pelo interesse em fazer parte do time Sucalog!\n\nSucataPro - Sucalog`,
  }),
};

// Send email function
export const sendEmail = async (to: string, template: { subject: string; html: string; text: string }) => {
  try {
    const mailer = getTransporter();
    
    const result = await mailer.sendMail({
      from: emailFrom,
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
    
    console.log(`📧 Email enviado para ${to}: ${result.messageId}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Erro ao enviar email:', error);
    return { success: false, error };
  }
};

export default {
  sendEmail,
  templates: emailTemplates,
};
