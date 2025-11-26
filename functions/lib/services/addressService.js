"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasStreetNumber = exports.sendAddressListResponse = exports.sendWaitForGoogleResponse = exports.sendNewAddressMessage = exports.sendAddressConfirmation = void 0;
exports.processGooglePredictions = processGooglePredictions;
exports.handleNewAddressFlow = handleNewAddressFlow;
exports.handleUseAddress = handleUseAddress;
exports.handleInformOtherAddress = handleInformOtherAddress;
const google_maps_services_js_1 = require("@googlemaps/google-maps-services-js");
const messagingService_1 = require("./messagingService");
const conversationController_1 = require("../controllers/conversationController");
const catalogService_1 = require("./catalogService");
const client = new google_maps_services_js_1.Client({});
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const sendAddressConfirmation = async (phoneNumber, name, address, wabaEnvironments) => {
    // console.log('Enviando mensagem para confirmacao do endereco...');
    // console.log('Número de telefone:', phoneNumber);
    // console.log('Endereco:', address);
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: '+' + phoneNumber,
        type: 'interactive',
        interactive: {
            type: 'button',
            body: {
                text: `Olá ${name}, o endereço ${address} está correto?`
            },
            action: {
                buttons: [
                    {
                        type: 'reply',
                        reply: {
                            id: 'current_address',
                            title: 'Usar este endereço'
                        }
                    },
                    {
                        type: 'reply',
                        reply: {
                            id: 'inform_other_address',
                            title: 'Informar outro'
                        }
                    },
                ]
            }
        }
    };
    try {
        await (0, messagingService_1.sendMessage)(messagePayload, wabaEnvironments);
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao enviar mensagem:', error.response?.data || error.message);
        // TODO: handle error
        throw (error);
    }
};
exports.sendAddressConfirmation = sendAddressConfirmation;
const sendNewAddressMessage = async (phoneNumber, wabaEnvironments) => {
    // console.log('Enviando mensagem para informacao do novo endereco...');
    // console.log('Número de telefone:', phoneNumber);
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: '+' + phoneNumber,
        type: 'text',
        text: {
            body: 'Por favor, informe seu endereço completo de entrega.'
        }
    };
    await (0, messagingService_1.sendMessage)(messagePayload, wabaEnvironments);
};
exports.sendNewAddressMessage = sendNewAddressMessage;
const sendWaitForGoogleResponse = async (phoneNumber, wabaEnvironments) => {
    // console.log('Enviando mensagem para informacao para aguardar pesquisa endereco ...');
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: '+' + phoneNumber,
        type: 'text',
        text: {
            body: 'Efetuando a pesquisa do endereço...'
        }
    };
    // console.log('Número de telefone:', phoneNumber);
    // console.log('Payload da mensagem:', messagePayload);
    await (0, messagingService_1.sendMessage)(messagePayload, wabaEnvironments);
};
exports.sendWaitForGoogleResponse = sendWaitForGoogleResponse;
const sendAddressListResponse = async (phoneNumber, addresses, wabaEnvironments) => {
    // console.log('Enviando mensagem com os endereços...');
    // console.log('Número de telefone:', phoneNumber);
    // console.log('Endereços --->', addresses);
    // Garantir que não há mais que 10 endereços
    const limitedAddresses = addresses?.slice(0, 10) || [];
    // console.log('Endereços limitados:', JSON.stringify(limitedAddresses));
    // Criar lista de itens numerados
    const listItems = limitedAddresses.map((address) => ({
        id: address.id?.slice(0, 200), // Id único para cada item
        title: address.title === 'Endereço não está na lista' ? 'Nenhuma das opções' : `Endereço:`, // Limitando cada título a 24 caracteres
        description: address.description.slice(0, 50), // Limitar descrição a 80 caracteres, se necessário
    }));
    // Criar o payload para a mensagem de lista interativa
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: '+' + phoneNumber,
        type: 'interactive',
        interactive: {
            type: 'list',
            body: {
                text: `Encontramos os seguintes endereços para você. Por favor, selecione o endereço para a entrega:`
            },
            action: {
                button: "Endereços",
                sections: [
                    {
                        title: 'Escolha um endereço',
                        rows: listItems,
                    },
                ],
            },
        },
    };
    try {
        await (0, messagingService_1.sendMessage)(messagePayload, wabaEnvironments);
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao enviar mensagem:', error.response?.data || error.message);
    }
};
exports.sendAddressListResponse = sendAddressListResponse;
const hasStreetNumber = (address) => {
    const numberRegex = /\d+/; // Verifica se há pelo menos um número no texto
    return numberRegex.test(address);
};
exports.hasStreetNumber = hasStreetNumber;
async function processGooglePredictions(predictions, store) {
    // console.log('Processando previsões do Google Places:', predictions);
    // Transformar as previsões em um formato utilizável
    const processedPredictions = predictions.map((prediction) => ({
        id: prediction.place_id, // ID único do lugar
        title: prediction.structured_formatting.main_text, // Nome principal do lugar
        description: prediction.structured_formatting.secondary_text || '', // Descrição secundária (ex.: cidade, estado)
    }));
    // console.log('Previsões processadas:', processedPredictions);
    return processedPredictions;
}
async function handleNewAddressFlow(from, text, currentConversation, store, res, addressCache) {
    if (!currentConversation.docId) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.docId não está definido.');
        const reply = `Desculpe, ocorreu um erro ao processar seu pedido. Por favor, tente novamente.`;
        if (store.wabaEnvironments) {
            await (0, messagingService_1.sendMessage)({
                messaging_product: 'whatsapp',
                to: '+' + from,
                type: 'text',
                text: { body: reply },
            }, store.wabaEnvironments);
        }
        return;
    }
    if (!store.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Erro: store.wabaEnvironments não está definido.');
        const reply = `Desculpe, ocorreu um erro ao processar seu pedido. Por favor, tente novamente.`;
        return;
    }
    // Verificar se o endereço contém um número
    try {
        if (!(0, exports.hasStreetNumber)(text)) {
            // console.log('Endereço sem número detectado:', text);
            // Enviar mensagem solicitando o número
            const reply = `Por favor, informe o endereço completo, incluindo o número. Exemplo: "Rua das Flores, 123".`;
            await (0, messagingService_1.sendMessage)({
                messaging_product: 'whatsapp',
                to: '+' + from,
                type: 'text',
                text: {
                    body: reply,
                },
            }, store.wabaEnvironments);
            return;
        }
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao verificar o endereço:', error);
        // Update conversation flow to ADDRESS_CONFIRMATION
        await (0, conversationController_1.updateConversation)(currentConversation, {
            flow: 'ADDRESS_CONFIRMATION',
        });
        // console.log('Fluxo atualizado para ADDRESS_CONFIRMATION');
        const reply = `Desculpe, ocorreu um erro ao processar o endereço. Por favor, tente novamente.`;
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: '+' + from,
            type: 'text',
            text: {
                body: reply,
            },
        }, store.wabaEnvironments);
        return;
    }
    // Update conversation flow
    await (0, conversationController_1.updateConversation)(currentConversation, {
        flow: 'ADDRESS_CONFIRMATION',
    });
    // console.log('Fluxo atualizado para ADDRESS_CONFIRMATION');
    await (0, exports.sendWaitForGoogleResponse)(from, store.wabaEnvironments);
    try {
        const response = await client.placeAutocomplete({
            params: {
                input: `${text} ${store.address?.city} ${store.address?.state}`,
                types: google_maps_services_js_1.PlaceAutocompleteType.geocode,
                key: GOOGLE_PLACES_API_KEY,
            },
        });
        if (!response?.data?.predictions || response.data.predictions.length === 0) {
            // console.log('No predictions found in Google Places API response');
            // Update conversation flow
            await (0, conversationController_1.updateConversation)(currentConversation, {
                flow: 'NEW_ADDRESS',
            });
            // console.log('Fluxo atualizado para NEW_ADDRESS');
            const reply = `Desculpe, não consegui encontrar o endereço que você informou. Por favor, tente novamente.`;
            await (0, messagingService_1.sendMessage)({
                messaging_product: 'whatsapp',
                to: '+' + from,
                type: 'text',
                text: {
                    body: reply,
                },
            }, store.wabaEnvironments);
            return;
        }
        // console.log('Google Places API response:', response.data);
        // Gerar a lista de endereços e armazenar no cache
        const predictions = await Promise.all(response.data.predictions.slice(0, 9).map(async (prediction) => {
            const placeDetails = await client.placeDetails({
                params: {
                    place_id: prediction.place_id,
                    key: GOOGLE_PLACES_API_KEY,
                },
            });
            const location = placeDetails.data.result.geometry?.location;
            // Armazenar no cache
            addressCache[prediction.place_id] = {
                lat: location?.lat,
                lng: location?.lng,
                title: prediction.terms[0].value,
                description: prediction.description,
                placeId: prediction.place_id,
            };
            // Configurar a remoção automática do cache após 10 minutos
            setTimeout(() => {
                delete addressCache[prediction.place_id];
            }, 10 * 60 * 1000); // Remover após 10 minutos
            // Retornar o payload para a lista
            return {
                id: prediction.place_id, // Usar o place_id como ID
                title: prediction.terms[0].value,
                description: prediction.description,
            };
        }));
        // Adicionar a opção "Endereço não está na lista"
        predictions.push({
            id: 'not_in_list', // ID fixo para identificar esta opção
            title: 'Endereço não está na lista',
            description: 'Tentar novamente com outro endereço.',
        });
        try {
            // Atualizar o fluxo da conversa para "NEW_ADDRESS"
            await (0, conversationController_1.updateConversation)(currentConversation, {
                flow: 'ADDRESS_CONFIRMATION',
            });
            console.log('Store Waba Environments:', store.wabaEnvironments, predictions, from);
            // Enviar a lista de endereços para o usuário
            await (0, exports.sendAddressListResponse)(from, predictions, store.wabaEnvironments);
            // console.log('Fluxo atualizado para NEW_ADDRESS');
        }
        catch (error) {
            (0, messagingService_1.notifyAdmin)('Erro ao processar a solicitação2:', error);
        }
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao processar a solicitação1:', error);
        res.status(500).send('Erro ao processar a solicitação3.');
    }
}
async function handleUseAddress(from, currentConversation, currentUser, store) {
    if (!store.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Erro: store.wabaEnvironments não está definido.');
        return;
    }
    if (!currentConversation.docId) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.docId não está definido.');
        const reply = `Desculpe, ocorreu um erro ao processar seu pedido. Por favor, tente novamente.`;
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: '+' + from,
            type: 'text',
            text: { body: reply },
        }, store.wabaEnvironments);
        return;
    }
    // Verificar se o fluxo atual é "ADDRESS_CONFIRMATION"
    if (currentConversation?.flow !== 'ADDRESS_CONFIRMATION') {
        // atualizar o endereco no Users
        return;
    }
    console.log('Fluxo atual:', currentConversation.flow);
    // Verificar o fluxo anterior
    if (currentConversation.previousFlow === 'Fazer um Pedido') {
        try {
            // // Atualizar o fluxo para "CATEGORIES" e salvar o endereço do usuário
            // await updateConversation(currentConversation, {
            //   flow: 'CATEGORIES',
            //   address: currentConversation.address || currentUser?.address,
            // });
            // // Enviar a lista de categorias para o cliente
            // await sendCategoriesMessage(from, store.categories, store.menu, store.wabaEnvironments, currentConversation);
            // await handleMakeOrder(from, currentConversation, currentUser);
            console.log('Atualizando conversa para CATEGORY_SELECTION');
            await (0, conversationController_1.updateConversation)(currentConversation, {
                flow: 'CATEGORY_SELECTION',
            });
            await (0, messagingService_1.sendMessage)({
                messaging_product: 'whatsapp',
                to: '+' + from,
                type: 'flow',
                flow: {
                    flow_id: 1042584718014131, // ID do fluxo publicado no WABA
                },
            }, store.wabaEnvironments);
            return;
        }
        catch (error) {
            (0, messagingService_1.notifyAdmin)('Erro ao processar o botão "Usar este endereço":', error);
        }
        return;
    }
    if (currentConversation.previousFlow === 'Alterar Endereço') {
        // enviar para o sumario do pedido
        await (0, conversationController_1.updateConversation)(currentConversation, {
            flow: 'ORDER_SUMMARY',
            address: currentConversation.address || currentUser?.address,
        });
        // await redirectToOrderSummary(from, currentConversation);
        return;
    }
    if (currentConversation.previousFlow === store.singleProductText) {
        try {
            // redireciona para o fluxo de ORDER_SUMMARY
            if (!currentConversation.store?.menu?.length) {
                // envia mensagem que nao existe produto
                const reply = `Desculpe, não há produtos disponíveis no momento. Por favor, tente novamente mais tarde.`;
                await (0, messagingService_1.sendMessage)({
                    messaging_product: 'whatsapp',
                    to: '+' + from,
                    type: 'text',
                    text: {
                        body: reply,
                    },
                }, store.wabaEnvironments);
                // Avisa o admin que nao existe produto
                (0, messagingService_1.notifyAdmin)(`Não há produtos disponíveis no menu da loja ${store.name}`);
                return;
            }
            const produtct = (0, catalogService_1.getSingleProduct)(currentConversation.store?.menu);
            if (!produtct?.length) {
                // envia mensagem que nao existe produto
                const reply = `Desculpe, não há produtos disponíveis no momento. Por favor, tente novamente mais tarde.`;
                await (0, messagingService_1.sendMessage)({
                    messaging_product: 'whatsapp',
                    to: '+' + from,
                    type: 'text',
                    text: {
                        body: reply,
                    },
                }, store.wabaEnvironments);
                // Avisa o admin que nao existe produto
                (0, messagingService_1.notifyAdmin)(`Não há produtos disponíveis no menu da loja ${store.name}`);
                return;
            }
            // Atualiza o fluxo da conversa para ORDER_SUMMARY  
            await (0, conversationController_1.updateConversation)(currentConversation, {
                flow: 'PRODUCTS'
            });
            await (0, catalogService_1.sendProductCard)(from, produtct[0], store.wabaEnvironments);
            return;
        }
        catch (error) {
            (0, messagingService_1.notifyAdmin)('Erro ao processar o botão "Usar este endereço":', error);
        }
        return;
    }
}
async function handleInformOtherAddress(from, currentConversation) {
    // Verificar consistência do docId
    if (!currentConversation.docId) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.docId não está definido.');
        const reply = `Desculpe, ocorreu um erro ao processar seu pedido. Por favor, tente novamente.`;
        if (currentConversation.store?.wabaEnvironments) {
            await (0, messagingService_1.sendMessage)({
                messaging_product: 'whatsapp',
                to: '+' + from,
                type: 'text',
                text: { body: reply },
            }, currentConversation.store.wabaEnvironments);
        }
        return;
    }
    if (!currentConversation.store?.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Erro: store.wabaEnvironments não está definido.');
        return;
    }
    // Verificar se o fluxo atual é "ADDRESS_CONFIRMATION"
    if (currentConversation?.flow !== 'ADDRESS_CONFIRMATION' &&
        currentConversation?.flow !== 'EDIT_OR_REMOVE_SELECTION') {
        // Ignorar se o fluxo não for "ADDRESS_CONFIRMATION" ou "EDIT_OR_REMOVE_SELECTION"
        return;
    }
    try {
        // Atualizar o fluxo para "NEW_ADDRESS"
        await (0, conversationController_1.updateConversation)(currentConversation, {
            flow: 'NEW_ADDRESS',
            previousFlow: currentConversation.flow === 'ADDRESS_CONFIRMATION'
                ? currentConversation.previousFlow : 'Alterar Endereço',
        });
        // Enviar mensagem solicitando um novo endereço
        await (0, exports.sendNewAddressMessage)(from, currentConversation.store?.wabaEnvironments);
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao processar o botão "Informar outro endereço":', error);
    }
}
