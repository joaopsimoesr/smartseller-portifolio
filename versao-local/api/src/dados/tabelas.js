// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/** Dados FICTÍCIOS de demonstração. */
module.exports = [
  {
    "empreendimentoId": "vila-gama",
    "tipo": "EXCECOES",
    "vigenteDesde": "2026-01-01",
    "dados": {
      "valorPorCota": 1000
    }
  },
  {
    "empreendimentoId": "parque-delta",
    "tipo": "LINEAR",
    "vigenteDesde": "2026-01-01",
    "dados": {
      "linhas": [
        {
          "categoriaPreco": "Bronze",
          "valorCota": 30000,
          "totalMeses": 60,
          "entrada": {
            "parcelas": 10,
            "valorPorCota": 1500
          },
          "sinal": {
            "parcelas": 5,
            "valorPorCota": 1000
          },
          "saldo": {
            "parcelas": 45,
            "valorParcelaPorCota": 610
          }
        },
        {
          "categoriaPreco": "Prata",
          "valorCota": 40000,
          "totalMeses": 70,
          "entrada": {
            "parcelas": 10,
            "valorPorCota": 2000
          },
          "sinal": {
            "parcelas": 5,
            "valorPorCota": 1500
          },
          "saldo": {
            "parcelas": 55,
            "valorParcelaPorCota": 660
          }
        },
        {
          "categoriaPreco": "Ouro",
          "valorCota": 50000,
          "totalMeses": 0,
          "entrada": {
            "parcelas": 0,
            "valorPorCota": 2500
          },
          "sinal": {
            "parcelas": 0,
            "valorPorCota": 2000
          },
          "saldo": {
            "parcelas": 0,
            "valorParcelaPorCota": 0
          }
        }
      ]
    }
  }
];
