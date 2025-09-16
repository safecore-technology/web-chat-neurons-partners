const { supabaseAdmin } = require('../config/supabase')

class SupabaseUser {
  static async findById(id) {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', id)
        .single()
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error finding user by ID:', error)
      return null
    }
  }

  static async findByEmail(email) {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('email', email)
        .single()
      
      if (error && error.code !== 'PGRST116') throw error // PGRST116 = not found
      return data
    } catch (error) {
      console.error('Error finding user by email:', error)
      return null
    }
  }

  static async create(userData) {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .insert(userData)
        .select()
        .single()
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error creating user:', error)
      throw error
    }
  }

  static async update(id, updates) {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error updating user:', error)
      throw error
    }
  }

  static async updateLastLogin(id) {
    return this.update(id, { last_login: new Date().toISOString() })
  }

  static async findAll(options = {}) {
    try {
      let query = supabaseAdmin.from('users').select('*')
      
      if (options.where?.isActive !== undefined) {
        query = query.eq('is_active', options.where.isActive)
      }
      
      if (options.order) {
        query = query.order(options.order.field, { ascending: options.order.direction === 'ASC' })
      }
      
      const { data, error } = await query
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error finding users:', error)
      return []
    }
  }

  static async delete(id) {
    try {
      const { error } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      return true
    } catch (error) {
      console.error('Error deleting user:', error)
      throw error
    }
  }
}

module.exports = SupabaseUser