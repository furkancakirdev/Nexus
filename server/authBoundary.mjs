export function applyApiAuthBoundary(app, { required, middleware }) {
  if (required) app.use("/api", middleware);
}
