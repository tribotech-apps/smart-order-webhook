"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddressSearchService = void 0;
const google_maps_services_js_1 = require("@googlemaps/google-maps-services-js");
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
class AddressSearchService {
    /**
     * Busca endereços usando Google Places Autocomplete
     */
    static async searchAddresses(query, storeCity, storeState) {
        console.log(`🔍 [ADDRESS_SEARCH] Buscando endereços para: "${query}"`);
        try {
            // Adiciona contexto da cidade da loja para melhorar resultados
            const searchQuery = `${query} ${storeCity || ''} ${storeState || ''}`.trim();
            const response = await this.client.placeAutocomplete({
                params: {
                    input: searchQuery,
                    types: google_maps_services_js_1.PlaceAutocompleteType.geocode,
                    key: GOOGLE_PLACES_API_KEY,
                },
            });
            if (!response?.data?.predictions || response.data.predictions.length === 0) {
                console.log(`❌ [ADDRESS_SEARCH] Nenhum endereço encontrado para: "${query}"`);
                return {
                    success: false,
                    results: [],
                    error: 'Nenhum endereço encontrado. Tente novamente com mais detalhes.'
                };
            }
            // Processar resultados e obter coordenadas
            const results = await Promise.all(response.data.predictions.slice(0, 5).map(async (prediction) => {
                try {
                    // Buscar detalhes do local para obter coordenadas
                    const placeDetails = await this.client.placeDetails({
                        params: {
                            place_id: prediction.place_id,
                            key: GOOGLE_PLACES_API_KEY,
                        },
                    });
                    const location = placeDetails.data.result.geometry?.location;
                    const result = {
                        id: prediction.place_id,
                        title: prediction.terms[0]?.value || prediction.structured_formatting?.main_text || 'Endereço',
                        description: prediction.description,
                        lat: location?.lat,
                        lng: location?.lng
                    };
                    // Armazenar no cache para uso posterior
                    this.addressCache[prediction.place_id] = result;
                    console.log(`✅ [ADDRESS_SEARCH] Endereço encontrado: ${result.description}`);
                    return result;
                }
                catch (error) {
                    console.error(`❌ [ADDRESS_SEARCH] Erro ao buscar detalhes do place_id ${prediction.place_id}:`, error);
                    return {
                        id: prediction.place_id,
                        title: prediction.terms[0]?.value || 'Endereço',
                        description: prediction.description
                    };
                }
            }));
            // Adicionar opção "Endereço não está na lista"
            results.push({
                id: 'not_in_list',
                title: 'Endereço não está na lista',
                description: 'Tentar novamente com outro endereço.'
            });
            console.log(`✅ [ADDRESS_SEARCH] Encontrados ${results.length - 1} endereços válidos`);
            return {
                success: true,
                results
            };
        }
        catch (error) {
            console.error(`💥 [ADDRESS_SEARCH] Erro na busca de endereços:`, error);
            return {
                success: false,
                results: [],
                error: 'Erro interno ao buscar endereços. Tente novamente.'
            };
        }
    }
    /**
     * Recupera endereço do cache pelo place_id
     */
    static getCachedAddress(placeId) {
        return this.addressCache[placeId] || null;
    }
    /**
     * Formatar lista de endereços para envio via WhatsApp
     */
    static formatAddressList(results) {
        if (results.length === 0) {
            return 'Nenhum endereço encontrado.';
        }
        let message = '📍 **Endereços encontrados:**\n\n';
        results.forEach((result, index) => {
            message += `*${index + 1}.* ${result.description}\n\n`;
        });
        message += 'Digite o **número** do endereço correto (1, 2, 3, etc.)';
        return message;
    }
    /**
     * Parsear seleção numérica do usuário
     */
    static parseAddressSelection(userInput, resultsList) {
        const selection = parseInt(userInput.trim());
        if (isNaN(selection) || selection < 1 || selection > resultsList.length) {
            return null;
        }
        return resultsList[selection - 1];
    }
}
exports.AddressSearchService = AddressSearchService;
AddressSearchService.client = new google_maps_services_js_1.Client();
AddressSearchService.addressCache = {};
