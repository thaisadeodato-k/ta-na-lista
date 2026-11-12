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
const uf = /^[A-Za-z]{2}$/.test((r.state || '').toString().trim()) ? r.state.trim().toUpperCase() : '-';
const bairro = (r.neighborhood || '').toString().trim();
const b64 = (s) => Buffer.from(s || ' ', 'utf8').toString('base64');

return [{
  json: {
    lat: temCoord ? String(lat) : 'x',
    lon: temCoord ? String(lon) : 'x',
    municipio,
    municipio_b64: b64(municipio),
    uf, // sigla do estado: separa cidades com o mesmo nome (ex.: Santa Luzia MG e PB)
    bairro,
    bairro_b64: b64(bairro),
    cep_encontrado: temCoord || !!municipio,
  },
}];
