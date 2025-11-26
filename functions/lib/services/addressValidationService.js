"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddressValidationService = void 0;
const google_maps_services_js_1 = require("@googlemaps/google-maps-services-js");
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
class AddressValidationService {
    /**
     * Valida endereço e verifica se está dentro do raio de entrega
     */
    static async validateAddressAndRadius(addressText, storeAddress, maxRadiusKm) {
        console.log(`🔍 [ADDRESS_VALIDATION] Validando endereço: "${addressText}"`);
        console.log(`📍 [ADDRESS_VALIDATION] Store location: lat=${storeAddress.lat}, lng=${storeAddress.lng}`);
        console.log(`📏 [ADDRESS_VALIDATION] Max radius: ${maxRadiusKm} km`);
        try {
            // 1. Geocodificar o endereço para obter coordenadas
            const geocodeResponse = await this.client.geocode({
                params: {
                    address: addressText,
                    key: GOOGLE_PLACES_API_KEY,
                },
            });
            if (!geocodeResponse.data.results || geocodeResponse.data.results.length === 0) {
                console.log(`❌ [ADDRESS_VALIDATION] Endereço não encontrado: "${addressText}"`);
                return {
                    isValid: false,
                    isWithinRadius: false,
                    error: 'Endereço não encontrado. Por favor, verifique e tente novamente.'
                };
            }
            const result = geocodeResponse.data.results[0];
            const customerLocation = result.geometry.location;
            const formattedAddress = result.formatted_address;
            console.log(`✅ [ADDRESS_VALIDATION] Endereço geocodificado:`);
            console.log(`   - Formatted: ${formattedAddress}`);
            console.log(`   - Coordinates: lat=${customerLocation.lat}, lng=${customerLocation.lng}`);
            // 2. Calcular distância entre loja e endereço do cliente
            const distance = this.calculateDistance(storeAddress.lat, storeAddress.lng, customerLocation.lat, customerLocation.lng);
            console.log(`📏 [ADDRESS_VALIDATION] Distance calculated: ${distance.toFixed(2)} km`);
            // 3. Verificar se está dentro do raio
            const isWithinRadius = distance <= maxRadiusKm;
            console.log(`${isWithinRadius ? '✅' : '❌'} [ADDRESS_VALIDATION] Within radius: ${isWithinRadius}`);
            return {
                isValid: true,
                isWithinRadius,
                distance: parseFloat(distance.toFixed(2)),
                formattedAddress
            };
        }
        catch (error) {
            console.error(`💥 [ADDRESS_VALIDATION] Error validating address:`, error);
            return {
                isValid: false,
                isWithinRadius: false,
                error: 'Erro interno ao validar endereço. Tente novamente.'
            };
        }
    }
    /**
     * Calcula distância entre duas coordenadas usando fórmula de Haversine
     */
    static calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Raio da Terra em km
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c; // Distância em km
        return d;
    }
    static deg2rad(deg) {
        return deg * (Math.PI / 180);
    }
}
exports.AddressValidationService = AddressValidationService;
AddressValidationService.client = new google_maps_services_js_1.Client();
