function notFound(req, res) {
  res.status(404).json({ error: 'Route not found' });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ error: 'A record with these details already exists' });
  }
  if (error.name === 'SequelizeValidationError') {
    return res.status(400).json({ error: error.errors[0]?.message || 'Invalid input' });
  }
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Image must be 5 MB or smaller' });
  }
  if (error.message === 'Only JPEG, PNG, and WebP images are allowed') {
    return res.status(415).json({ error: error.message });
  }
  if (error.status && error.status >= 400 && error.status < 600) {
    if (Number.isFinite(error.retryAfterSeconds)) res.set('Retry-After', String(error.retryAfterSeconds));
    return res.status(error.status).json({ error: error.message });
  }
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  console.error(error);
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = { notFound, errorHandler };
