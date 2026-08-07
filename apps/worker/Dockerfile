# Playwright's own image, because getting Chromium's ~90 shared library
# dependencies right by hand on a slim base is a waste of everyone's time. The
# tag must track the playwright version in package.json — a mismatch between the
# bundled browsers and the client is the usual cause of "Executable doesn't
# exist" at runtime.
FROM mcr.microsoft.com/playwright:v1.50.0-noble

ENV NODE_ENV=production \
    PORT=8090 \
    # Browsers already live in the image; skip the download during npm ci.
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

COPY package.json package-lock.json* ./
# --ignore-scripts skips the postinstall `playwright install`, which would
# re-download browsers that the base image already ships.
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev --ignore-scripts

COPY src ./src

# The image provides the low-privilege `pwuser`. Chromium is the process most
# likely to be handed hostile input here, so it does not run as root.
USER pwuser

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8090)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
