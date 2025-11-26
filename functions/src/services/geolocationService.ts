export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRadians = (degree: number) => (degree * Math.PI) / 180;

  const R = 6371; // Raio da Terra em quilômetros
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Retorna a distância em quilômetros
}

/**
 * Processa os componentes do endereço retornados pela API do Google Places.
 * @param addressComponents Componentes do endereço retornados pela API do Google Places.
 * @returns Um objeto contendo os campos do endereço (rua, número, bairro, cidade, estado, CEP).
 */
export function parseGooglePlacesAddress(addressComponents: any): {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
} {
  const getComponent = (type: string) =>
    addressComponents.find((component: any) => component.types.includes(type))?.long_name || '';

  return {
    street: getComponent('route'), // Rua
    number: getComponent('street_number'), // Número
    neighborhood: getComponent('sublocality') || getComponent('political'), // Bairro
    city: getComponent('administrative_area_level_2'), // Cidade
    state: getComponent('administrative_area_level_1'), // Estado
    zipCode: getComponent('postal_code'), // CEP
  };
}