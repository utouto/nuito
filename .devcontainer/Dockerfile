FROM mcr.microsoft.com/devcontainers/javascript-node:22-bookworm@sha256:941987777db5f9d90e83bc341076226c406691dd400ec2fa667a990cf0b4f25b

USER root

# Keep AI coding tools and their transitive dependencies reproducible.
COPY .devcontainer/tools/package.json .devcontainer/tools/package-lock.json /opt/devcontainer-tools/

# Codex CLI + OpenCode CLI. OpenCode's pinned postinstall selects and verifies
# the platform-specific binary already recorded in the lockfile.
RUN npm ci --prefix /opt/devcontainer-tools \
    && npm cache clean --force

ENV PATH="/opt/devcontainer-tools/node_modules/.bin:${PATH}"

# Sanity-check the tools during image build so failures happen early.
RUN node --version \
    && npm --version \
    && codex --version \
    && opencode --version

# Named volumes use these directories as their initial contents.
RUN mkdir -p \
        /root/.codex \
        /root/.config/git \
        /root/.config/opencode \
        /root/.local/share/opencode

USER root
