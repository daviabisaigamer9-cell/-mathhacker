// ============================================
// server.js — Núcleo do MathHacker Backend
// Motor de IA: Gemini 2.5 Flash | Banco: SQLite
// Versão: 7.0 — PERSISTÊNCIA + CHAVES ÚNICAS + SEGURANÇA
// ============================================

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// 🔐 CONFIGURAÇÃO
// ============================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEMO_QUERY_LIMIT = 40;


// ============================================
// 🗄️ BANCO DE DADOS SQLITE (Memória de Longo Prazo)
// ============================================
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error("❌ Erro no DB:", err);
    else console.log(`🗄️  Banco de Dados conectado em: ${DB_PATH}`);
});


// Wrappers para usar async/await no SQLite
const runDB = (query, params) => new Promise((res, rej) => db.run(query, params, function(err) { if(err) rej(err); else res(this); }));
const getDB = (query, params) => new Promise((res, rej) => db.get(query, params, (err, row) => err ? rej(err) : res(row)));
const allDB = (query, params) => new Promise((res, rej) => db.all(query, params, (err, rows) => err ? rej(err) : res(rows)));

// Criação das Tabelas (incluindo activation_keys)
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (session_id TEXT PRIMARY KEY, queries_used INTEGER DEFAULT 0, unlocked BOOLEAN DEFAULT 0, xp INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS chat_history (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, role TEXT, content TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS activation_keys (key TEXT PRIMARY KEY, used BOOLEAN DEFAULT 0, used_by TEXT, used_at DATETIME)`);
    // Migração: adiciona coluna xp se não existir (para DBs antigos)
    db.run(`ALTER TABLE users ADD COLUMN xp INTEGER DEFAULT 0`, () => {});
    console.log("🔑  Tabela de Chaves de Ativação pronta");
    console.log("🎮  Sistema de XP/Gamificação ativo");
});

// Função para calcular nível baseado no XP
function getLevel(xp) {
    if (xp >= 500) return { name: '🎯 Sniper do OED', tier: 4, nextXp: null };
    if (xp >= 301) return { name: '🧠 Elite Tático', tier: 3, nextXp: 500 };
    if (xp >= 101) return { name: '💻 Hacker Algébrico', tier: 2, nextXp: 301 };
    return { name: '🔰 Recruta de Equações', tier: 1, nextXp: 101 };
}

// ============================================
// 🧠 INICIALIZAÇÃO DO GEMINI
// ============================================
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `Você é o Sexta-feira, a IA tática do Davi. 
    Especialista em Cap. 5, 6 e 8 do OED da Rede Elite (Monômios, Binômios, Trinômios, Polinômios). 
    Seja parceiro, use gírias (pprt, slk, pdp), mas seja o melhor professor de matemática do mundo.
    Se o aluno mandar foto, resolva passo a passo e mostre as pegadinhas.`
});

// ============================================
// MIDDLEWARES
// ============================================
app.use(express.static(path.join(__dirname)));
app.use(cors({ origin: true, credentials: true })); 
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Middleware de Sessão Fantasma (Fricção Zero)
app.use(async (req, res, next) => {
    let sessionId = req.cookies.p2_session;
    if (!sessionId) {
        sessionId = uuidv4();
        res.cookie('p2_session', sessionId, { maxAge: 9000000000, httpOnly: true });
        try {
            await runDB(`INSERT OR IGNORE INTO users (session_id) VALUES (?)`, [sessionId]);
        } catch (e) { /* ignora duplicata */ }
    }
    req.sessionId = sessionId;
    next();
});

// ============================================
// ROTAS DA API
// ============================================

// ── GET /api/me ─── Retorna dados do usuário (com XP e Nível)
app.get('/api/me', async (req, res) => {
    try {
        let user = await getDB(`SELECT * FROM users WHERE session_id = ?`, [req.sessionId]);
        if (!user) {
            await runDB(`INSERT OR IGNORE INTO users (session_id) VALUES (?)`, [req.sessionId]);
            user = { queries_used: 0, unlocked: 0, xp: 0 };
        }
        const xp = user.xp || 0;
        const level = getLevel(xp);
        res.json({ 
            queries_used: user.queries_used || 0, 
            limit: DEMO_QUERY_LIMIT, 
            unlocked: user.unlocked || 0,
            xp: xp,
            level: level
        });
    } catch (err) {
        res.json({ queries_used: 0, limit: DEMO_QUERY_LIMIT, unlocked: 0, xp: 0, level: getLevel(0) });
    }
});

// ── GET /api/history ─── Retorna histórico de chat do usuário (PERSISTÊNCIA)
app.get('/api/history', async (req, res) => {
    try {
        const messages = await allDB(
            `SELECT role, content FROM chat_history WHERE session_id = ? ORDER BY id ASC`,
            [req.sessionId]
        );
        res.json({ messages: messages || [] });
    } catch (err) {
        res.json({ messages: [] });
    }
});

// ── POST /api/auth ─── Autenticação com Chaves Únicas (SEGURANÇA v7)
app.post('/api/auth', async (req, res) => {
    const inputKey = (req.body.key || '').toUpperCase().trim();
    
    if (!inputKey) {
        return res.status(401).json({ success: false, message: 'Chave não informada.' });
    }

    try {
        // Busca a chave no banco
        const keyRow = await getDB(`SELECT * FROM activation_keys WHERE key = ?`, [inputKey]);
        
        if (!keyRow) {
            return res.status(401).json({ success: false, message: 'Chave inexistente.' });
        }
        
        if (keyRow.used) {
            return res.status(401).json({ success: false, message: 'Chave já utilizada.' });
        }

        // Chave válida: marca como usada e desbloqueia o usuário
        await runDB(`UPDATE activation_keys SET used = 1, used_by = ?, used_at = CURRENT_TIMESTAMP WHERE key = ?`, [req.sessionId, inputKey]);
        await runDB(`UPDATE users SET unlocked = 1 WHERE session_id = ?`, [req.sessionId]);
        
        console.log(`🔓  Chave ${inputKey} ativada pela sessão ${req.sessionId.substring(0, 8)}...`);
        return res.json({ success: true, message: 'Acesso liberado!' });

    } catch (err) {
        console.error('Erro na autenticação:', err);
        return res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});

// ── POST /api/chat ─── Chat Inteligente com Memória
app.post('/api/chat', async (req, res) => {
    const { question, imageData } = req.body;
    let user = await getDB(`SELECT * FROM users WHERE session_id = ?`, [req.sessionId]);

    if (!user) {
        await runDB(`INSERT OR IGNORE INTO users (session_id) VALUES (?)`, [req.sessionId]);
        user = { queries_used: 0, unlocked: 0 };
    }

    if (!user.unlocked && user.queries_used >= DEMO_QUERY_LIMIT) {
        return res.status(403).json({ error: 'Limite DEMO esgotado.' });
    }

    try {
        // Puxa o histórico do banco de dados pra IA lembrar do aluno
        const rawHistory = await allDB(`SELECT role, content FROM chat_history WHERE session_id = ? ORDER BY id ASC`, [req.sessionId]);
        const formattedHistory = rawHistory.map(row => ({ role: row.role, parts: [{ text: row.content }] }));

        const chat = model.startChat({ history: formattedHistory });
        let result;

        if (imageData) {
            const imagePart = { inlineData: { data: imageData.base64, mimeType: imageData.mimeType } };
            const textPart = question || "Analise este exercício passo a passo.";
            result = await chat.sendMessage([textPart, imagePart]);
            await runDB(`INSERT INTO chat_history (session_id, role, content) VALUES (?, ?, ?)`, [req.sessionId, 'user', '[Imagem Enviada] ' + textPart]);
        } else {
            result = await chat.sendMessage(question);
            await runDB(`INSERT INTO chat_history (session_id, role, content) VALUES (?, ?, ?)`, [req.sessionId, 'user', question]);
        }

        const answer = result.response.text();
        await runDB(`INSERT INTO chat_history (session_id, role, content) VALUES (?, ?, ?)`, [req.sessionId, 'model', answer]);
        
        // Incrementa XP (+10 por resposta bem-sucedida)
        await runDB(`UPDATE users SET xp = xp + 10 WHERE session_id = ?`, [req.sessionId]);
        
        if (!user.unlocked) {
            await runDB(`UPDATE users SET queries_used = queries_used + 1 WHERE session_id = ?`, [req.sessionId]);
        }

        const updatedUser = await getDB(`SELECT xp FROM users WHERE session_id = ?`, [req.sessionId]);
        const newXp = updatedUser ? updatedUser.xp : (user.xp || 0) + 10;
        const level = getLevel(newXp);

        res.json({ answer, queries_used: user.queries_used + 1, unlocked: user.unlocked, xp: newXp, level: level });

    } catch (error) {
        console.error('Erro Gemini:', error);
        res.status(500).json({ answer: '⚠️ Eita, mano! Meu núcleo deu erro. Tenta de novo.' });
    }
});

// ── GET /api/generate-test-key ─── Gerador de Chaves (Página HTML Premium)
app.get('/api/generate-test-key', async (req, res) => {
    try {
        const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
        const newKey = `ELITE-${randomPart}`;
        
        await runDB(`INSERT INTO activation_keys (key) VALUES (?)`, [newKey]);
        
        console.log(`\n🎫  ═══════════════════════════════════════`);
        console.log(`🎫  NOVA CHAVE GERADA: ${newKey}`);
        console.log(`🎫  ═══════════════════════════════════════\n`);
        
        // Retorna página HTML estilizada em vez de JSON
        res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gerador de Chaves | MathHacker</title>
    <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700&family=Inter:wght@400;900&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #050505; color: #e5e5e5; font-family: 'Inter', sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .card { background: rgba(14,14,14,0.85); backdrop-filter: blur(24px); border: 1px solid rgba(147,51,234,0.3); border-radius: 24px; padding: 48px; max-width: 480px; width: 90%; text-align: center; box-shadow: 0 0 80px rgba(147,51,234,0.15), 0 8px 40px rgba(0,0,0,0.6); }
        .label { font-size: 10px; font-family: 'Fira Code', monospace; color: #9333ea; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 8px; }
        h1 { font-size: 20px; font-weight: 900; margin-bottom: 24px; }
        .key-box { background: #0a0a0a; border: 2px solid rgba(147,51,234,0.5); border-radius: 16px; padding: 24px; margin: 24px 0; font-family: 'Fira Code', monospace; font-size: 28px; font-weight: 700; color: #c084fc; letter-spacing: 4px; text-shadow: 0 0 20px rgba(147,51,234,0.5); user-select: all; }
        .btn { display: inline-block; background: #9333ea; color: white; border: none; padding: 14px 32px; border-radius: 12px; font-weight: 900; font-size: 13px; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; transition: all 0.2s; margin: 8px; }
        .btn:hover { background: #7c3aed; box-shadow: 0 0 20px rgba(147,51,234,0.4); transform: translateY(-1px); }
        .btn-outline { background: transparent; border: 1px solid rgba(147,51,234,0.4); color: #9333ea; }
        .btn-outline:hover { background: rgba(147,51,234,0.1); }
        .success { color: #4ade80; font-size: 11px; font-family: 'Fira Code', monospace; margin-top: 12px; display: none; }
        .warning { color: #f87171; font-size: 10px; font-family: 'Fira Code', monospace; margin-top: 16px; opacity: 0.7; }
    </style>
</head>
<body>
    <div class="card">
        <div class="label">MathHacker v7.5 • Gerador de Chaves</div>
        <h1>🔑 CHAVE DE ACESSO GERADA</h1>
        <div class="key-box" id="keyValue">${newKey}</div>
        <button class="btn" onclick="copyKey()">📋 Copiar Chave</button>
        <button class="btn btn-outline" onclick="window.location.reload()">🔄 Gerar Nova</button>
        <a href="/app.html" class="btn btn-outline" style="text-decoration:none;">← Voltar ao Chat</a>
        <p class="success" id="copyMsg">✓ Chave copiada!</p>
        <p class="warning">⚠️ Cada chave é de uso único. Após ativação, ela será invalidada.</p>
    </div>
    <script>
        function copyKey() {
            navigator.clipboard.writeText('${newKey}');
            document.getElementById('copyMsg').style.display = 'block';
            setTimeout(() => document.getElementById('copyMsg').style.display = 'none', 3000);
        }
    </script>
</body>
</html>
        `);
    } catch (err) {
        console.error('Erro ao gerar chave:', err);
        res.status(500).send('Erro ao gerar chave.');
    }
});

