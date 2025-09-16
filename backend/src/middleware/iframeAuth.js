const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { supabaseAdmin } = require('../config/supabase')

/**
 * Garantir que usuário de sistema existe no Supabase
 */
async function ensureSystemUser(id, name, email) {
  try {
    // Verificar se usuário já existe
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', id)
      .single()
    
    if (!existingUser) {
      console.log(`🔨 Criando usuário de sistema: ${name}`)
      
      // Criar um hash de senha para usuários de sistema
      const systemPassword = await bcrypt.hash('system-user-no-login', 12)
      
      const { error } = await supabaseAdmin
        .from('users')
        .insert({
          id,
          name,
          email,
          password: systemPassword,
          role: 'admin',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      
      if (error) {
        console.error('Erro ao criar usuário de sistema:', error)
      } else {
        console.log(`✅ Usuário de sistema criado: ${name}`)
      }
    }
  } catch (error) {
    console.error('Erro ao garantir usuário de sistema:', error)
  }
}

/**
 * Middleware de autenticação para uso em iframe
 * Aceita API Key via header ou query parameter
 * Se IFRAME_MODE=true, permite acesso sem API Key
 */
const iframeAuth = async (req, res, next) => {
  try {
    console.log('🖼️ IframeAuth: Processando autenticação')
    
    // Se IFRAME_MODE está ativo, permitir acesso sem autenticação
    const iframeMode = process.env.IFRAME_MODE === 'true'
    console.log('🖼️ IframeAuth: IFRAME_MODE =', iframeMode)
    
    if (iframeMode) {
      console.log('✅ IframeAuth: Modo iframe ativo, definindo usuário padrão')
      req.apiAuth = {
        authenticated: true,
        method: 'iframe_mode',
        timestamp: new Date().toISOString()
      }
      // Definir usuário padrão para iframe mode
      const iframeUserId = 'aee9c880-9205-4c76-b260-062f6772af16'
      req.user = {
        id: iframeUserId,
        name: 'Agent Web Interface',
        email: 'agent-iframe@neurons.local',
        role: 'admin', // Dar acesso admin no modo iframe
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      // Garantir que o usuário existe no Supabase
      await ensureSystemUser(iframeUserId, 'Iframe User', 'iframe@system.local')
      
      console.log('✅ IframeAuth: Usuário definido:', req.user.name, 'Role:', req.user.role)
      return next()
    }

    // Buscar API Key no header ou query params
    const apiKey = req.headers['x-api-key'] || 
                  req.headers['api-key'] || 
                  req.query.api_key ||
                  req.body.api_key

    if (!apiKey) {
      return res.status(401).json({ 
        error: 'API Key required',
        message: 'Provide API key in header (x-api-key) or query parameter (api_key)'
      })
    }

    // Validar API Key
    const validApiKey = process.env.IFRAME_API_KEY
    if (!validApiKey) {
      console.error('IFRAME_API_KEY not configured in environment')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    if (apiKey !== validApiKey) {
      return res.status(401).json({ 
        error: 'Invalid API Key',
        message: 'The provided API key is not valid'
      })
    }

    // API Key válida - adicionar informações ao request
    req.apiAuth = {
      authenticated: true,
      method: 'api_key',
      timestamp: new Date().toISOString()
    }

    // Definir usuário padrão para API key
    const apiKeyUserId = '00000000-0000-0000-0000-000000000002'
    req.user = {
      id: apiKeyUserId,
      name: 'API Key User',
      email: 'apikey@system.local',
      role: 'admin', // Dar acesso admin para API key
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    // Garantir que o usuário existe no Supabase
    await ensureSystemUser(apiKeyUserId, 'API Key User', 'apikey@system.local')

    next()
  } catch (error) {
    console.error('Error in iframe auth middleware:', error)
    res.status(500).json({ error: 'Authentication error' })
  }
}

/**
 * Middleware opcional para JWT (mantido para compatibilidade)
 */
const jwtAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    
    if (!token) {
      return res.status(401).json({ error: 'Token required' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

/**
 * Middleware híbrido - aceita tanto API Key quanto JWT
 */
const hybridAuth = (req, res, next) => {
  console.log('🔐 HybridAuth: Processando requisição', req.method, req.path)
  
  // Primeiro tenta API Key
  const apiKey = req.headers['x-api-key'] || 
                req.headers['api-key'] || 
                req.query.api_key ||
                req.body.api_key

  if (apiKey) {
    console.log('🔑 HybridAuth: API Key detectada, usando iframeAuth')
    return iframeAuth(req, res, next)
  }

  // Se não tem API Key, tenta JWT
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (token) {
    console.log('🎫 HybridAuth: JWT Token detectado, usando jwtAuth')
    return jwtAuth(req, res, next)
  }

  // Nenhum método de auth fornecido
  console.log('❌ HybridAuth: Nenhum método de autenticação fornecido')
  return res.status(401).json({ 
    error: 'Authentication required',
    message: 'Provide either API key (x-api-key header or api_key parameter) or JWT token (Authorization header)'
  })
}

module.exports = {
  iframeAuth,
  jwtAuth,
  hybridAuth
}