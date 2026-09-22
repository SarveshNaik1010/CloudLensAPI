const bcrypt = require("bcryptjs");
const hashPassword = (password) => bcrypt.hash(password, 12);
const comparePassword = (password, hash) => bcrypt.compare(password, hash);
module.exports = { hashPassword, comparePassword };
