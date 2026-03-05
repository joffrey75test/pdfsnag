export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.redirect(new URL("/app/", url), 302);
    }
    if (url.pathname === "/app") {
      return Response.redirect(new URL("/app/", url), 302);
    }

    let res = await env.ASSETS.fetch(request);
    if (res.status === 404 && url.pathname.startsWith("/app/") && !/\.[a-zA-Z0-9]+$/.test(url.pathname)) {
      res = await env.ASSETS.fetch(new Request(new URL("/app/index.html", url), request));
    }
    return res;
  },
};
