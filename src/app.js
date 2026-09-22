require("dotenv").config();
const express = require("express");
const { failure } = require("./helpers/responseHelper");
const app = express();
app.use(express.json({ limit: "100kb" }));
app.get("/health", (req, res) =>
  res.json({ success: true, data: { status: "ok" } }),
);
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/cloud-connections", require("./routes/cloudConnectionRoutes"));
app.use("/api/aws", require("./routes/awsRoutes"));
app.use("/api/azure", require("./routes/azureRoutes"));
app.use((req, res) => failure(res, "Route not found", 404));
app.use((error, req, res, next) => {
  if (error.code === "23505")
    return failure(res, "A record with this value already exists", 409);
  if (error.name === "JsonWebTokenError")
    return failure(res, "Invalid authentication token", 401);
  console.error(error);
  return failure(
    res,
    error.message || "Internal server error",
    error.status || 500,
  );
});
module.exports = app;
