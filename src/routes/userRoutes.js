const router = require('express').Router(); const controller = require('../controllers/userController'); const { authenticate } = require('../middleware/authMiddleware');
router.use(authenticate); router.get('/me', controller.me); router.put('/me', controller.updateMe); router.delete('/me', controller.deleteMe); module.exports = router;
