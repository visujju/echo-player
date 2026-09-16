FROM node:22-bookworm-slim

# Install system tools needed by Echo
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    python3 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install Deno
RUN curl -fsSL https://deno.land/install.sh | sh

ENV DENO_INSTALL=/root/.deno
ENV PATH="/root/.deno/bin:$PATH"

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]
