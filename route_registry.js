class RouteRegistry {
  constructor(options) {
    this.parseBody = options.parseBody;
    this.sendJson = options.sendJson;
    this.routes = [];
  }

  get(path, handler) {
    this.add('GET', path, handler);
  }

  post(path, handler) {
    this.add('POST', path, handler);
  }

  put(path, handler) {
    this.add('PUT', path, handler);
  }

  patch(path, handler) {
    this.add('PATCH', path, handler);
  }

  delete(path, handler) {
    this.add('DELETE', path, handler);
  }

  add(method, path, handler) {
    this.routes.push({
      method,
      tokens: path.split('/').filter(Boolean),
      handler,
    });
  }

  async handle(req, res, parts) {
    for (const route of this.routes) {
      const params = this.match(route, req.method, parts);
      if (!params) continue;

      await route.handler({
        req,
        res,
        params,
        body: () => this.parseBody(req),
        json: (statusCode, payload) => this.sendJson(res, statusCode, payload),
      });
      return true;
    }
    return false;
  }

  match(route, method, parts) {
    if (route.method !== method || route.tokens.length !== parts.length) {
      return null;
    }

    const params = {};
    for (let i = 0; i < route.tokens.length; i++) {
      const token = route.tokens[i];
      const part = parts[i];
      if (token[0] === ':') {
        params[token.slice(1)] = part;
      } else if (token !== part) {
        return null;
      }
    }
    return params;
  }
}

module.exports = {
  RouteRegistry,
};
