const STORAGE_KEY = 'combustivel.abastecimentos';

/** @typedef {{id:string, data:string, km:number, litros:number, valorTotal:number, tanqueCheio:boolean, combustivel:string}} Abastecimento */

const TIPOS_ORDEM = ['Gasolina', 'Etanol', 'Diesel', 'GNV'];

/** @returns {Abastecimento[]} */
function carregar() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const lista = raw ? JSON.parse(raw) : [];
    return lista.map((item) => ({ combustivel: 'Gasolina', ...item }));
  } catch {
    return [];
  }
}

/** @param {Abastecimento[]} lista */
function salvar(lista) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
}

function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatoMoeda(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatoKm(valor) {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' km';
}

function formatoData(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatoLitros(valor) {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L';
}

/**
 * Soma km/litros/custo entre pares consecutivos de abastecimentos com tanque cheio.
 * Se `tipoFiltro` for informado, só considera intervalos em que TODOS os
 * abastecimentos (início, fim e os que ficam no meio) sejam desse tipo — assim o
 * km/L calculado reflete de fato aquele combustível, sem misturar com outro.
 */
function calcularIntervalos(ordenada, indicesCheios, tipoFiltro) {
  let kmSomado = 0;
  let litrosSomado = 0;
  let custoSomado = 0;

  for (let p = 0; p < indicesCheios.length - 1; p++) {
    const iInicio = indicesCheios[p];
    const iFim = indicesCheios[p + 1];

    if (tipoFiltro) {
      let mesmoTipo = true;
      for (let k = iInicio; k <= iFim; k++) {
        if (ordenada[k].combustivel !== tipoFiltro) { mesmoTipo = false; break; }
      }
      if (!mesmoTipo) continue;
    }

    const kmDelta = ordenada[iFim].km - ordenada[iInicio].km;
    if (kmDelta <= 0) continue;

    let litrosIntervalo = 0;
    let custoIntervalo = 0;
    for (let k = iInicio + 1; k <= iFim; k++) {
      litrosIntervalo += ordenada[k].litros;
      custoIntervalo += ordenada[k].valorTotal;
    }

    kmSomado += kmDelta;
    litrosSomado += litrosIntervalo;
    custoSomado += custoIntervalo;
  }

  return {
    consumoMedio: litrosSomado > 0 ? kmSomado / litrosSomado : null,
    custoPorKm: kmSomado > 0 ? custoSomado / kmSomado : null,
  };
}

/**
 * Calcula consumo médio (km/L) e custo por km usando o método de "tanque cheio",
 * tanto no geral quanto separado por tipo de combustível.
 */
function calcularEstatisticas(lista) {
  const ordenada = [...lista].sort((a, b) => a.km - b.km);
  const gastoTotal = somaGasto(ordenada);
  const kmTotal = ordenada.length >= 2 ? ordenada[ordenada.length - 1].km - ordenada[0].km : null;

  const tiposPresentes = TIPOS_ORDEM.filter((tipo) => ordenada.some((item) => item.combustivel === tipo));

  const porTipo = {};
  for (const tipo of tiposPresentes) {
    const doTipo = ordenada.filter((item) => item.combustivel === tipo);
    const gastoTipo = somaGasto(doTipo);
    const litrosTipo = doTipo.reduce((acc, item) => acc + item.litros, 0);
    porTipo[tipo] = {
      gastoTotal: gastoTipo,
      litrosTotal: litrosTipo,
      precoMedioLitro: litrosTipo > 0 ? gastoTipo / litrosTipo : null,
      consumoMedio: null,
      custoPorKm: null,
    };
  }

  if (ordenada.length < 2) {
    return { consumoMedio: null, custoPorKm: null, gastoTotal, kmTotal, porTipo };
  }

  const indicesCheios = ordenada.reduce((acc, item, i) => {
    if (item.tanqueCheio) acc.push(i);
    return acc;
  }, []);

  const geral = calcularIntervalos(ordenada, indicesCheios, null);

  for (const tipo of tiposPresentes) {
    const r = calcularIntervalos(ordenada, indicesCheios, tipo);
    porTipo[tipo].consumoMedio = r.consumoMedio;
    porTipo[tipo].custoPorKm = r.custoPorKm;
  }

  return { consumoMedio: geral.consumoMedio, custoPorKm: geral.custoPorKm, gastoTotal, kmTotal, porTipo };
}

function somaGasto(lista) {
  return lista.reduce((acc, item) => acc + item.valorTotal, 0);
}

function renderStats(lista) {
  const { consumoMedio, custoPorKm, gastoTotal, kmTotal, porTipo } = calcularEstatisticas(lista);

  document.getElementById('stat-consumo').textContent =
    consumoMedio != null ? `${consumoMedio.toFixed(2).replace('.', ',')} km/L` : '—';

  document.getElementById('stat-custo-km').textContent =
    custoPorKm != null ? `${formatoMoeda(custoPorKm)}/km` : '—';

  document.getElementById('stat-gasto-total').textContent =
    lista.length > 0 ? formatoMoeda(gastoTotal) : '—';

  document.getElementById('stat-km-total').textContent =
    kmTotal != null ? formatoKm(kmTotal) : '—';

  renderPorTipo(porTipo);
}

function renderPorTipo(porTipo) {
  const card = document.getElementById('card-por-tipo');
  const container = document.getElementById('lista-por-tipo');
  const tipos = Object.keys(porTipo);

  container.innerHTML = '';

  if (tipos.length === 0) {
    card.hidden = true;
    return;
  }
  card.hidden = false;

  for (const tipo of tipos) {
    const info = porTipo[tipo];

    const div = document.createElement('div');
    div.className = 'tipo-card';

    const header = document.createElement('div');
    header.className = 'tipo-card-header';

    const nome = document.createElement('span');
    nome.className = 'tipo-card-nome';
    nome.textContent = tipo;

    const badge = document.createElement('span');
    badge.className = `tipo-badge ${tipo}`;
    badge.textContent = formatoLitros(info.litrosTotal);

    header.append(nome, badge);

    const grid = document.createElement('div');
    grid.className = 'tipo-card-grid';

    grid.appendChild(criarItemTipo('Gasto total', formatoMoeda(info.gastoTotal)));
    grid.appendChild(criarItemTipo('Preço médio/L', info.precoMedioLitro != null ? formatoMoeda(info.precoMedioLitro) : '—'));
    grid.appendChild(criarItemTipo('Consumo médio', info.consumoMedio != null ? `${info.consumoMedio.toFixed(2).replace('.', ',')} km/L` : '—'));
    grid.appendChild(criarItemTipo('Custo por km', info.custoPorKm != null ? `${formatoMoeda(info.custoPorKm)}/km` : '—'));

    div.append(header, grid);
    container.appendChild(div);
  }
}

function criarItemTipo(label, valor) {
  const div = document.createElement('div');
  div.className = 'tipo-card-item';

  const labelEl = document.createElement('span');
  labelEl.className = 'label';
  labelEl.textContent = label;

  const valorEl = document.createElement('span');
  valorEl.className = 'valor';
  valorEl.textContent = valor;

  div.append(labelEl, valorEl);
  return div;
}

function renderLista(lista) {
  const ul = document.getElementById('lista-abastecimentos');
  const vazio = document.getElementById('lista-vazia');
  ul.innerHTML = '';

  if (lista.length === 0) {
    vazio.hidden = false;
    return;
  }
  vazio.hidden = true;

  const ordenadaDesc = [...lista].sort((a, b) => b.km - a.km);

  for (const item of ordenadaDesc) {
    const li = document.createElement('li');
    li.className = 'item';

    const info = document.createElement('div');
    info.className = 'item-info';

    const dataEl = document.createElement('span');
    dataEl.className = 'item-date';
    dataEl.textContent = `${formatoData(item.data)}${item.tanqueCheio ? ' · tanque cheio' : ''}`;

    const mainEl = document.createElement('span');
    mainEl.className = 'item-main';
    mainEl.textContent = `${formatoKm(item.km)} — ${item.litros.toLocaleString('pt-BR')} L`;

    const badgeEl = document.createElement('span');
    badgeEl.className = `tipo-badge ${item.combustivel}`;
    badgeEl.textContent = item.combustivel;
    mainEl.appendChild(badgeEl);

    const subEl = document.createElement('span');
    subEl.className = 'item-sub';
    subEl.textContent = formatoMoeda(item.valorTotal);

    info.append(dataEl, mainEl, subEl);

    const btnDelete = document.createElement('button');
    btnDelete.className = 'item-delete';
    btnDelete.setAttribute('aria-label', 'Excluir');
    btnDelete.textContent = '×';
    btnDelete.addEventListener('click', () => excluir(item.id));

    li.append(info, btnDelete);
    ul.appendChild(li);
  }
}

function render() {
  const lista = carregar();
  renderStats(lista);
  renderLista(lista);
}

function excluir(id) {
  const lista = carregar().filter((item) => item.id !== id);
  salvar(lista);
  render();
}

function mostrarToast(mensagem) {
  const toast = document.getElementById('toast');
  toast.textContent = mensagem;
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 1800);
}

function init() {
  const hoje = new Date();
  const isoHoje = hoje.toISOString().slice(0, 10);
  document.getElementById('data').value = isoHoje;

  document.getElementById('form-abastecimento').addEventListener('submit', (ev) => {
    ev.preventDefault();

    const data = document.getElementById('data').value;
    const combustivel = document.getElementById('combustivel').value;
    const km = parseFloat(document.getElementById('km').value);
    const litros = parseFloat(document.getElementById('litros').value);
    const valorTotal = parseFloat(document.getElementById('valorTotal').value);
    const tanqueCheio = document.getElementById('tanqueCheio').checked;

    if (!data || !combustivel || isNaN(km) || isNaN(litros) || isNaN(valorTotal)) return;

    const lista = carregar();

    if (lista.some((item) => item.km === km)) {
      mostrarToast('Já existe um abastecimento com essa km.');
      return;
    }

    lista.push({ id: gerarId(), data, combustivel, km, litros, valorTotal, tanqueCheio });
    salvar(lista);
    render();

    ev.target.reset();
    document.getElementById('data').value = isoHoje;
    document.getElementById('tanqueCheio').checked = true;
    mostrarToast('Abastecimento adicionado!');
  });

  render();
}

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
