/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

/**
 * Validação de CPF pelos dígitos verificadores (algoritmo público da Receita).
 * Só valida a forma: não consulta nada nem guarda o número.
 */

function somenteDigitos(cpf) {
  return String(cpf).replace(/\D/g, '');
}

function cpfValido(cpf) {
  const d = somenteDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base) => {
    const soma = [...base].reduce((s, n, i) => s + Number(n) * (base.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(d.slice(0, 9)) === Number(d[9]) && dv(d.slice(0, 10)) === Number(d[10]);
}

function formatarCPF(cpf) {
  const d = somenteDigitos(cpf);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

module.exports = { cpfValido, formatarCPF };
