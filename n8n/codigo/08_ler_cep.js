// LER CEP: pega latitude/longitude e cidade devolvidas pelo serviço de CEP.
// Serviço usado: BrasilAPI (https://brasilapi.com.br/api/cep/v2/CEP), gratuito e sem chave.
// Também entende o formato da AwesomeAPI, caso alguém troque o serviço.
// O CEP não é salvo no banco.
const r = $input.first().json || {};
const coord = (r.location && r.location.coordinates) || {};
const lat = parseFloat(coord.latitude ?? r.lat);
const lon = parseFloat(coord.longitude ?? r.lng);
const temCoord = Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
const municipio = (r.city || '').toString().trim();

return [{
  json: {
    lat: temCoord ? String(lat) : 'x',
    lon: temCoord ? String(lon) : 'x',
    municipio,
    municipio_b64: Buffer.from(municipio || ' ', 'utf8').toString('base64'),
    cep_encontrado: temCoord || !!municipio,
  },
}];
