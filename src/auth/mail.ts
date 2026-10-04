export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export function sendMail(message: MailMessage): void {
  console.log(`[mail stub] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`);
}
