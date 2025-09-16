// Supabase Models - Substitui os models Sequelize
const SupabaseUser = require('./SupabaseUser')
const SupabaseInstance = require('./SupabaseInstance')
const SupabaseContact = require('./SupabaseContact')
const SupabaseChat = require('./SupabaseChat')
const SupabaseMessage = require('./SupabaseMessage')

// Para compatibilidade com código existente, mantém os nomes originais
const User = SupabaseUser
const Instance = SupabaseInstance
const Contact = SupabaseContact
const Chat = SupabaseChat
const Message = SupabaseMessage

module.exports = {
  // Novos models Supabase
  SupabaseUser,
  SupabaseInstance,
  SupabaseContact,
  SupabaseChat,
  SupabaseMessage,
  
  // Aliases para compatibilidade
  User,
  Instance,
  Contact,
  Chat,
  Message
}