FROM node:12
LABEL maintainer="Laminar Developers <hello@laminar.one"
LABEL description="Laminar indexer image"

WORKDIR /usr/src/app

COPY . .

RUN yarn install && \
    yarn cache clean

CMD [ "yarn", "start" ]