// ============================================
// 🛡️ ROTAS ADMINISTRATIVAS (Dashboard do Fundador)
// ============================================

// ── GET /api/admin/stats ─── Estatísticas gerais do sistema
app.get('/api/admin/stats', async (req, res) => {
    try {
        const totalUsers = await getDB(`SELECT COUNT(*) as count FROM users`);
        const totalKeys = await getDB(`SELECT COUNT(*) as count FROM activation_keys`);
        const usedKeys = await getDB(`SELECT COUNT(*) as count FROM activation_keys WHERE used = 1`);
        const totalMessages = await getDB(`SELECT COUNT(*) as count FROM chat_history`);
        const unlockedUsers = await getDB(`SELECT COUNT(*) as count FROM users WHERE unlocked = 1`);
        
        res.json({
            users: totalUsers.count || 0,
            keysGenerated: totalKeys.count || 0,
            keysUsed: usedKeys.count || 0,
            totalMessages: totalMessages.count || 0,
            premiumUsers: unlockedUsers.count || 0
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar estatísticas.' });
    }
});

// ── GET /api/admin/logs ─── Últimas mensagens dos alunos
app.get('/api/admin/logs', async (req, res) => {
    try {
        const logs = await allDB(
            `SELECT ch.session_id, ch.role, ch.content, ch.created_at, u.queries_used, u.unlocked 
             FROM chat_history ch 
             LEFT JOIN users u ON ch.session_id = u.session_id 
             WHERE ch.role = 'user'
             ORDER BY ch.id DESC LIMIT 50`
        );
        res.json({ logs: logs || [] });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar logs.' });
    }
});

// ── GET /api/admin/generate-key ─── Gera chave via API (para o dashboard)
app.get('/api/admin/generate-key', async (req, res) => {
    try {
        const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
        const newKey = `ELITE-${randomPart}`;
        await runDB(`INSERT INTO activation_keys (key) VALUES (?)`, [newKey]);
        
        console.log(`\n🎫  ═══════════════════════════════════════`);
        console.log(`🎫  NOVA CHAVE GERADA (via Dashboard): ${newKey}`);
        console.log(`🎫  ═══════════════════════════════════════\n`);
        
        res.json({ success: true, key: newKey });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ── GET /api/admin/keys ─── Lista todas as chaves
app.get('/api/admin/keys', async (req, res) => {
    try {
        const keys = await allDB(`SELECT key, used, used_by, used_at FROM activation_keys ORDER BY rowid DESC`);
        res.json({ keys: keys || [] });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar chaves.' });
    }
});

// ── GET /api/admin/users ─── Lista todos os usuários com XP e Nível
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await allDB(`SELECT session_id, queries_used, unlocked, xp FROM users ORDER BY xp DESC`);
        const usersWithLevel = (users || []).map(u => ({
            ...u,
            level: getLevel(u.xp || 0)
        }));
        res.json({ users: usersWithLevel });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar usuários.' });
    }
});

// ============================================
// 🚀 INICIALIZAÇÃO DO SERVIDOR
// ============================================
app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║   🧠 MathHacker v8.0 — PROTOCOLO PREMIUM     ║`);
    console.log(`║   Motor: Gemini 2.5 Flash (Texto + Visão)     ║`);
    console.log(`╠══════════════════════════════════════════════╣`);
    console.log(`║   🌐 http://localhost:${PORT}                   ║`);
    console.log(`╠══════════════════════════════════════════════╣`);
    console.log(`║   Endpoints Ativos:                          ║`);
    console.log(`║   ├─ GET  /api/me           (Sessão)         ║`);
    console.log(`║   ├─ GET  /api/history      (Histórico)      ║`);
    console.log(`║   ├─ POST /api/auth         (Chaves Únicas)  ║`);
    console.log(`║   ├─ POST /api/chat         (IA Gemini)      ║`);
    console.log(`║   ├─ GET  /api/generate-test-key (Teste)     ║`);
    console.log(`║   └─ GET  /api/admin/*      (Dashboard)      ║`);
    console.log(`╠══════════════════════════════════════════════╣`);
    console.log(`║   🎫 Limite DEMO: ${DEMO_QUERY_LIMIT} consultas gratuitas      ║`);
    console.log(`║   🔑 Sistema de Chaves Únicas: ATIVO         ║`);
    console.log(`║   📊 Dashboard: /dashboard.html              ║`);
    console.log(`╚══════════════════════════════════════════════╝\n`);
});

