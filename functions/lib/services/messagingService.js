"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyAdmin = exports.sendContactMessage = exports.sendDeliveredMessage = exports.sendDeliveryMessage = exports.sendConfirmationMessage = exports.sendWelcomeMessage = exports.sendMessageWithOptionalAudio = exports.sendMessage = void 0;
exports.delay = delay;
exports.sendWaitingMessage = sendWaitingMessage;
const axios_1 = __importDefault(require("axios"));
const axios_2 = require("axios");
const google_maps_services_js_1 = require("@googlemaps/google-maps-services-js");
const storeController_1 = require("../controllers/storeController");
const textToSpeechService_1 = require("./textToSpeechService");
const client = new google_maps_services_js_1.Client({});
const ADMIN_PHONE_NUMBER = process.env.ADMIN_PHONE_NUMBER || '+5511910970283'; // Substitua pelo número do administrador
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
const sendMessage = async (data, wabaEnvironments) => {
    console.log('<><><><><><><><><><><>><><><><><><>', JSON.stringify(data));
    const url = `https://graph.facebook.com/${process.env.WABA_VERSION}/${wabaEnvironments.wabaPhoneNumberId}/messages`;
    console.log('wabaEnvironments', wabaEnvironments);
    // Criar os cabeçalhos corretamente
    const headers = new axios_2.AxiosHeaders();
    headers.set('Authorization', `Bearer ${wabaEnvironments.wabaAccessToken}`);
    headers.set('Content-Type', 'application/json');
    console.log('Enviando mensagem para o WABA...', JSON.stringify(data));
    try {
        const response = await axios_1.default.post(url, data, { headers });
        return response.data;
    }
    catch (e) {
        console.log('ERROR sendMessage', e);
        return null;
    }
};
exports.sendMessage = sendMessage;
/**
 * Envia mensagem de texto com opção de áudio para acessibilidade
 * @param data Dados da mensagem (deve conter type: 'text' e text.body)
 * @param wabaEnvironments Configurações do WABA
 * @param includeAudio Se deve incluir versão em áudio (padrão: false para não sobrecarregar)
 */
