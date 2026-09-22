const router = require("express").Router();
const controller = require("../controllers/cloudConnectionController");
const { authenticate } = require("../middleware/authMiddleware");
router.use(authenticate);
router.route("/").post(controller.create).get(controller.list);
router
  .route("/:connectionId")
  .get(controller.get)
  .put(controller.update)
  .delete(controller.remove);
module.exports = router;
