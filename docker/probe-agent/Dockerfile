FROM node:22-alpine

WORKDIR /app

COPY --chown=node:node probe-agent.js ./probe-agent.js
COPY --chown=node:node src/core/logger.js ./src/core/logger.js
COPY --chown=node:node src/probe-agent/job-policy.js ./src/probe-agent/job-policy.js

ENV NODE_ENV=production

USER node

ENTRYPOINT ["node", "probe-agent.js"]
