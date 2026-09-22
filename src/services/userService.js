const supabase = require('../config/supabase');
const { publicUser } = require('./authService');
async function update(userId, changes) {
  const { data, error } = await supabase.from('users').update(changes).eq('user_id', userId).is('deleted_at', null).select().single();
  if (error) throw error;
  return publicUser(data);
}
async function remove(userId) {
  const { error } = await supabase.from('users').update({ deleted_at: new Date().toISOString() }).eq('user_id', userId).is('deleted_at', null);
  if (error) throw error;
}
module.exports = { update, remove };
