export interface WhatsAppTextMessage {
  messaging_product: 'whatsapp';
  to: string;
  type: 'text';
  text: { body: string };
}

export interface WhatsAppImageMessage {
  messaging_product: 'whatsapp';
  to: string;
  type: 'image';
  image: { id: string; caption?: string };
}
