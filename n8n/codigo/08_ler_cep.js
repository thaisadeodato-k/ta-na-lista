// LER CEP: pega latitude/longitude e cidade devolvidas pelo serviço de CEP.
// O CEP não é salvo no banco.
const r = $input.first().json || {};
const lat = parseFloat(r.lat);
const lon = parseFloat(r.lng);
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
