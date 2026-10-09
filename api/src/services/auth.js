/*
 * Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
 * Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.
 */

/**
 * Login de demonstração com JWT e perfis (VENDEDOR, ADMIN).
 *
 * Usado apenas na área administrativa (importação de tabelas e shadow mode);
 * a simulação é pública para quem avalia o portfólio. Em relação ao MVP:
 *  - o segredo do JWT é gerado a cada inicialização (nenhum .env, nada a vazar);
 *  - senhas guardadas como hash scrypt com sal e comparadas em tempo constante;
 *  - usuários e senha de demonstração são públicos e documentados no README.
 */

const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { ErroDeNegocio } = require('../domain/erros');

const SENHA_DEMO = 'demo';
const USUARIOS_DEMO = [
  { id: 1, email: 'vendedor@exemplo.com', nome: 'Vendedor Demo', perfil: 'VENDEDOR' },
  { id: 2, email: 'admin@exemplo.com', nome: 'Admin Demo', perfil: 'ADMIN' },
];

const hash = (senha, sal) => crypto.scryptSync(senha, sal, 32);

function erroHttp(res, status, codigo, mensagem) {
  return res.status(status).json({ success: false, error: { codigo, mensagem } });
}

function criarAuth({ segredo = crypto.randomBytes(32).toString('hex'), validade = '8h' } = {}) {
  const usuarios = USUARIOS_DEMO.map((u) => {
    const sal = crypto.randomBytes(16);
    return { ...u, sal, hashSenha: hash(SENHA_DEMO, sal) };
  });

  function login(email, senha) {
    const u = usuarios.find((x) => x.email === String(email).toLowerCase().trim());
    // Compara mesmo sem usuário, para não revelar pelo tempo quais e-mails existem.
    const alvo = u ?? usuarios[0];
    const confere = crypto.timingSafeEqual(hash(String(senha), alvo.sal), alvo.hashSenha);
    if (!u || !confere) throw new ErroDeNegocio('CREDENCIAIS_INVALIDAS', 'E-mail ou senha inválidos');
    const usuario = { id: u.id, email: u.email, nome: u.nome, perfil: u.perfil };
    return { token: jwt.sign(usuario, segredo, { expiresIn: validade, algorithm: 'HS256' }), usuario };
  }

  /** Middleware: exige Bearer válido e, se informado, um dos perfis. */
  function exigir(...perfis) {
    return (req, res, next) => {
      const [tipo, token] = String(req.headers.authorization || '').split(' ');
      if (tipo !== 'Bearer' || !token) return erroHttp(res, 401, 'NAO_AUTENTICADO', 'Faça login para continuar');
      try {
        req.usuario = jwt.verify(token, segredo, { algorithms: ['HS256'] });
      } catch {
        return erroHttp(res, 401, 'TOKEN_INVALIDO', 'Sessão inválida ou expirada');
      }
      if (perfis.length && !perfis.includes(req.usuario.perfil)) {
        return erroHttp(res, 403, 'SEM_PERMISSAO', 'Perfil sem permissão para esta ação');
      }
      return next();
    };
  }

  return { login, exigir };
}

module.exports = { criarAuth, SENHA_DEMO, USUARIOS_DEMO };
