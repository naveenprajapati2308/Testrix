FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace

COPY pom.xml .
RUN mvn -q dependency:go-offline

COPY src ./src
RUN mvn -q package

FROM maven:3.9.9-eclipse-temurin-21
WORKDIR /app

# Install Chrome + a virtual display (Xvfb). MPHIDB's test code launches Chrome in normal,
# non-headless mode (by design, so it also works unchanged on a Windows desktop with a real
# display) — Xvfb gives it a virtual display to render to inside this container instead.
RUN apt-get update && apt-get install -y \
    wget \
    gnupg2 \
    apt-transport-https \
    ca-certificates \
    curl \
    unzip \
    xvfb \
    fluxbox \
    git \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Node.js, for the Playwright framework (`npx playwright test`). playwright.config.ts uses
# `channel: 'chrome'`, which drives the Google Chrome installed just above instead of
# downloading Playwright's own bundled Chromium — so only the Node/npm toolchain and the
# project's own npm packages are needed here, no separate browser download.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /workspace/target/*.jar /app/framework-runner.jar
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Chrome's sandbox refuses to run as root ("Running as root without --no-sandbox is not
# supported") — rather than add --no-sandbox to MPHIDB's test code, run this whole container
# as a regular user instead, which Chrome's sandbox is fine with.
# /app/playwright-framework/node_modules is pre-created (and chowned) here so that when
# docker-compose mounts a named volume over it, Docker seeds that volume from this empty,
# chromeuser-owned directory instead of leaving it root-owned — otherwise `npm ci` as
# chromeuser (entrypoint.sh) would fail to write into it.
RUN useradd --create-home --shell /bin/bash chromeuser \
    && mkdir -p /app/framework /app/playwright-framework/node_modules \
    && chown -R chromeuser:chromeuser /app

# Xvfb's own X11 transport layer refuses to create /tmp/.X11-unix (the socket dir clients
# connect through) unless running as root ("_XSERVTransmkdir: ERROR: euid != 0") — since
# entrypoint.sh runs Xvfb as chromeuser, that socket dir must already exist with the standard
# world-writable+sticky permissions before we drop root, or every Chrome launch (Selenium and
# Playwright alike) silently can't reach the virtual display and crashes on startup.
RUN mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

USER chromeuser

EXPOSE 9090
ENV FRAMEWORK_PATH=/app/framework
ENV PLAYWRIGHT_FRAMEWORK_PATH=/app/playwright-framework
ENV MAVEN_CMD=mvn
ENV HOME=/home/chromeuser

# playwright.config.ts sets `video: 'retain-on-failure'`, which needs Playwright's own small
# ffmpeg helper binary regardless of which browser channel is used — this is unrelated to
# reusing system Chrome above (that only skips downloading Playwright's *browser* bundles).
# Installed here (once, at image build time) rather than in entrypoint.sh's npm-ci step,
# since it isn't tied to the bind-mounted project and so doesn't need re-doing on every
# container recreate.
RUN npx --yes playwright@1.61.1 install ffmpeg

ENTRYPOINT ["/app/entrypoint.sh"]
