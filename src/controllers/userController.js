const userService = require('../services/userService');
const { success, failure } = require('../helpers/responseHelper');
const { publicUser } = require('../services/authService');
async function me(req, res) { return success(res, publicUser(req.user)); }
async function updateMe(req, res, next) {
  try { const allowed = ['user_name', 'avatar_url', 'currency', 'timezone']; const changes = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
    if (!Object.keys(changes).length) return failure(res, 'Provide at least one editable profile field');
    if (changes.currency && !/^[A-Z]{3}$/.test(changes.currency)) return failure(res, 'currency must be a three-letter uppercase code');
    return success(res, await userService.update(req.user.user_id, changes)); } catch (e) { next(e); }
}
async function deleteMe(req, res, next) { try { await userService.remove(req.user.user_id); return success(res, { message: 'User deleted' }); } catch (e) { next(e); } }
module.exports = { me, updateMe, deleteMe };
