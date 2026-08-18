const VERSAO = '1.1.2';
const STORAGE_KEY = 'combustivel.abastecimentos';

/** @typedef {{id:string, data:string, km:number, litros:number, valorTotal:number, tanqueCheio:boolean, combustivel:string}} Abastecimento */

const TIPOS_ORDEM = ['Gasolina', 'Etanol', 'Diesel', 'GNV'];

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const TITULOS = {
  inicio: '⛽ TANQ',
  novo: 'Novo abastecimento',
  relatorios: 'Relatórios',
  dados: 'Dados e backup',
};

/* ==================== armazenamento ==================== */

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

/* ==================== formatação ==================== */

function formatoMoeda(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatoKm(valor) {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' km';
}

function formatoLitros(valor) {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L';
}

function formatoData(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatoConsumo(valor) {
  return valor != null ? `${valor.toFixed(2).replace('.', ',')} km/L` : '—';
}

function formatoCustoKm(valor) {
  return valor != null ? `${formatoMoeda(valor)}/km` : '—';
}

function nomeMes(ym) {
  const [ano, mes] = ym.split('-');
  return `${MESES[Number(mes) - 1]} ${ano}`;
}

/* ==================== cálculos ==================== */

/**
 * Percorre pares consecutivos de abastecimentos com tanque cheio. Entre dois
 * tanques cheios, os litros abastecidos (excluindo o primeiro, incluindo o último)
 * são exatamente o que o carro consumiu para rodar aquela distância.
 * Cada intervalo é atribuído ao mês do abastecimento que o fecha.
 */
function calcularIntervalos(ordenada) {
  const indicesCheios = [];
  ordenada.forEach((item, i) => {
    if (item.tanqueCheio) indicesCheios.push(i);
  });

  const intervalos = [];

  for (let p = 0; p < indicesCheios.length - 1; p++) {
    const iInicio = indicesCheios[p];
    const iFim = indicesCheios[p + 1];

    const km = ordenada[iFim].km - ordenada[iInicio].km;
    if (km <= 0) continue;

    let litros = 0;
    let custo = 0;
    const tipos = new Set([ordenada[iInicio].combustivel]);

    for (let k = iInicio + 1; k <= iFim; k++) {
      litros += ordenada[k].litros;
      custo += ordenada[k].valorTotal;
      tipos.add(ordenada[k].combustivel);
    }

    intervalos.push({
      km,
      litros,
      custo,
      mes: ordenada[iFim].data.slice(0, 7),
      // só serve para o relatório por combustível quando o trecho inteiro usou um tipo só
      tipoUnico: tipos.size === 1 ? [...tipos][0] : null,
    });
  }

  return intervalos;
}

/** Soma km/litros/custo de um conjunto de intervalos e devolve consumo e custo por km. */
function agregarIntervalos(intervalos) {
  let km = 0;
  let litros = 0;
  let custo = 0;

  for (const it of intervalos) {
    km += it.km;
    litros += it.litros;
    custo += it.custo;
  }

  return {
    kmRodados: km > 0 ? km : null,
    consumoMedio: litros > 0 ? km / litros : null,
    custoPorKm: km > 0 ? custo / km : null,
  };
}

function somaGasto(lista) {
  return lista.reduce((acc, item) => acc + item.valorTotal, 0);
}

function somaLitros(lista) {
  return lista.reduce((acc, item) => acc + item.litros, 0);
}

function resumoSimples(lista) {
  const gasto = somaGasto(lista);
  const litros = somaLitros(lista);
  return {
    gastoTotal: gasto,
    litrosTotal: litros,
    precoMedioLitro: litros > 0 ? gasto / litros : null,
    abastecimentos: lista.length,
  };
}

/** Estatísticas gerais, por tipo de combustível e por mês. */
function calcularEstatisticas(lista) {
  const ordenada = [...lista].sort((a, b) => a.km - b.km);
  const intervalos = calcularIntervalos(ordenada);

  const geral = {
    ...resumoSimples(ordenada),
    ...agregarIntervalos(intervalos),
  };

  const porTipo = {};
  for (const tipo of TIPOS_ORDEM) {
    const doTipo = ordenada.filter((item) => item.combustivel === tipo);
    if (doTipo.length === 0) continue;
    porTipo[tipo] = {
      ...resumoSimples(doTipo),
      ...agregarIntervalos(intervalos.filter((it) => it.tipoUnico === tipo)),
    };
  }

  const meses = [...new Set(ordenada.map((item) => item.data.slice(0, 7)))].sort().reverse();
  const porMes = meses.map((mes) => {
    const doMes = ordenada.filter((item) => item.data.slice(0, 7) === mes);
    const tiposDoMes = {};
    for (const tipo of TIPOS_ORDEM) {
      const doTipo = doMes.filter((item) => item.combustivel === tipo);
      if (doTipo.length === 0) continue;
      tiposDoMes[tipo] = { gastoTotal: somaGasto(doTipo), litrosTotal: somaLitros(doTipo) };
    }
    return {
      mes,
      ...resumoSimples(doMes),
      ...agregarIntervalos(intervalos.filter((it) => it.mes === mes)),
      porTipo: tiposDoMes,
    };
  });

  return { geral, porTipo, porMes };
}

/* ==================== telas ==================== */

function irPara(view) {
  document.querySelectorAll('.view').forEach((el) => {
    el.classList.toggle('ativa', el.id === `view-${view}`);
  });
  document.querySelectorAll('.tab').forEach((el) => {
    el.classList.toggle('ativa', el.dataset.ir === view);
  });
  document.getElementById('titulo-view').textContent = TITULOS[view] || TITULOS.inicio;
  window.scrollTo(0, 0);
}

/* ==================== renderização ==================== */

function criarItemDetalhe(label, valor) {
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

function renderInicio(stats, lista) {
  const { geral, porMes } = stats;

  document.getElementById('stat-consumo').textContent = formatoConsumo(geral.consumoMedio);
  document.getElementById('stat-custo-km').textContent = formatoCustoKm(geral.custoPorKm);
  document.getElementById('stat-gasto-total').textContent =
    lista.length > 0 ? formatoMoeda(geral.gastoTotal) : '—';
  document.getElementById('stat-km-total').textContent =
    geral.kmRodados != null ? formatoKm(geral.kmRodados) : '—';

  const card = document.getElementById('card-mes-atual');
  if (porMes.length === 0) {
    card.hidden = true;
  } else {
    const ultimo = porMes[0];
    const mesCorrente = new Date().toISOString().slice(0, 7);
    card.hidden = false;
    document.querySelector('.resumo-mes-label').textContent =
      ultimo.mes === mesCorrente ? 'Mês atual' : 'Último mês registrado';
    document.getElementById('mes-atual-nome').textContent = nomeMes(ultimo.mes);
    document.getElementById('mes-atual-gasto').textContent = formatoMoeda(ultimo.gastoTotal);
    document.getElementById('mes-atual-sub').textContent =
      `${ultimo.abastecimentos} abastecimento${ultimo.abastecimentos > 1 ? 's' : ''} · ` +
      `${formatoLitros(ultimo.litrosTotal)}` +
      (ultimo.kmRodados != null ? ` · ${formatoKm(ultimo.kmRodados)}` : '');
  }
}

function renderHistorico(lista) {
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
    btnDelete.addEventListener('click', () => excluir(item));

    li.append(info, btnDelete);
    ul.appendChild(li);
  }
}

function renderMensal(porMes) {
  const container = document.getElementById('lista-mensal');
  const vazio = document.getElementById('mensal-vazio');
  container.innerHTML = '';

  if (porMes.length === 0) {
    vazio.hidden = false;
    return;
  }
  vazio.hidden = true;

  for (const mes of porMes) {
    const div = document.createElement('div');
    div.className = 'tipo-card';

    const header = document.createElement('div');
    header.className = 'tipo-card-header';

    const nome = document.createElement('span');
    nome.className = 'tipo-card-nome';
    nome.textContent = nomeMes(mes.mes);

    const badge = document.createElement('span');
    badge.className = 'tipo-badge';
    badge.textContent = `${mes.abastecimentos}×`;

    header.append(nome, badge);

    const grid = document.createElement('div');
    grid.className = 'tipo-card-grid';
    grid.append(
      criarItemDetalhe('Gasto no mês', formatoMoeda(mes.gastoTotal)),
      criarItemDetalhe('Litros', formatoLitros(mes.litrosTotal)),
      criarItemDetalhe('Km rodados', mes.kmRodados != null ? formatoKm(mes.kmRodados) : '—'),
      criarItemDetalhe('Consumo médio', formatoConsumo(mes.consumoMedio)),
      criarItemDetalhe('Custo por km', formatoCustoKm(mes.custoPorKm)),
      criarItemDetalhe('Preço médio/L', mes.precoMedioLitro != null ? formatoMoeda(mes.precoMedioLitro) : '—'),
    );

    div.append(header, grid);

    const tipos = Object.keys(mes.porTipo);
    if (tipos.length > 1) {
      const rodape = document.createElement('div');
      rodape.className = 'tipo-card-rodape';
      for (const tipo of tipos) {
        const linha = document.createElement('div');
        linha.className = 'linha-tipo';

        const nomeTipo = document.createElement('span');
        nomeTipo.className = 'nome';
        nomeTipo.textContent = tipo;

        const valorTipo = document.createElement('span');
        valorTipo.textContent =
          `${formatoMoeda(mes.porTipo[tipo].gastoTotal)} · ${formatoLitros(mes.porTipo[tipo].litrosTotal)}`;

        linha.append(nomeTipo, valorTipo);
        rodape.appendChild(linha);
      }
      div.appendChild(rodape);
    }

    container.appendChild(div);
  }
}

function renderPorTipo(porTipo) {
  const container = document.getElementById('lista-por-tipo');
  const vazio = document.getElementById('tipo-vazio');
  const tipos = Object.keys(porTipo);
  container.innerHTML = '';

  if (tipos.length === 0) {
    vazio.hidden = false;
    return;
  }
  vazio.hidden = true;

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
    grid.append(
      criarItemDetalhe('Gasto total', formatoMoeda(info.gastoTotal)),
      criarItemDetalhe('Preço médio/L', info.precoMedioLitro != null ? formatoMoeda(info.precoMedioLitro) : '—'),
      criarItemDetalhe('Consumo médio', formatoConsumo(info.consumoMedio)),
      criarItemDetalhe('Custo por km', formatoCustoKm(info.custoPorKm)),
    );

    div.append(header, grid);
    container.appendChild(div);
  }
}

function renderTotal(geral, lista) {
  const container = document.getElementById('lista-total');
  const vazio = document.getElementById('total-vazio');
  container.innerHTML = '';

  if (lista.length === 0) {
    vazio.hidden = false;
    return;
  }
  vazio.hidden = true;

  const ordenada = [...lista].sort((a, b) => a.data.localeCompare(b.data));
  const periodo = ordenada.length > 1
    ? `${formatoData(ordenada[0].data)} a ${formatoData(ordenada[ordenada.length - 1].data)}`
    : formatoData(ordenada[0].data);

  const div = document.createElement('div');
  div.className = 'tipo-card';

  const header = document.createElement('div');
  header.className = 'tipo-card-header';

  const nome = document.createElement('span');
  nome.className = 'tipo-card-nome';
  nome.textContent = 'Desde o início';

  const badge = document.createElement('span');
  badge.className = 'tipo-badge';
  badge.textContent = `${geral.abastecimentos}×`;

  header.append(nome, badge);

  const grid = document.createElement('div');
  grid.className = 'tipo-card-grid';
  grid.append(
    criarItemDetalhe('Gasto total', formatoMoeda(geral.gastoTotal)),
    criarItemDetalhe('Litros totais', formatoLitros(geral.litrosTotal)),
    criarItemDetalhe('Km rodados', geral.kmRodados != null ? formatoKm(geral.kmRodados) : '—'),
    criarItemDetalhe('Consumo médio', formatoConsumo(geral.consumoMedio)),
    criarItemDetalhe('Custo por km', formatoCustoKm(geral.custoPorKm)),
    criarItemDetalhe('Preço médio/L', geral.precoMedioLitro != null ? formatoMoeda(geral.precoMedioLitro) : '—'),
  );

  const rodape = document.createElement('div');
  rodape.className = 'tipo-card-rodape';
  const linha = document.createElement('div');
  linha.className = 'linha-tipo';
  const nomePeriodo = document.createElement('span');
  nomePeriodo.className = 'nome';
  nomePeriodo.textContent = 'Período';
  const valorPeriodo = document.createElement('span');
  valorPeriodo.textContent = periodo;
  linha.append(nomePeriodo, valorPeriodo);
  rodape.appendChild(linha);

  div.append(header, grid, rodape);
  container.appendChild(div);
}

function render() {
  const lista = carregar();
  const stats = calcularEstatisticas(lista);

  renderInicio(stats, lista);
  renderHistorico(lista);
  renderMensal(stats.porMes);
  renderPorTipo(stats.porTipo);
  renderTotal(stats.geral, lista);
}

/* ==================== ações ==================== */

function excluir(item) {
  const ok = confirm(
    `Excluir o abastecimento de ${formatoData(item.data)} (${formatoKm(item.km)})?`
  );
  if (!ok) return;

  salvar(carregar().filter((reg) => reg.id !== item.id));
  render();
  mostrarToast('Abastecimento excluído.');
}

function mostrarToast(mensagem) {
  const toast = document.getElementById('toast');
  toast.textContent = mensagem;
  toast.hidden = false;
  clearTimeout(mostrarToast._t);
  mostrarToast._t = setTimeout(() => { toast.hidden = true; }, 2200);
}

/* ==================== CSV ==================== */

const CABECALHO_CSV = ['data', 'combustivel', 'km', 'litros', 'valor', 'tanque_cheio'];

// marca de início de arquivo UTF-8 que o Excel espera para exibir acentos corretamente
const BOM = '﻿';

function numeroParaCSV(valor, casas) {
  return valor.toFixed(casas).replace('.', ',');
}

function gerarCSV(lista) {
  const ordenada = [...lista].sort((a, b) => a.km - b.km);
  const linhas = [CABECALHO_CSV.join(';')];

  for (const item of ordenada) {
    linhas.push([
      formatoData(item.data),
      item.combustivel,
      numeroParaCSV(item.km, 0),
      numeroParaCSV(item.litros, 2),
      numeroParaCSV(item.valorTotal, 2),
      item.tanqueCheio ? 'sim' : 'nao',
    ].join(';'));
  }

  return linhas.join('\r\n');
}

function baixarArquivo(nomeArquivo, conteudo) {
  // BOM na frente para o Excel abrir os acentos corretamente
  const blob = new Blob([BOM + conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportarCSV() {
  const lista = carregar();
  if (lista.length === 0) {
    mostrarToast('Nada para exportar ainda.');
    return;
  }
  const hoje = new Date().toISOString().slice(0, 10);
  baixarArquivo(`tanq-${hoje}.csv`, gerarCSV(lista));
  mostrarToast(`${lista.length} abastecimento(s) exportado(s).`);
}

/** Aceita "1.234,56", "1234,56" e "1234.56". */
function parseNumero(texto) {
  if (texto == null) return NaN;
  let s = String(texto).trim().replace(/\s/g, '').replace(/r\$/gi, '');
  if (s === '') return NaN;

  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');

  if (temVirgula && temPonto) {
    // o separador que aparece por último é o decimal
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (temVirgula) {
    s = s.replace(',', '.');
  } else if (temPonto && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" / "12.345.678": grupos de 3 dígitos são milhar, não decimal
    s = s.replace(/\./g, '');
  }

  return parseFloat(s);
}

/** Aceita dd/mm/aaaa e aaaa-mm-dd. */
function parseDataParaISO(texto) {
  const s = String(texto || '').trim();

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  return null;
}

// U+0300..U+036F = marcas de acento que a normalização NFD separa das letras
const REGEX_ACENTOS = new RegExp('[\\u0300-\\u036f]', 'g');

function normalizarTexto(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(REGEX_ACENTOS, '');
}

function parseCombustivel(texto) {
  const alvo = normalizarTexto(texto);
  return TIPOS_ORDEM.find((tipo) => normalizarTexto(tipo) === alvo) || null;
}

function parseTanqueCheio(texto) {
  const s = normalizarTexto(texto);
  if (['nao', 'n', 'false', '0', 'parcial'].includes(s)) return false;
  return true;
}

function dividirLinha(linha, separador) {
  return linha.split(separador).map((celula) => celula.trim().replace(/^"|"$/g, ''));
}

/**
 * Lê o CSV e devolve os abastecimentos válidos. Aceita o arquivo gerado por este
 * app e variações razoáveis (separador `,`, datas ISO, decimais com ponto).
 */
function parseCSV(texto) {
  const limpo = texto.charAt(0) === BOM ? texto.slice(1) : texto;
  const linhas = limpo.split(/\r?\n/).filter((l) => l.trim() !== '');

  if (linhas.length === 0) return { registros: [], invalidos: 0 };

  const separador = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';

  let indices = { data: 0, combustivel: 1, km: 2, litros: 3, valor: 4, tanque_cheio: 5 };
  let inicio = 0;

  const primeira = dividirLinha(linhas[0], separador).map(normalizarTexto);
  if (primeira.includes('data') || primeira.includes('km')) {
    inicio = 1;
    const achar = (...nomes) => {
      for (const nome of nomes) {
        const i = primeira.indexOf(nome);
        if (i !== -1) return i;
      }
      return -1;
    };
    indices = {
      data: achar('data'),
      combustivel: achar('combustivel', 'combustível', 'tipo'),
      km: achar('km', 'odometro', 'quilometragem'),
      litros: achar('litros', 'litro'),
      valor: achar('valor', 'valor_total', 'valortotal', 'total'),
      tanque_cheio: achar('tanque_cheio', 'tanquecheio', 'cheio'),
    };
  }

  const registros = [];
  let invalidos = 0;

  for (let i = inicio; i < linhas.length; i++) {
    const celulas = dividirLinha(linhas[i], separador);
    const pegar = (idx) => (idx >= 0 && idx < celulas.length ? celulas[idx] : '');

    const data = parseDataParaISO(pegar(indices.data));
    const km = parseNumero(pegar(indices.km));
    const litros = parseNumero(pegar(indices.litros));
    const valorTotal = parseNumero(pegar(indices.valor));
    const combustivel = parseCombustivel(pegar(indices.combustivel));

    if (!data || !isFinite(km) || !isFinite(litros) || !isFinite(valorTotal) || km <= 0 || litros <= 0) {
      invalidos++;
      continue;
    }

    registros.push({
      data,
      km,
      litros,
      valorTotal,
      combustivel: combustivel || 'Gasolina',
      tanqueCheio: parseTanqueCheio(pegar(indices.tanque_cheio)),
    });
  }

  return { registros, invalidos };
}

function importarCSV(texto) {
  const { registros, invalidos } = parseCSV(texto);
  const lista = carregar();
  const kmExistentes = new Set(lista.map((item) => item.km));

  let adicionados = 0;
  let ignorados = 0;

  for (const reg of registros) {
    if (kmExistentes.has(reg.km)) {
      ignorados++;
      continue;
    }
    kmExistentes.add(reg.km);
    lista.push({ id: gerarId(), ...reg });
    adicionados++;
  }

  if (adicionados > 0) {
    salvar(lista);
    render();
  }

  return { adicionados, ignorados, invalidos, total: registros.length };
}

function mostrarStatusImportacao(mensagem, tipo) {
  const el = document.getElementById('status-importacao');
  el.textContent = mensagem;
  el.className = `status-importacao ${tipo}`;
  el.hidden = false;
}

/* ==================== inicialização ==================== */

function init() {
  document.getElementById('versao').textContent = VERSAO;

  const isoHoje = new Date().toISOString().slice(0, 10);
  document.getElementById('data').value = isoHoje;

  document.querySelectorAll('[data-ir]').forEach((botao) => {
    botao.addEventListener('click', () => irPara(botao.dataset.ir));
  });

  document.querySelectorAll('[data-relatorio]').forEach((botao) => {
    botao.addEventListener('click', () => {
      document.querySelectorAll('.aba').forEach((a) => a.classList.toggle('ativa', a === botao));
      document.querySelectorAll('.painel-relatorio').forEach((p) => {
        p.classList.toggle('ativo', p.id === `painel-${botao.dataset.relatorio}`);
      });
    });
  });

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

    irPara('inicio');
    mostrarToast('Abastecimento adicionado!');
  });

  document.getElementById('btn-exportar').addEventListener('click', exportarCSV);

  const inputArquivo = document.getElementById('input-arquivo');

  document.getElementById('btn-importar').addEventListener('click', () => inputArquivo.click());

  inputArquivo.addEventListener('change', (ev) => {
    const arquivo = ev.target.files && ev.target.files[0];
    if (!arquivo) return;

    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        const r = importarCSV(String(leitor.result));
        if (r.total === 0) {
          mostrarStatusImportacao('Nenhum abastecimento encontrado no arquivo.', 'erro');
        } else {
          const partes = [`${r.adicionados} importado(s)`];
          if (r.ignorados > 0) partes.push(`${r.ignorados} já existia(m)`);
          if (r.invalidos > 0) partes.push(`${r.invalidos} linha(s) inválida(s)`);
          mostrarStatusImportacao(partes.join(' · '), r.adicionados > 0 ? 'ok' : 'erro');
          if (r.adicionados > 0) mostrarToast('Importação concluída!');
        }
      } catch {
        mostrarStatusImportacao('Não foi possível ler o arquivo. Confira se é um CSV.', 'erro');
      }
      ev.target.value = '';
    };
    leitor.onerror = () => {
      mostrarStatusImportacao('Não foi possível ler o arquivo.', 'erro');
      ev.target.value = '';
    };
    leitor.readAsText(arquivo, 'UTF-8');
  });

  document.getElementById('btn-apagar-tudo').addEventListener('click', () => {
    const total = carregar().length;
    if (total === 0) {
      mostrarToast('Não há dados para apagar.');
      return;
    }
    const ok = confirm(
      `Apagar todos os ${total} abastecimentos deste aparelho?\n\nIsso não pode ser desfeito.`
    );
    if (!ok) return;

    localStorage.removeItem(STORAGE_KEY);
    render();
    mostrarToast('Todos os dados foram apagados.');
  });

  render();
}

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