const sendMessageWithOptionalAudio = async (data, wabaEnvironments, includeAudio = false) => {
    // Se for mensagem de texto e áudio foi solicitado, usar função especial
    if (data.type === 'text' && includeAudio && data.text?.body) {
        try {
            await (0, textToSpeechService_1.sendMessageWithAudio)(data.to, data.text.body, wabaEnvironments, true);
            return { success: true, withAudio: true };
        }
        catch (error) {
            console.error('Erro ao enviar com áudio, fallback para texto:', error);
            // Fallback para mensagem normal se áudio falhar
            return await (0, exports.sendMessage)(data, wabaEnvironments);
        }
    }
    // Para outros tipos de mensagem ou quando áudio não é solicitado
    return await (0, exports.sendMessage)(data, wabaEnvironments);
};
exports.sendMessageWithOptionalAudio = sendMessageWithOptionalAudio;
const sendWelcomeMessage = async (phoneNumber, flowToken, wabaEnvironments, store, imageUrl) => {
    try {
        await (0, exports.sendMessage)({
            recipient_type: 'individual',
            messaging_product: 'whatsapp',
            to: '+' + phoneNumber,
            type: 'interactive',
            interactive: {
                type: 'flow',
                header: imageUrl
                    ? {
                        type: 'image',
                        image: {
                            link: imageUrl,
                        },
                    }
                    : {
                        type: 'text',
                        text: store.name,
                    },
                body: {
                    text: `Olá! Bem-vindo(a) à ${store.name}!\n\nEsse canal é exclusivo para compras pelo WhatsApp. Faça seu pedido de forma rápida e prática através do nosso cardápio digital.`,
                },
                footer: {
                    text: 'Agradecemos a preferência!',
                },
                action: {
                    name: 'flow',
                    parameters: {
                        flow_message_version: '3',
                        flow_id: store.flowId,
                        flow_token: flowToken,
                        flow_cta: 'Peça Agora',
                    },
                },
            },
        }, wabaEnvironments);
        // Deletar a imagem do WABA após o envio, se ela foi salva
        // if (imageId) {
        //   await deleteImageFromWABA(imageId, wabaEnvironments);
        // }
    }
    catch (error) {
        (0, exports.notifyAdmin)('Erro ao enviar mensagem de boas-vindas:', error.response?.data || error.message);
        throw new Error(error.response?.data || error.message);
    }
};
exports.sendWelcomeMessage = sendWelcomeMessage;
const sendConfirmationMessage = async (phoneNumber, wabaEnvironments) => {
    // console.log('Enviando mensagem para informacao da confirmacao...');
    // console.log('Número de telefone:', phoneNumber);
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
            body: 'Seu pedido foi confirmado e está sendo preparado para a entrega.'
        }
    };
    await (0, exports.sendMessage)(messagePayload, wabaEnvironments);
};
exports.sendConfirmationMessage = sendConfirmationMessage;
const sendDeliveryMessage = async (phoneNumber, wabaEnvironments) => {
    // console.log('Enviando mensagem para informacao da confirmacao...');
    // console.log('Número de telefone:', phoneNumber);
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
            body: 'Seu pedido saiu para a entrega e está indo até você.'
        }
    };
    await (0, exports.sendMessage)(messagePayload, wabaEnvironments);
};
exports.sendDeliveryMessage = sendDeliveryMessage;
const sendDeliveredMessage = async (phoneNumber, wabaEnvironments, orderNumber, deliveryOption) => {
    const body = deliveryOption === 'DELIVERY' ? `Seu pedido ${orderNumber} foi entregue. Obrigado pela confiança, estamos à disposição!` : `Seu pedido ${orderNumber} está disponivel para retirada na loja. Obrigado pela confiança, estamos à disposição!`;
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
            body
        }
    };
    await (0, exports.sendMessage)(messagePayload, wabaEnvironments);
};
exports.sendDeliveredMessage = sendDeliveredMessage;
const sendContactMessage = async (from, storeSlug, wabaEnvironments) => {
    if (!storeSlug) {
        // TODO: handle
        // If store is not found, we need to handle this case
        (0, exports.notifyAdmin)('Store parameter is missing');
        throw new Error('Parâmetro da loja não encontrado.');
    }
    1;
    const store = await (0, storeController_1.getStore)(storeSlug);
    // assegurar que o numero de telefone contenha o simbolo de +
    if (!from.startsWith('+')) {
        from = '+' + from;
    }
    // Enviar uma mensagem de contato para o usuário
    await (0, exports.sendMessage)({
        messaging_product: 'whatsapp',
        to: from,
        type: 'contacts',
        contacts: [
            {
                name: {
                    formatted_name: "Loja ACME",
                    first_name: "Loja",
                    last_name: "ACME"
                },
                phones: [
                    {
                        phone: "+5514997113606", // Número da loja
                        type: "CELL"
                    }
                ],
                org: {
                    company: "Loja ACME",
                    title: "Atendimento ao Cliente"
                },
                addresses: [
                    {
                        street: "Rua das Flores, 123",
                        city: "São Paulo",
                        state: "SP",
                        zip: "01000-000",
                        country: "Brasil",
                        country_code: "BR",
                        type: "WORK"
                    }
                ],
                emails: [
                    {
                        email: "contato@lojaacme.com",
                        type: "WORK"
                    }
                ],
                urls: [
                    {
                        url: `https://talkcommerce-2c6e6.firebaseapp.com/${store?.slug}`,
                        type: "WORK"
                    }
                ]
            }
        ]
    }, wabaEnvironments);
};
exports.sendContactMessage = sendContactMessage;
const notifyAdmin = async (errorMessage, additionalInfo) => {
    try {
        console.error('Notificando administrador:', errorMessage, additionalInfo);
        const messageBody = `⚠️ *Erro no Sistema* ⚠️\n\n${errorMessage}\n\n` +
            (additionalInfo ? `Detalhes: ${JSON.stringify(additionalInfo, null, 2)}` : '');
        // await sendMessage({
        //   messaging_product: 'whatsapp',
        //   to: ADMIN_PHONE_NUMBER,
        //   type: 'text',
        //   text: {
        //     body: messageBody,
        //   },
        // });
        console.error('Erro notificado ao administrador:', errorMessage, additionalInfo);
        console.log('Mensagem de erro enviada ao administrador.');
    }
    catch (error) {
        (0, exports.notifyAdmin)('Erro ao enviar mensagem ao administrador:', error);
    }
};
exports.notifyAdmin = notifyAdmin;
function sendWaitingMessage(from, store, wabaEnvironments) {
    return (0, exports.sendMessage)({
        messaging_product: 'whatsapp',
        to: from,
        type: 'text',
        text: {
            body: `Processando, por favor, aguarde...`
        }
    }, wabaEnvironments);
}
