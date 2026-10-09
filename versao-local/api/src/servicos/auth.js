// Copyright (c) 2025-2026 João Pedro Simões Rodrigues. Todos os direitos reservados.
// Uso sujeito aos termos do arquivo LICENSE na raiz do repositório.

/**
 * Login de demonstração com JWT e perfis (VENDEDOR, ADMIN).
 *
 * Origem: auth.controller + auth.middleware do backend. Diferenças:
 *  - o segredo do JWT é gerado a cada inicialização (sem .env);
 *  - senhas guardadas como hash scrypt com sal, comparadas em tempo constante;
 *  - usuários e senha de demonstração são públicos e documentados no README.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { ErroDeRegra } = require('../regras/erros');

const SENHA_DEMO = 'demo';

function hash(senha, sal) {
  return crypto.scryptSync(senha, sal, 32).toString('hex');
}

function criarAuth({ segredo = crypto.randomBytes(32).toString('hex'), validade = '8h' } = {}) {
  const usuarios = [
    { id: 1, email: 'vendedor@exemplo.com', nome: 'Vendedor Demo', perfil: 'VENDEDOR' },
    { id: 2, email: 'admin@exemplo.com', nome: 'Admin Demo', perfil: 'ADMIN' },
  ].map((u) => {
    const sal = crypto.randomBytes(16).toString('hex');
    return { ...u, sal, hashSenha: hash(SENHA_DEMO, sal) };
  });

  function login(email, senha) {
    const u = usuarios.find((x) => x.email === String(email).toLowerCase().trim());
    const ok =
      u && crypto.timingSafeEqual(Buffer.from(hash(String(senha), u.sal), 'hex'), Buffer.from(u.hashSenha, 'hex'));
    if (!ok) throw new ErroDeRegra('CREDENCIAIS_INVALIDAS', 'E-mail ou senha inválidos');
    const usuario = { id: u.id, email: u.email, nome: u.nome, perfil: u.perfil };
    return { token: jwt.sign(usuario, segredo, { expiresIn: validade }), usuario };
  }

  /** Middleware: exige Bearer válido; opcionalmente um dos perfis. */
  function exigir(...perfis) {
    return (req, res, next) => {
      const [tipo, token] = String(req.headers.authorization || '').split(' ');
      if (tipo !== 'Bearer' || !token) {
        return res.status(401).json({ success: false, error: { codigo: 'NAO_AUTENTICADO', mensagem: 'Faça login para continuar' } });
      }
      try {
        req.usuario = jwt.verify(token, segredo);
      } catch {
        return res.status(401).json({ success: false, error: { codigo: 'TOKEN_INVALIDO', mensagem: 'Sessão inválida ou expirada' } });
      }
      if (perfis.length && !perfis.includes(req.usuario.perfil)) {
        return res.status(403).json({ success: false, error: { codigo: 'SEM_PERMISSAO', mensagem: 'Perfil sem permissão para esta ação' } });
      }
      return next();
    };
  }

  return { login, exigir };
}

module.exports = { criarAuth, SENHA_DEMO };
